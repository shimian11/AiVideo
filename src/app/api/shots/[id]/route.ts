/**
 * @file 单个分镜（Shot）的增删改查接口
 * @description
 * 处理 `/api/shots/[id]` 路由：
 * - GET：获取单个分镜详情（含所属场景→集→季→剧集链路，及关联角色）
 * - PATCH：更新分镜（景别、时长、提示词、台词、状态、生成的图/视频/音频 URL、配置等）
 * - DELETE：删除分镜
 *
 * 鉴权方式：分镜通过 scene.episode.season.series.userId 多级关联校验归属权。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取单个分镜详情。
 *
 * 返回分镜本身，以及多级嵌套的所属链路（场景→集→季→剧集）和关联角色，
 * 便于前端在不持有上下文的情况下判断分镜归属并展示完整信息。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为分镜 ID
 * @returns 200：分镜对象（含嵌套关联）；404：分镜不存在或不属于当前用户；401：未登录
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const shot = await prisma.shot.findFirst({
    where: { id },
    include: {
      scene: { include: { episode: { include: { season: { include: { series: true } } } } } },
      characters: { include: { character: true } },
    },
  });

  // 通过多级关联链路校验归属权
  if (!shot || shot.scene.episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "分镜不存在" }, { status: 404 });
  }

  return Response.json(shot);
}

/**
 * 更新分镜。
 *
 * 采用白名单局部更新：duration 字段需为 number，其余字段（景别、提示词、台词、状态、
 * 生成的图/视频/音频 URL）需为 string；voiceConfig 与 generateConfig 作为对象直接透传。
 *
 * @param req - HTTP 请求，body 为 JSON
 * @param params - 路由参数，id 为分镜 ID
 * @returns 200：更新后的 Shot 对象；404：分镜不存在；401：未登录
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const shot = await prisma.shot.findFirst({
    where: { id },
    include: { scene: { include: { episode: { include: { season: { include: { series: true } } } } } } },
  });
  if (!shot || shot.scene.episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "分镜不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  // duration 为数值类型，其余为字符串类型，分别校验
  for (const key of ["shotType", "duration", "imagePrompt", "videoPrompt", "dialogue", "status", "keyframeUrl", "videoUrl", "audioUrl"]) {
    if (key === "duration" && typeof body[key] === "number") data[key] = body[key];
    else if (typeof body[key] === "string") data[key] = body[key];
  }
  // 语音与生成配置为 JSON 对象，直接透传
  if (body.voiceConfig) data.voiceConfig = body.voiceConfig;
  if (body.generateConfig) data.generateConfig = body.generateConfig;

  const updated = await prisma.shot.update({ where: { id }, data });
  return Response.json(updated);
}

/**
 * 删除分镜。
 *
 * 删除前通过多级关联链路校验归属权。删除后关联的分镜角色记录由 Prisma 级联清理。
 *
 * @param _req - 未使用的请求对象
 * @param params - 路由参数，id 为分镜 ID
 * @returns 200：`{ ok: true }`；404：分镜不存在；401：未登录
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const shot = await prisma.shot.findFirst({
    where: { id },
    include: { scene: { include: { episode: { include: { season: { include: { series: true } } } } } } },
  });
  if (!shot || shot.scene.episode.season.series.userId !== session.user.id) {
    return Response.json({ error: "分镜不存在" }, { status: 404 });
  }

  await prisma.shot.delete({ where: { id } });
  return Response.json({ ok: true });
}
