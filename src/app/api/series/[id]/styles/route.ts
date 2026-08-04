/**
 * @file 剧集风格设定（StyleProfile）列表与创建接口
 * @description
 * 处理 `/api/series/[id]/styles` 路由：
 * - GET：列出指定剧集下的所有风格设定
 * - POST：为指定剧集创建新风格设定
 *
 * 风格设定统一整部短剧的美术风格、配色、镜头风格与负面提示词，
 * 在分镜生图时注入到提示词中以保证全剧视觉统一。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 列出剧集的所有风格设定。
 *
 * 创建时间正序返回。一部剧集可配置多个风格设定，供不同场景/分镜选用。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ items: StyleProfile[] }`；404：剧集不存在；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  // 验证剧集归属当前用户
  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const items = await prisma.styleProfile.findMany({
    where: { seriesId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ items });
}

/**
 * 为剧集创建新风格设定。
 *
 * 请求体可包含 name、artStyle、colorPalette、cameraStyle、negativePrompt；
 * 其中 name（风格名）和 artStyle（画风描述）必填，其余可选。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为剧集 ID
 * @returns 201：创建的 StyleProfile 对象；400：必填字段缺失；404：剧集不存在；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, artStyle, colorPalette, cameraStyle, negativePrompt } = body as Record<string, string>;

  if (!name?.trim()) return Response.json({ error: "请输入风格名" }, { status: 400 });
  if (!artStyle?.trim()) return Response.json({ error: "请输入画风描述" }, { status: 400 });

  const style = await prisma.styleProfile.create({
    data: {
      seriesId,
      name: name.trim(),
      artStyle: artStyle.trim(),
      colorPalette: colorPalette?.trim() || null,
      cameraStyle: cameraStyle?.trim() || null,
      negativePrompt: negativePrompt?.trim() || null,
    },
  });
  return Response.json(style, { status: 201 });
}
