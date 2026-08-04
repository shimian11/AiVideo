/**
 * @file 单个集（Episode）的查询与更新接口
 * @description
 * 处理 `/api/episodes/[id]` 路由：
 * - GET：获取集详情，含该集下所有场景、分镜、分镜关联的角色，以及素材资源
 * - PATCH：更新集信息（标题、状态、时长）
 *
 * 鉴权方式：通过 season.series.userId 校验归属权，确保只能操作自己剧集下的集。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取集详情（含完整分镜结构）。
 *
 * 一次性返回集 → 场景 → 分镜 → 角色的嵌套结构，外加素材资源，
 * 供前端集详情页整页渲染分镜板使用，避免多次请求。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为集 ID
 * @returns 200：集对象（含嵌套关联）；404：集不存在或不属于当前用户；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: episodeId } = await params;

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId },
    include: {
      season: { include: { series: true } },
      script: true,
      scenes: {
        orderBy: { number: "asc" },
        include: {
          location: true,
          shots: {
            orderBy: { number: "asc" },
            include: {
              characters: { include: { character: true } },
            },
          },
        },
      },
      assets: true,
    },
  });

  // 通过 season.series.userId 二次校验归属权
  if (!episode || episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "集不存在" }, { status: 404 });
  }

  return Response.json(episode);
}

/**
 * 更新集信息。
 *
 * 采用局部更新：仅更新请求体中提供的字段（标题、状态、时长）。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为集 ID
 * @returns 200：更新后的 Episode 对象；404：集不存在；401：未登录
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: episodeId } = await params;

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId },
    include: { season: { include: { series: true } } },
  });
  if (!episode || episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "集不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.duration === "number") data.duration = body.duration;

  const updated = await prisma.episode.update({ where: { id: episodeId }, data });
  return Response.json(updated);
}
