/**
 * @file AI 生成剧本接口
 * @description
 * 处理 `/api/series/[id]/scripts/generate` 路由（仅 POST）：
 * 调用大模型（Agnes）根据用户提供的大纲，自动生成完整短剧剧本并落库。
 *
 * 生成流程：校验登录与 API Key → 拼装系统提示词与用户提示词 → 调用 chatCompletion →
 * 保存为新的剧本版本（source 标记为 ai_generated）。
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/api-key";
import { chatCompletion, AgnesError } from "@/lib/agnes";
import { scriptSystemPrompt } from "@/lib/ai-prompts";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 调用 AI 生成剧本。
 *
 * 请求体需包含 outline（故事大纲，必填），可选 episodeCount（期望集数，缺省取剧集 targetCount 或 10）。
 * 生成时会将剧集标题、题材、简介注入用户提示词，以约束 AI 的创作方向。
 * 生成完成后保存为新的剧本版本，返回剧本对象与原始内容。
 *
 * @param req - HTTP 请求，body 为 JSON（outline, episodeCount）
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ script, content }`；400：大纲缺失；404：剧集不存在；409：未设置 API Key；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  const series = await prisma.series.findFirst({ where: { id: seriesId, userId: session.user.id } });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  // 校验用户已配置 Agnes API Key，否则无法调用大模型
  const apiKey = await getDecryptedApiKey(session.user.id);
  if (!apiKey) {
    return Response.json({ error: "请先设置 Agnes API Key", code: "NO_API_KEY" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { outline, episodeCount } = body as { outline?: string; episodeCount?: number };

  if (!outline?.trim()) {
    return Response.json({ error: "请提供故事大纲" }, { status: 400 });
  }

  // 集数优先取请求参数，其次取剧集目标集数，最后默认 10
  const count = episodeCount || series.targetCount || 10;

  try {
    // 拼装用户提示词：注入剧集元信息与大纲，约束 AI 按指定集数和题材创作
    const userPrompt = `剧集标题：${series.title}
题材：${series.genre}
故事简介：${series.synopsis}

请根据以下大纲创作 ${count} 集竖屏短剧剧本：

${outline}

要求：
- 共 ${count} 集，每集60-180秒
- ${series.genre} 题材风格
- 角色描写要具体（外貌、服装、特征）
- 场景描写要详细`;

    const content = await chatCompletion(
      [
        { role: "system", content: scriptSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      { temperature: 0.8, maxTokens: 8192 },
    );

    if (!content.trim()) {
      return Response.json({ error: "AI 未返回内容，请重试" }, { status: 502 });
    }

    // 保存生成的剧本为新的版本
    const maxVersion = await prisma.script.aggregate({
      where: { seriesId },
      _max: { version: true },
    });

    const script = await prisma.script.create({
      data: {
        seriesId,
        title: `${series.title} - AI生成v${(maxVersion._max.version || 0) + 1}`,
        content: content.trim(),
        outline: outline.trim(),
        source: "ai_generated",
        version: (maxVersion._max.version || 0) + 1,
      },
    });

    return Response.json({ script, content: content.trim() });
  } catch (err) {
    // 区分 Agnes 业务错误与其他异常，返回对应状态码
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: err instanceof Error ? err.message : "生成失败" }, { status: 500 });
  }
}
