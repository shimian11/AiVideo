import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/api-key";
import { createVideoTask, AgnesError } from "@/lib/agnes";
import { VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/constants";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const apiKey = await getDecryptedApiKey(session.user.id);
  if (!apiKey) {
    return Response.json(
      { error: "请先在设置页填入 Agnes API Key", code: "NO_API_KEY" },
      { status: 409 },
    );
  }
  try {
    const body = await request.json().catch(() => ({}));
    const {
      prompt, mode, image, keyframes, seconds, aspectRatio, seed, seriesId,
    } = body as {
      prompt?: string; mode?: string; image?: string; keyframes?: string[];
      seconds?: string | number; aspectRatio?: string; seed?: number | string; seriesId?: string;
    };

    if (!prompt?.trim()) return Response.json({ error: "请输入提示词" }, { status: 400 });
    const m = mode === "img2vid" ? "img2vid" : mode === "keyframes" ? "keyframes" : "text2vid";
    if (m === "img2vid" && !image) {
      return Response.json({ error: "图生视频需要提供一张图片" }, { status: 400 });
    }
    if (m === "keyframes" && (!Array.isArray(keyframes) || keyframes.length < 2)) {
      return Response.json({ error: "关键帧动画至少需要 2 张图片" }, { status: 400 });
    }
    // 时长收敛到 API 合法区间。旧协议是 num_frames + 8n+1 约束，已废弃；
    // 分镜表历史数据可能是 3 秒，这里夹到下限 4 秒而不是报错。
    let secondsStr: string | undefined;
    if (seconds !== undefined && seconds !== null && seconds !== "") {
      const n = Number(seconds);
      if (!Number.isFinite(n)) {
        return Response.json({ error: "时长必须是数字" }, { status: 400 });
      }
      secondsStr = String(
        Math.min(VIDEO_SECONDS_MAX, Math.max(VIDEO_SECONDS_MIN, Math.round(n))),
      );
    }

    const task = await createVideoTask(
      {
        prompt: prompt.trim(),
        mode: m,
        image: image || undefined,
        keyframes: Array.isArray(keyframes) ? keyframes : undefined,
        seconds: secondsStr,
        aspectRatio: aspectRatio || undefined,
        seed: seed !== undefined && seed !== "" ? Number(seed) : undefined,
      },
      apiKey,
    );
    if (!task.videoId) {
      return Response.json({ error: "创建任务失败: 未返回 video_id" }, { status: 502 });
    }

    const history = await prisma.generationHistory.create({
      data: {
        userId: session.user.id,
        seriesId: seriesId || null,
        type: "VIDEO",
        prompt: prompt.trim(),
        config: {
          mode: m, seconds: secondsStr ?? null, aspectRatio: aspectRatio ?? null,
          seed: seed ?? null,
        },
      },
    });

    return Response.json({ ...task, historyId: history.id });
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "创建任务失败" },
      { status: 500 },
    );
  }
}
