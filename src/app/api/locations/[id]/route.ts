/**
 * @file 单个场景（Location）的增删改查接口
 * @description
 * 处理 `/api/locations/[id]` 路由：
 * - GET：获取单个场景详情（含所属剧集）
 * - PATCH：更新场景信息（名称、描述、氛围、光线备注、参考图）
 * - DELETE：删除场景
 *
 * 鉴权方式：通过关联的 series.userId 校验归属权，确保只能操作自己剧集下的场景。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取单个场景详情。
 *
 * 返回场景本身及其所属剧集信息。通过 series.userId 校验当前用户是否有权访问该场景。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为场景 ID
 * @returns 200：场景对象（含 series）；404：场景不存在或不属于当前用户；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const location = await prisma.location.findFirst({
    where: { id },
    include: { series: true },
  });
  // 通过关联剧集的 userId 二次校验归属权
  if (!location || location.series.userId !== session.user.id) {
    return Response.json({ error: "场景不存在" }, { status: 404 });
  }
  return Response.json(location);
}

/**
 * 更新场景信息。
 *
 * 采用白名单局部更新：仅接受指定字段列表中的字符串字段（trim 后写入）。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为场景 ID
 * @returns 200：更新后的 Location 对象；404：场景不存在；401：未登录
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const location = await prisma.location.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!location || location.series.userId !== session.user.id) {
    return Response.json({ error: "场景不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  // 仅收集白名单内的字符串字段
  for (const key of ["name", "description", "mood", "lightingNotes", "referenceUrl"]) {
    if (typeof body[key] === "string") data[key] = body[key].trim();
  }

  const updated = await prisma.location.update({ where: { id }, data });
  return Response.json(updated);
}

/**
 * 删除场景。
 *
 * 删除前通过 series.userId 校验归属权。删除后关联的场景记录由 Prisma 级联清理。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为场景 ID
 * @returns 200：`{ ok: true }`；404：场景不存在；401：未登录
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const location = await prisma.location.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!location || location.series.userId !== session.user.id) {
    return Response.json({ error: "场景不存在" }, { status: 404 });
  }

  await prisma.location.delete({ where: { id } });
  return Response.json({ ok: true });
}
