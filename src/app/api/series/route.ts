/**
 * @file 剧集（Series）列表与创建接口
 * @description
 * 处理 `/api/series` 路由：
 * - GET：列出当前登录用户的所有剧集（含角色、场景、季的数量统计）
 * - POST：创建新剧集，并自动为其创建「第一季」
 *
 * 所有接口均通过 auth() 校验登录态，数据按 userId 隔离。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * 列出当前用户的所有剧集。
 *
 * 按更新时间倒序返回，并附带角色数、场景数、季数的统计计数，
 * 便于前端在列表页直接展示资源规模。
 *
 * @returns 200：`{ items: Series[] }`；401：未登录
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const items = await prisma.series.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { characters: true, locations: true, seasons: true },
      },
    },
  });
  return Response.json({ items });
}

/**
 * 创建新剧集。
 *
 * 请求体可包含 title、synopsis、genre、targetCount；
 * 其中 title 必填，其余字段缺省时使用默认值（genre 默认「都市」，targetCount 默认 10）。
 * 创建成功后会自动为该剧集创建「第一季」记录，省去用户手动建季的操作。
 *
 * @param request - HTTP 请求，body 为 JSON
 * @returns 201：创建的 Series 对象；400：标题缺失；401：未登录
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { title, synopsis, genre, targetCount } = body as {
    title?: string;
    synopsis?: string;
    genre?: string;
    targetCount?: number;
  };

  if (!title?.trim()) {
    return Response.json({ error: "请输入剧集标题" }, { status: 400 });
  }

  const series = await prisma.series.create({
    data: {
      userId: session.user.id,
      title: title.trim(),
      synopsis: synopsis?.trim() || "",
      genre: genre?.trim() || "都市",
      targetCount: targetCount || 10,
    },
  });

  // 自动创建第一季，保证新剧集立即可挂载集与分镜
  await prisma.season.create({
    data: { seriesId: series.id, number: 1, title: "第一季" },
  });

  return Response.json(series, { status: 201 });
}
