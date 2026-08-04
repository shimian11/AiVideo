/**
 * @file 分镜排序 API - 更新分镜序号
 * @description 支持拖拽排序后批量更新分镜顺序
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 批量更新集内分镜的排序
 * PATCH /api/episodes/:id/reorder
 * @body items - [{ id: string, number: number }] 按新顺序排列的分镜ID和序号
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id: episodeId } = await params;

  // 校验集归属权
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId },
    include: { season: { include: { series: true } } },
  });
  if (!episode || episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "集不存在" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { items } = body as { items?: { id: string; number: number }[] };

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "请提供排序数据" }, { status: 400 });
  }

  // 事务批量更新分镜序号
  await prisma.$transaction(
    items.map((item) =>
      prisma.shot.update({
        where: { id: item.id },
        data: { number: item.number },
      }),
    ),
  );

  return Response.json({ ok: true });
}
