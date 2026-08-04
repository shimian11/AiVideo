/**
 * @file 剧集角色（Character）列表与创建接口
 * @description
 * 处理 `/api/series/[id]/characters` 路由：
 * - GET：列出指定剧集下的所有角色（含该角色参与的分镜数）
 * - POST：为指定剧集创建新角色
 *
 * 角色是短剧的核心资源之一，用于后续分镜生图时保持人物视觉一致性。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 列出剧集的所有角色。
 *
 * 创建时间正序返回，并附带每个角色参与的分镜数量（shotCharacters 计数），
 * 便于前端判断角色是否已被分镜引用。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ items: Character[] }`；404：剧集不存在；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  // 验证剧集归属当前用户，防止越权读取他人角色
  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const items = await prisma.character.findMany({
    where: { seriesId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { shotCharacters: true } } },
  });
  return Response.json({ items });
}

/**
 * 为剧集创建新角色。
 *
 * 请求体可包含 name、role、description、personality、outfit、features、voicePreset；
 * 其中 name 和 description 必填，role 缺省为「supporting」（配角）。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为剧集 ID
 * @returns 201：创建的 Character 对象；400：必填字段缺失；404：剧集不存在；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, role, description, personality, outfit, features, voicePreset } = body as Record<string, string>;

  if (!name?.trim()) return Response.json({ error: "请输入角色名" }, { status: 400 });
  if (!description?.trim()) return Response.json({ error: "请输入角色描述" }, { status: 400 });

  const character = await prisma.character.create({
    data: {
      seriesId,
      name: name.trim(),
      role: role?.trim() || "supporting",
      description: description.trim(),
      personality: personality?.trim() || null,
      outfit: outfit?.trim() || null,
      features: features?.trim() || null,
      voicePreset: voicePreset?.trim() || null,
    },
  });
  return Response.json(character, { status: 201 });
}
