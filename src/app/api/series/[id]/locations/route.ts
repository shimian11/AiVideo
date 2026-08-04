/**
 * @file 剧集场景（Location）列表与创建接口
 * @description
 * 处理 `/api/series/[id]/locations` 路由：
 * - GET：列出指定剧集下的所有场景（含该场景被分镜引用的次数）
 * - POST：为指定剧集创建新场景
 *
 * 场景是短剧的核心资源之一，用于后续分镜生图时保持环境视觉一致性。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 列出剧集的所有场景。
 *
 * 创建时间正序返回，并附带每个场景被分镜引用的次数（scenes 计数），
 * 便于前端判断场景是否已被使用。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ items: Location[] }`；404：剧集不存在；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  // 验证剧集归属当前用户，防止越权读取他人场景
  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const items = await prisma.location.findMany({
    where: { seriesId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { scenes: true } } },
  });
  return Response.json({ items });
}

/**
 * 为剧集创建新场景。
 *
 * 请求体可包含 name、description、mood、lightingNotes；
 * 其中 name 和 description 必填，mood（氛围）与 lightingNotes（光线备注）可选。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为剧集 ID
 * @returns 201：创建的 Location 对象；400：必填字段缺失；404：剧集不存在；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, description, mood, lightingNotes } = body as Record<string, string>;

  if (!name?.trim()) return Response.json({ error: "请输入场景名" }, { status: 400 });
  if (!description?.trim()) return Response.json({ error: "请输入场景描述" }, { status: 400 });

  const location = await prisma.location.create({
    data: {
      seriesId,
      name: name.trim(),
      description: description.trim(),
      mood: mood?.trim() || null,
      lightingNotes: lightingNotes?.trim() || null,
    },
  });
  return Response.json(location, { status: 201 });
}
