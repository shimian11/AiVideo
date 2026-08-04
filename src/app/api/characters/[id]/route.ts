/**
 * @file 单个角色（Character）的增删改查接口
 * @description
 * 处理 `/api/characters/[id]` 路由：
 * - GET：获取单个角色详情（含所属剧集）
 * - PATCH：更新角色信息（名称、定位、描述、性格、服装、特征、音色、参考图等）
 * - DELETE：删除角色
 *
 * 鉴权方式：通过关联的 series.userId 校验归属权，确保只能操作自己剧集下的角色。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取单个角色详情。
 *
 * 返回角色本身及其所属剧集信息。通过 series.userId 校验当前用户是否有权访问该角色。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为角色 ID
 * @returns 200：角色对象（含 series）；404：角色不存在或不属于当前用户；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const character = await prisma.character.findFirst({
    where: { id },
    include: { series: true },
  });
  // 通过关联剧集的 userId 二次校验归属权
  if (!character || character.series.userId !== session.user.id) {
    return Response.json({ error: "角色不存在" }, { status: 404 });
  }
  return Response.json(character);
}

/**
 * 更新角色信息。
 *
 * 采用白名单局部更新：仅接受指定字段列表中的字符串字段（trim 后写入），
 * 支持更新参考图 URL、参考提示词等生图相关字段。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为角色 ID
 * @returns 200：更新后的 Character 对象；404：角色不存在；401：未登录
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const character = await prisma.character.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!character || character.series.userId !== session.user.id) {
    return Response.json({ error: "角色不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  // 仅收集白名单内的字符串字段，保证不会误写其他字段
  for (const key of ["name", "role", "description", "personality", "outfit", "features", "voicePreset", "referenceUrl", "referencePrompt"]) {
    if (typeof body[key] === "string") data[key] = body[key].trim();
  }

  const updated = await prisma.character.update({ where: { id }, data });
  return Response.json(updated);
}

/**
 * 删除角色。
 *
 * 删除前通过 series.userId 校验归属权。删除后关联的分镜角色记录由 Prisma 级联清理。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为角色 ID
 * @returns 200：`{ ok: true }`；404：角色不存在；401：未登录
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const character = await prisma.character.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!character || character.series.userId !== session.user.id) {
    return Response.json({ error: "角色不存在" }, { status: 404 });
  }

  await prisma.character.delete({ where: { id } });
  return Response.json({ ok: true });
}
