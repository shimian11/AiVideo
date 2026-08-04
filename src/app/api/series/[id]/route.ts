/**
 * @file 单个剧集（Series）的增删改查接口
 * @description
 * 处理 `/api/series/[id]` 路由：
 * - GET：获取剧集详情，含角色、场景、风格、季（及季下的集）、剧本等完整关联数据
 * - PATCH：更新剧集基本信息（标题、简介、题材、目标集数、状态、封面）
 * - DELETE：删除剧集（关联数据由 Prisma 级联删除）
 *
 * 所有接口均通过 auth() 校验登录态，并通过 userId 限定只能操作当前用户的剧集。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取剧集详情。
 *
 * 一次性返回剧集的完整关联结构：角色、场景、风格、季（含集）、剧本版本，
 * 供前端剧集详情页整页渲染使用，避免多次请求。
 *
 * @param _request - 未使用的请求对象
 * @param params - 路由参数，含剧集 id
 * @returns 200：剧集对象（含关联）；404：剧集不存在或不属于当前用户；401：未登录
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  const series = await prisma.series.findFirst({
    where: { id, userId: session.user.id },
    include: {
      characters: { orderBy: { createdAt: "asc" } },
      locations: { orderBy: { createdAt: "asc" } },
      styles: { orderBy: { createdAt: "asc" } },
      seasons: {
        orderBy: { number: "asc" },
        include: {
          episodes: { orderBy: { number: "asc" } },
        },
      },
      scripts: { orderBy: { version: "desc" } },
    },
  });

  if (!series) {
    return Response.json({ error: "剧集不存在" }, { status: 404 });
  }
  return Response.json(series);
}

/**
 * 更新剧集基本信息。
 *
 * 采用局部更新策略：仅更新请求体中提供的字段（按类型校验），
 * 未提供的字段保持不变。可更新字段包括标题、简介、题材、目标集数、状态、封面 URL。
 *
 * @param request - HTTP 请求，body 为 JSON
 * @param params - 路由参数，含剧集 id
 * @returns 200：更新后的 Series 对象；404：剧集不存在；401：未登录
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { title, synopsis, genre, targetCount, status, coverUrl } = body as Record<string, unknown>;

  // 先校验归属权，防止越权修改他人剧集
  const existing = await prisma.series.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return Response.json({ error: "剧集不存在" }, { status: 404 });
  }

  // 仅收集请求体中明确提供且类型正确的字段
  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = title.trim();
  if (typeof synopsis === "string") data.synopsis = synopsis.trim();
  if (typeof genre === "string") data.genre = genre.trim();
  if (typeof targetCount === "number") data.targetCount = targetCount;
  if (typeof status === "string") data.status = status;
  if (typeof coverUrl === "string") data.coverUrl = coverUrl;

  const updated = await prisma.series.update({ where: { id }, data });
  return Response.json(updated);
}

/**
 * 删除剧集。
 *
 * 删除前先校验归属权，删除后 Prisma 会按 schema 的级联规则自动删除
 * 关联的季、集、场景、分镜、角色、剧本等数据。
 *
 * @param _request - 未使用的请求对象
 * @param params - 路由参数，含剧集 id
 * @returns 200：`{ ok: true }`；404：剧集不存在；401：未登录
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.series.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return Response.json({ error: "剧集不存在" }, { status: 404 });
  }

  await prisma.series.delete({ where: { id } });
  return Response.json({ ok: true });
}
