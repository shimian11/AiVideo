/**
 * @file 单个任务详情 API - 查询/取消/重试
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取任务详情（含所有步骤）
 * GET /api/jobs/:id
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.job.findFirst({
    where: { id, userId: session.user.id },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
    },
  });

  if (!job) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }

  return Response.json(job);
}

/**
 * 取消任务（将运行中的步骤标记为取消，未执行的步骤跳过）
 * POST /api/jobs/:id/cancel
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const job = await prisma.job.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!job) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }

  if (body.action === "cancel") {
    // 取消任务：未执行的步骤标记为 skipped
    await prisma.$transaction([
      prisma.job.update({
        where: { id },
        data: { status: "cancelled", completedAt: new Date() },
      }),
      prisma.jobStep.updateMany({
        where: { jobId: id, status: "pending" },
        data: { status: "skipped" },
      }),
    ]);
    return Response.json({ ok: true, status: "cancelled" });
  }

  if (body.action === "retry") {
    // 重试任务：将失败的步骤重新标记为 pending
    await prisma.$transaction([
      prisma.job.update({
        where: { id },
        data: { status: "queued", errorMessage: null, startedAt: null },
      }),
      prisma.jobStep.updateMany({
        where: { jobId: id, status: "failed" },
        data: { status: "pending", errorMessage: null, startedAt: null },
      }),
    ]);
    return Response.json({ ok: true, status: "queued" });
  }

  return Response.json({ error: "未知操作" }, { status: 400 });
}
