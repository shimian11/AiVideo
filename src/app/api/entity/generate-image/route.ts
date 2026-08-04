/**
 * @file 实体 AI 生图
 * @description
 * 为角色/场景/风格生成参考图：取实体 → 校验归属 → 拼装 prompt → generateImage
 * → 写入 generationHistory → 更新实体 referenceUrl → 返回 { url }。
 * 鉴权 + getDecryptedApiKey 模式同 /api/image/generate。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/api-key";
import { generateImage, AgnesError } from "@/lib/agnes";
import {
  buildCharacterPortraitPrompt,
  buildLocationReferencePrompt,
} from "@/lib/prompt-builder";

type EntityType = "character" | "location" | "style";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const apiKey = await getDecryptedApiKey(session.user.id);
  if (!apiKey) {
    return Response.json(
      { error: "请先在设置页填入 Agnes API Key", code: "NO_API_KEY" },
      { status: 409 },
    );
  }
  try {
    const body = await request.json().catch(() => ({}));
    const { type, id } = body as { type?: string; id?: string };
    if (!type || !["character", "location", "style"].includes(type)) {
      return Response.json({ error: "无效的类型" }, { status: 400 });
    }
    if (!id) {
      return Response.json({ error: "缺少实体 ID" }, { status: 400 });
    }
    const t = type as EntityType;

    // 取实体 + 校验归属权
    let prompt: string;
    let seriesId: string;

    if (t === "character") {
      const entity = await prisma.character.findUnique({
        where: { id },
        include: { series: true },
      });
      if (!entity || entity.series.userId !== session.user.id) {
        return Response.json({ error: "角色不存在" }, { status: 404 });
      }
      prompt = buildCharacterPortraitPrompt(entity);
      seriesId = entity.seriesId;
    } else if (t === "location") {
      const entity = await prisma.location.findUnique({
        where: { id },
        include: { series: true },
      });
      if (!entity || entity.series.userId !== session.user.id) {
        return Response.json({ error: "场景不存在" }, { status: 404 });
      }
      prompt = buildLocationReferencePrompt(entity);
      seriesId = entity.seriesId;
    } else {
      const entity = await prisma.styleProfile.findUnique({
        where: { id },
        include: { series: true },
      });
      if (!entity || entity.series.userId !== session.user.id) {
        return Response.json({ error: "风格不存在" }, { status: 404 });
      }
      prompt = `${entity.artStyle}${entity.colorPalette ? "，" + entity.colorPalette : ""}${entity.cameraStyle ? "，" + entity.cameraStyle : ""}，风格示例图，高质量`;
      seriesId = entity.seriesId;
    }

    const result = await generateImage(
      {
        prompt,
        size: "2K",
        ratio: t === "style" ? "1:1" : "9:16",
        mode: "text2img",
      },
      apiKey,
    );
    if (!result.url) {
      return Response.json({ error: "生成失败: 未返回图片" }, { status: 502 });
    }

    // 存历史
    await prisma.generationHistory.create({
      data: {
        userId: session.user.id,
        seriesId,
        type: "IMAGE",
        prompt,
        config: { entityType: t, entityId: id },
        resultUrl: result.url,
      },
    });

    // 更新实体 referenceUrl
    if (t === "character") {
      await prisma.character.update({
        where: { id },
        data: { referenceUrl: result.url },
      });
    } else if (t === "location") {
      await prisma.location.update({
        where: { id },
        data: { referenceUrl: result.url },
      });
    } else {
      await prisma.styleProfile.update({
        where: { id },
        data: { referenceUrl: result.url },
      });
    }

    return Response.json({ url: result.url });
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "生成失败" },
      { status: 500 },
    );
  }
}
