/**
 * @file 剧集剧本（Script）列表与创建接口
 * @description
 * 处理 `/api/series/[id]/scripts` 路由：
 * - GET：列出指定剧集下的所有剧本版本（含每个剧本拆分出的集数）
 * - POST：手动创建剧本（区别于 AI 生成的剧本，source 标记为 manual）
 *
 * 剧本支持多版本管理，每次创建都会自增版本号，便于回溯历史版本。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 列出剧集的所有剧本版本。
 *
 * 按版本号倒序返回（最新版本在前），并附带每个剧本已拆分出的集数，
 * 便于前端判断剧本是否已被分镜拆分。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ items: Script[] }`；404：剧集不存在；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  // 验证剧集归属当前用户
  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const items = await prisma.script.findMany({
    where: { seriesId },
    orderBy: { version: "desc" },
    include: { _count: { select: { episodes: true } } },
  });
  return Response.json({ items });
}

/**
 * 手动创建剧本。
 *
 * 请求体可包含 title、content、outline、source；
 * 其中 title 和 content 必填。版本号自动取当前最大版本号 + 1，保证版本单调递增。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为剧集 ID
 * @returns 201：创建的 Script 对象；400：必填字段缺失；404：剧集不存在；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { title, content, outline, source } = body as Record<string, string>;

  if (!title?.trim()) return Response.json({ error: "请输入剧本标题" }, { status: 400 });
  if (!content?.trim()) return Response.json({ error: "请输入剧本内容" }, { status: 400 });

  // 版本号自增：取当前剧集下最大版本号 + 1
  const maxVersion = await prisma.script.aggregate({
    where: { seriesId },
    _max: { version: true },
  });

  const script = await prisma.script.create({
    data: {
      seriesId,
      title: title.trim(),
      content: content.trim(),
      outline: outline?.trim() || null,
      source: source || "manual",
      version: (maxVersion._max.version || 0) + 1,
    },
  });
  return Response.json(script, { status: 201 });
}
