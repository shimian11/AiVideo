/**
 * @file Worker 核心引擎 - 任务队列消费者
 * @description 独立运行的 Node 进程，轮询 Job 表执行生成任务
 *
 * 启动方式: npm run worker (开发) 或 node dist/worker.js (生产)
 *
 * 工作流程:
 * 1. 轮询 status=queued 的 Job，用 FOR UPDATE SKIP LOCKED 原子领取
 * 2. 按顺序执行 JobStep（断点续传：跳过已完成的步骤）
 * 3. 每个步骤调用对应的生成函数（关键帧/视频/配音）
 * 4. 更新 Job/Shot 状态，前端通过 SSE 获取进度
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { generateImage, createVideoTask, getVideoResult } from "./lib/agnes";
import { buildImagePrompt, buildVideoPrompt } from "./lib/prompt-builder";

const prisma = new PrismaClient({ log: ["error", "warn"] });

/** Worker 配置 */
const CONFIG = {
  pollIntervalMs: 2000, // 轮询间隔
  maxConcurrentJobs: 2, // 同时执行的最大 Job 数
  retryMaxAttempts: 3, // 单步骤最多重试次数
  retryDelayMs: 5000, // 重试间隔
  videoPollIntervalMs: 4000, // 视频轮询间隔
  videoTimeoutMs: 600000, // 视频超时 10 分钟
  imageTimeoutMs: 360000, // 图片超时 6 分钟
};

/** 当前正在运行的 Job 数量 */
let runningJobs = 0;

// ============ 主循环 ============

/**
 * Worker 主循环：持续轮询并执行任务
 */
async function workerLoop() {
  console.log("[Worker] 启动任务队列消费者...");

  while (true) {
    try {
      if (runningJobs >= CONFIG.maxConcurrentJobs) {
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      // 原子领取下一个任务
      const job = await claimNextJob();
      if (!job) {
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      // 异步执行（不阻塞主循环，支持并发）
      runningJobs++;
      executeJob(job.id).finally(() => {
        runningJobs--;
      });
    } catch (err) {
      console.error("[Worker] 主循环异常:", err);
      await sleep(5000);
    }
  }
}

// ============ 任务领取 ============

/**
 * 原子领取下一个 queued 状态的任务
 * 使用 PostgreSQL FOR UPDATE SKIP LOCKED 避免多 Worker 竞争
 * @returns 任务ID，或 null（无可用任务）
 */
async function claimNextJob(): Promise<{ id: string } | null> {
  const result = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'running', "startedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'queued'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id;
  `;
  return result[0] || null;
}

// ============ 任务执行 ============

/**
 * 执行一个任务的所有步骤
 * @param jobId - 任务ID
 */
async function executeJob(jobId: string) {
  console.log(`[Worker] 开始执行任务: ${jobId}`);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });

  if (!job) {
    console.error(`[Worker] 任务不存在: ${jobId}`);
    return;
  }

  let doneSteps = 0;
  let hasError = false;

  for (const step of job.steps) {
    // 断点续传：跳过已完成和已跳过的步骤
    if (step.status === "completed" || step.status === "skipped") {
      doneSteps++;
      continue;
    }

    // 检查任务是否已取消
    const currentJob = await prisma.job.findUnique({ where: { id: jobId } });
    if (currentJob?.status === "cancelled") {
      console.log(`[Worker] 任务已取消: ${jobId}`);
      return;
    }

    // 标记步骤为运行中
    await prisma.jobStep.update({
      where: { id: step.id },
      data: { status: "running", startedAt: new Date() },
    });

    try {
      // 执行步骤
      const result = await executeStep(step);
      doneSteps++;

      // 标记步骤完成
      await prisma.jobStep.update({
        where: { id: step.id },
        data: {
          status: "completed",
          output: result as any,
          completedAt: new Date(),
        },
      });

      // 更新总体进度
      const progress = Math.round((doneSteps / job.totalSteps) * 100);
      await prisma.job.update({
        where: { id: jobId },
        data: { progress, doneSteps },
      });

      console.log(`[Worker] 步骤完成: ${step.type} (${doneSteps}/${job.totalSteps})`);
    } catch (err) {
      hasError = true;
      const errorMsg = err instanceof Error ? err.message : "未知错误";

      // 标记步骤失败
      await prisma.jobStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          errorMessage: errorMsg,
          completedAt: new Date(),
        },
      });

      console.error(`[Worker] 步骤失败: ${step.type}`, errorMsg);
      // 继续执行后续步骤（不因单个步骤失败而中断整个任务）
    }
  }

  // 更新任务最终状态
  const finalProgress = Math.round((doneSteps / job.totalSteps) * 100);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: hasError ? "failed" : "completed",
      progress: finalProgress,
      doneSteps,
      completedAt: new Date(),
      errorMessage: hasError ? "部分步骤失败" : null,
    },
  });

  console.log(`[Worker] 任务完成: ${jobId} (进度: ${finalProgress}%, 有失败: ${hasError})`);
}

// ============ 步骤执行 ============

/**
 * 执行单个步骤（根据类型分发）
 * @param step - 步骤记录
 * @returns 步骤输出结果
 */
async function executeStep(step: { id: string; type: string; input: unknown }): Promise<unknown> {
  const input = step.input as { shotId?: string } | null;
  if (!input?.shotId) {
    throw new Error("步骤缺少 shotId 参数");
  }

  // 查询分镜及其关联的角色、场景、风格
  const shot = await prisma.shot.findUnique({
    where: { id: input.shotId },
    include: {
      characters: { include: { character: true } },
      scene: {
        include: {
          location: true,
          episode: {
            include: {
              season: {
                include: {
                  series: { include: { styles: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!shot) throw new Error(`分镜不存在: ${input.shotId}`);

  // 获取用户 API Key
  const userId = shot.scene.episode.season.series.userId;
  const apiKey = await getDecryptedApiKey(userId);
  if (!apiKey) throw new Error("用户未设置 Agnes API Key");

  // 获取风格设定（取第一个）
  const style = shot.scene.episode.season.series.styles[0] || null;
  const characters = shot.characters.map((sc) => sc.character);
  const location = shot.scene.location;

  switch (step.type) {
    case "keyframe":
      return executeKeyframeStep(shot, characters, location, style, apiKey);
    case "video":
      return executeVideoStep(shot, apiKey);
    case "audio":
      return executeAudioStep(shot, apiKey);
    default:
      throw new Error(`未知步骤类型: ${step.type}`);
  }
}

/**
 * 步骤1: 生成关键帧图片
 * 调用 Agnes Image API 生成竖屏关键帧
 */
async function executeKeyframeStep(
  shot: any,
  characters: any[],
  location: any,
  style: any,
  apiKey: string,
): Promise<{ url: string }> {
  // 拼装完整的文生图提示词
  const fullPrompt = buildImagePrompt(shot, characters, location, style);
  console.log(`[Worker] 生成关键帧 - 分镜#${shot.number}: ${fullPrompt.slice(0, 60)}...`);

  // 调用 Agnes 生图（竖屏 2K）
  const result = await generateImage(
    {
      prompt: fullPrompt,
      size: "2K",
      ratio: "9:16",
      mode: "text2img",
    },
    apiKey,
  );

  if (!result.url) {
    throw new Error("Agnes 未返回图片 URL");
  }

  // 保存关键帧 URL 到分镜
  await prisma.shot.update({
    where: { id: shot.id },
    data: {
      keyframeUrl: result.url,
      status: shot.status === "pending" ? "keyframe_done" : shot.status,
    },
  });

  return { url: result.url };
}

/**
 * 步骤2: 生成视频（图生视频）
 * 用关键帧作为首帧，调用 Agnes Video API 生成动态视频
 */
async function executeVideoStep(shot: any, apiKey: string): Promise<{ url: string }> {
  // 检查关键帧是否已生成
  if (!shot.keyframeUrl) {
    throw new Error("关键帧尚未生成，无法创建视频");
  }

  // 拼装视频提示词
  const fullVideoPrompt = buildVideoPrompt(shot);
  console.log(`[Worker] 生成视频 - 分镜#${shot.number}: ${fullVideoPrompt.slice(0, 60)}...`);

  // 创建视频任务（图生视频模式）
  const task = await createVideoTask(
    {
      prompt: fullVideoPrompt,
      mode: "img2vid",
      image: shot.keyframeUrl,
      width: 720,
      height: 1280,
      numFrames: Math.min(shot.duration * 24, 121), // 根据 duration 计算帧数，上限 121（约5秒）
      frameRate: 24,
    },
    apiKey,
  );

  if (!task.videoId) {
    throw new Error("Agnes 未返回 video_id");
  }

  // 轮询视频生成状态
  const videoUrl = await pollVideoResult(task.videoId, apiKey, shot.id);

  // 保存视频 URL 到分镜
  await prisma.shot.update({
    where: { id: shot.id },
    data: {
      videoUrl,
      status: "video_done",
    },
  });

  return { url: videoUrl };
}

/**
 * 步骤3: 生成配音
 * 如果分镜有台词，使用 Edge TTS 生成语音；无台词则跳过
 */
async function executeAudioStep(shot: any, _apiKey: string): Promise<{ url: string | null; skipped: boolean }> {
  // 无台词则跳过
  if (!shot.dialogue?.trim()) {
    console.log(`[Worker] 分镜#${shot.number} 无台词，跳过配音`);
    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "completed" },
    });
    return { url: null, skipped: true };
  }

  console.log(`[Worker] 生成配音 - 分镜#${shot.number}: "${shot.dialogue.slice(0, 30)}..."`);

  // 使用 Edge TTS（免费，无需 API Key）
  // 通过 HTTP 调用 edge-tts 的公开接口或本地服务
  // 这里使用 Agnes chat 模型生成 SSML，然后调用外部 TTS
  // 由于 Agnes API 不提供 TTS，我们暂时标记为跳过，并记录台词
  // 后续可接入 Edge TTS / ElevenLabs / 火山引擎等

  // TODO: 接入实际 TTS 服务
  // 当前方案：将台词存入 voiceConfig，前端预览时可手动配音
  await prisma.shot.update({
    where: { id: shot.id },
    data: {
      status: "completed",
      voiceConfig: {
        text: shot.dialogue,
        voice: "zh-CN-XiaoxiaoNeural",
        speed: 1.0,
        pending: true, // 标记待 TTS 服务接入
      } as any,
    },
  });

  return { url: null, skipped: true };
}

// ============ 视频轮询 ============

/**
 * 轮询视频生成结果
 * @param videoId - Agnes 视频任务ID
 * @param apiKey - 用户 API Key
 * @param shotId - 分镜ID（用于日志）
 * @returns 视频 URL
 */
async function pollVideoResult(videoId: string, apiKey: string, shotId: string): Promise<string> {
  const startTime = Date.now();
  let errors = 0;

  while (true) {
    if (Date.now() - startTime > CONFIG.videoTimeoutMs) {
      throw new Error("视频生成超时（超过 10 分钟）");
    }

    try {
      const result = await getVideoResult(videoId, apiKey);

      if (result.status === "completed" && result.url) {
        console.log(`[Worker] 视频生成完成 - 分镜${shotId}`);
        return result.url;
      }

      if (result.status === "failed") {
        throw new Error(result.error || "视频生成失败");
      }

      errors = 0; // 成功查询后重置错误计数
    } catch (err) {
      errors++;
      if (errors >= 6) {
        throw new Error(`视频状态查询多次失败: ${err instanceof Error ? err.message : "未知错误"}`);
      }
    }

    await sleep(CONFIG.videoPollIntervalMs);
  }
}

// ============ 辅助函数 ============

/**
 * 获取并解密用户的 Agnes API Key
 * @param userId - 用户ID
 * @returns 解密后的 API Key，或 null
 */
async function getDecryptedApiKey(userId: string): Promise<string | null> {
  const rec = await prisma.userApiKey.findUnique({ where: { userId } });
  if (!rec) return null;
  return decrypt(rec.encryptedKey);
}

/**
 * AES-256-GCM 解密（内联实现，避免路径别名问题）
 * @param packed - 加密的字符串 (iv.ciphertext.authTag)
 * @returns 解密后的明文
 */
function decrypt(packed: string): string {
  const parts = packed.split(".");
  if (parts.length !== 3) throw new Error("密文格式错误");

  const [ivB64, ctB64, tagB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const ct = Buffer.from(ctB64, "base64");
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

/** 从环境变量获取加密密钥 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY 未配置");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY 必须为 32 字节");
  return buf;
}

/** 睡眠函数 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 启动 Worker
workerLoop().catch((err) => {
  console.error("[Worker] 致命错误:", err);
  process.exit(1);
});
