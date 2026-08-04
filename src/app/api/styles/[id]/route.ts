/**
 * @file 单个风格设定（StyleProfile）的增删改查接口
 * @description
 * 处理 `/api/styles/[id]` 路由：
 * - GET：获取单个风格设定详情（含所属剧集）
 * - PATCH：更新风格设定（名称、画风、配色、镜头风格、负面提示词）
 * - DELETE：删除风格设定
 *
 * 鉴权方式：通过关联的 series.userId 校验归属权，确保只能操作自己剧集下的风格设定。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取单个风格设定详情。
 *
 * 返回风格设定本身及其所属剧集信息。通过 series.userId 校验当前用户是否有权访问。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为风格设定 ID
 * @returns 200：风格设定对象（含 series）；404：不存在或不属于当前用户；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const style = await prisma.styleProfile.findFirst({
    where: { id },
    include: { series: true },
  });
  // 通过关联剧集的 userId 二次校验归属权
  if (!style || style.series.userId !== session.user.id) {
    return Response.json({ error: "风格不存在" }, { status: 404 });
  }
  return Response.json(style);
}

/**
 * 更新风格设定。
 *
 * 采用白名单局部更新：仅接受指定字段列表中的字符串字段（trim 后写入）。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为风格设定 ID
 * @returns 200：更新后的 StyleProfile 对象；404：不存在；401：未登录
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const style = await prisma.styleProfile.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!style || style.series.userId !== session.user.id) {
    return Response.json({ error: "风格不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  // 仅收集白名单内的字符串字段
  for (const key of ["name", "artStyle", "colorPalette", "cameraStyle", "negativePrompt"]) {
    if (typeof body[key] === "string") data[key] = body[key].trim();
  }

  const updated = await prisma.styleProfile.update({ where: { id }, data });
  return Response.json(updated);
}

/**
 * 删除风格设定。
 *
 * 删除前通过 series.userId 校验归属权。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为风格设定 ID
 * @returns 200：`{ ok: true }`；404：不存在；401：未登录
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const style = await prisma.styleProfile.findFirst({
    where: { id },
    include: { series: true },
  });
  if (!style || style.series.userId !== session.user.id) {
    return Response.json({ error: "风格不存在" }, { status: 404 });
  }

  await prisma.styleProfile.delete({ where: { id } });
  return Response.json({ ok: true });
}
