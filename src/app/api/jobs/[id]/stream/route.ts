/**
 * @file SSE 实时进度推送 - Server-Sent Events 流
 * @description 前端通过 EventSource 连接此端点，实时接收任务进度更新
 * GET /api/jobs/:id/stream
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // 校验任务归属权
  const job = await prisma.job.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!job) {
    return new Response("Not Found", { status: 404 });
  }

  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 发送初始状态
      const sendUpdate = async () => {
        const currentJob = await prisma.job.findFirst({
          where: { id },
          include: { steps: { orderBy: { stepIndex: "asc" } } },
        });

        if (!currentJob) {
          controller.close();
          return;
        }

        const data = {
          id: currentJob.id,
          status: currentJob.status,
          progress: currentJob.progress,
          doneSteps: currentJob.doneSteps,
          totalSteps: currentJob.totalSteps,
          errorMessage: currentJob.errorMessage,
          steps: currentJob.steps.map((s) => ({
            id: s.id,
            stepIndex: s.stepIndex,
            type: s.type,
            status: s.status,
            errorMessage: s.errorMessage,
          })),
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        // 任务结束则关闭流
        if (["completed", "failed", "cancelled"].includes(currentJob.status)) {
          controller.close();
          return true; // 停止轮询
        }
        return false;
      };

      // 立即发送一次
      const done = await sendUpdate();
      if (done) return;

      // 每 2 秒轮询一次
      const interval = setInterval(async () => {
        try {
          const finished = await sendUpdate();
          if (finished) {
            clearInterval(interval);
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);

      // 客户端断开连接时清理
      _req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
