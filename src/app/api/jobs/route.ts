/**
 * @file 任务队列 API - 创建/查询/取消/重试任务 + SSE 实时进度推送
 * @description 处理短剧生成工作流的任务管理，支持批量生成整集分镜
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * 列出当前用户的任务
 * GET /api/jobs
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // 可选状态过滤
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  const items = await prisma.job.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { steps: true } } },
  });

  return Response.json({ items });
}

/**
 * 创建新任务
 * POST /api/jobs
 * @body type - 任务类型: generate_episode | generate_shot
 * @body episodeId - 集ID（generate_episode 时必填）
 * @body shotId - 分镜ID（generate_shot 时必填）
 * @body stepTypes - 要执行的步骤类型数组: ["keyframe", "video", "audio"]
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, episodeId, shotId, stepTypes } = body as {
    type?: string;
    episodeId?: string;
    shotId?: string;
    stepTypes?: string[];
  };

  // 参数校验
  if (!type) return Response.json({ error: "请提供任务类型" }, { status: 400 });

  const validTypes = ["generate_episode", "generate_shot"];
  if (!validTypes.includes(type)) {
    return Response.json({ error: "无效的任务类型" }, { status: 400 });
  }

  // 默认执行所有步骤
  const steps = stepTypes || ["keyframe", "video"];

  // 校验关联实体归属权
  let seriesId: string | undefined;
  let targetShotIds: string[] = [];

  if (type === "generate_episode") {
    if (!episodeId) return Response.json({ error: "请提供集ID" }, { status: 400 });

    // 查询集及其所有分镜，校验归属权
    const episode = await prisma.episode.findFirst({
      where: { id: episodeId },
      include: {
        season: { include: { series: true } },
        scenes: { include: { shots: true } },
      },
    });

    if (!episode || episode.season.series.userId !== session.user.id) {
      return Response.json({ error: "集不存在" }, { status: 404 });
    }

    seriesId = episode.season.series.id;
    // 收集所有分镜ID
    targetShotIds = episode.scenes.flatMap((s) => s.shots.map((sh) => sh.id));

    if (targetShotIds.length === 0) {
      return Response.json({ error: "该集没有分镜，请先拆分剧本" }, { status: 400 });
    }
  } else if (type === "generate_shot") {
    if (!shotId) return Response.json({ error: "请提供分镜ID" }, { status: 400 });

    const shot = await prisma.shot.findFirst({
      where: { id: shotId },
      include: { scene: { include: { episode: { include: { season: { include: { series: true } } } } } } },
    });

    if (!shot || shot.scene.episode.season.series.userId !== session.user.id) {
      return Response.json({ error: "分镜不存在" }, { status: 404 });
    }

    seriesId = shot.scene.episode.season.series.id;
    targetShotIds = [shot.id];
  }

  // 为每个分镜的每个步骤创建 JobStep
  const stepRecords: { stepIndex: number; type: string; input: unknown }[] = [];
  let stepIndex = 0;

  for (const shotId of targetShotIds) {
    for (const stepType of steps) {
      stepRecords.push({
        stepIndex: stepIndex++,
        type: stepType, // keyframe | video | audio
        input: { shotId },
      });
    }
  }

  // 创建 Job + JobSteps（事务保证原子性）
  const job = await prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        userId: session.user.id,
        type,
        status: "queued",
        totalSteps: stepRecords.length,
        seriesId,
        episodeId,
        shotId: type === "generate_shot" ? shotId : null,
      },
    });

    await tx.jobStep.createMany({
      data: stepRecords.map((s) => ({
        jobId: job.id,
        stepIndex: s.stepIndex,
        type: s.type,
        status: "pending",
        input: s.input as any,
      })),
    });

    return job;
  });

  return Response.json(job, { status: 201 });
}
