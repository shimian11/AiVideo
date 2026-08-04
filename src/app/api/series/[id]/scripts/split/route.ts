/**
 * @file AI 拆分剧本为分镜接口
 * @description
 * 处理 `/api/series/[id]/scripts/split` 路由（仅 POST）：
 * 调用大模型（Agnes）将指定剧本拆分为「集 → 场 → 分镜」三级结构，并写入数据库。
 *
 * 核心流程：
 * 1. 校验登录、剧集归属、API Key、剧本存在性
 * 2. 将剧集已有的角色/场景列表注入系统提示词，约束 AI 只能复用已有角色与场景
 * 3. 调用 chatCompletion 获取 JSON 格式的分镜数据
 * 4. 解析 JSON，构建角色名→角色、场景名→场景的映射
 * 5. 在事务中先清空该季已有集，再逐集/逐场/逐分镜写入，并关联角色
 * 6. 返回创建的集数与分镜数统计
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/api-key";
import { chatCompletion, AgnesError } from "@/lib/agnes";
import { storyboardSystemPrompt } from "@/lib/ai-prompts";

/** Next.js 动态路由上下文类型，params 为 Promise（Next 15+ 行为） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 单个分镜的 AI 返回数据结构 */
interface ShotData {
  number: number;
  shotType: string;
  duration: number;
  imagePrompt: string;
  videoPrompt: string;
  dialogue: string;
  characterNames: string[];
}

/** 单个场景的 AI 返回数据结构（含多个分镜） */
interface SceneData {
  number: number;
  locationName: string;
  description: string;
  shots: ShotData[];
}

/** 单个集的 AI 返回数据结构（含多个场景） */
interface EpisodeData {
  number: number;
  title: string;
  scenes: SceneData[];
}

/** AI 返回的完整分镜结果顶层结构 */
interface StoryboardResult {
  episodes: EpisodeData[];
}

/**
 * 调用 AI 将剧本拆分为分镜并落库。
 *
 * 请求体需包含 scriptId（要拆分的剧本 ID，必填），可选 episodeCount（只拆前 N 集）。
 * 拆分时会把剧集已有的角色与场景列表注入提示词，保证 AI 生成的角色名/场景名
 * 能映射到库中已有记录，从而正确建立分镜与角色、场景的关联。
 * 拆分采用「先删后建」策略：会清空该季已有的集，再写入新的分镜结构。
 *
 * @param req - HTTP 请求，body 为 JSON（scriptId, episodeCount?）
 * @param params - 路由参数，id 为剧集 ID
 * @returns 200：`{ episodesCreated, shotCount, episodes }`；400：参数缺失或无角色/场景；404：剧集/剧本不存在；409：未设置 API Key；401：未登录
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "未登录" }, { status: 401 });
  const { id: seriesId } = await params;

  // 一次性取出剧集及其角色、场景、季信息，后续用于注入提示词与建立映射
  const series = await prisma.series.findFirst({
    where: { id: seriesId, userId: session.user.id },
    include: { characters: true, locations: true, seasons: { orderBy: { number: "asc" } } },
  });
  if (!series) return Response.json({ error: "剧集不存在" }, { status: 404 });

  const apiKey = await getDecryptedApiKey(session.user.id);
  if (!apiKey) {
    return Response.json({ error: "请先设置 Agnes API Key", code: "NO_API_KEY" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { scriptId, episodeCount } = body as { scriptId?: string; episodeCount?: number };

  if (!scriptId) return Response.json({ error: "请提供剧本ID" }, { status: 400 });

  const script = await prisma.script.findFirst({ where: { id: scriptId, seriesId } });
  if (!script) return Response.json({ error: "剧本不存在" }, { status: 404 });

  // 构建角色列表文本：每行一个角色，含名称、描述、服装、特征
  const characterList = series.characters
    .map((c) => `- ${c.name}：${c.description}${c.outfit ? `，服装：${c.outfit}` : ""}${c.features ? `，特征：${c.features}` : ""}`)
    .join("\n");
  // 构建场景列表文本：每行一个场景，含名称、描述、氛围、光线
  const locationList = series.locations
    .map((l) => `- ${l.name}：${l.description}${l.mood ? `，氛围：${l.mood}` : ""}${l.lightingNotes ? `，光线：${l.lightingNotes}` : ""}`)
    .join("\n");

  // 拆分前必须已有角色和场景，否则 AI 无法保持一致性
  if (!characterList) return Response.json({ error: "请先创建角色" }, { status: 400 });
  if (!locationList) return Response.json({ error: "请先创建场景" }, { status: 400 });

  // 取第一季作为集的挂载点（剧集创建时已自动建第一季）
  const season = series.seasons[0];
  if (!season) return Response.json({ error: "请先创建季" }, { status: 400 });

  try {
    // 拼装用户提示词：如指定 episodeCount 则只拆前 N 集
    const userPrompt = `请将以下剧本拆分为分镜脚本${episodeCount ? `，只拆分前 ${episodeCount} 集` : ""}。

剧本内容：
${script.content}`;

    const content = await chatCompletion(
      [
        { role: "system", content: storyboardSystemPrompt(characterList, locationList) },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      { temperature: 0.6, maxTokens: 8192 },
    );

    // 从 AI 返回文本中提取 JSON 字符串
    const jsonStr = extractJson(content);
    if (!jsonStr) {
      return Response.json({ error: "AI 返回格式异常，请重试", raw: content.slice(0, 500) }, { status: 502 });
    }

    let result: StoryboardResult;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      return Response.json({ error: "AI 返回的JSON解析失败", raw: content.slice(0, 500) }, { status: 502 });
    }

    if (!result.episodes?.length) {
      return Response.json({ error: "AI 未返回有效的分镜数据" }, { status: 502 });
    }

    // 构建角色名 -> 角色对象 映射，用于后续关联分镜与角色
    const charMap = new Map(series.characters.map((c) => [c.name, c]));
    // 构建场景名 -> 场景对象 映射，用于后续关联场与场景
    const locMap = new Map(series.locations.map((l) => [l.name, l]));

    // 在事务中写入分镜结构，保证「先删后建」的原子性
    const created = await prisma.$transaction(async (tx) => {
      const episodesCreated = [];

      // 先删除该季已有的集（重新拆分覆盖旧数据）
      await tx.episode.deleteMany({ where: { seasonId: season.id } });

      // 逐集创建
      for (const ep of result.episodes) {
        const episode = await tx.episode.create({
          data: {
            seasonId: season.id,
            scriptId: script.id,
            number: ep.number,
            title: ep.title || `第${ep.number}集`,
            status: "storyboarded",
          },
        });

        // 逐场创建
        for (const sc of ep.scenes || []) {
          // 通过场景名映射到库中场景 ID，匹配不到则置空
          const locationId = locMap.get(sc.locationName)?.id || null;
          const scene = await tx.scene.create({
            data: {
              episodeId: episode.id,
              number: sc.number,
              locationId,
              description: sc.description || null,
            },
          });

          // 逐分镜创建
          for (const sh of sc.shots || []) {
            const shot = await tx.shot.create({
              data: {
                sceneId: scene.id,
                number: sh.number,
                shotType: sh.shotType || "中景",
                duration: sh.duration || 5,
                imagePrompt: sh.imagePrompt || "",
                videoPrompt: sh.videoPrompt || "",
                dialogue: sh.dialogue || "",
                status: "pending",
              },
            });

            // 关联分镜与角色（仅关联能匹配到库中记录的角色）
            for (const charName of sh.characterNames || []) {
              const char = charMap.get(charName);
              if (char) {
                await tx.shotCharacter.create({
                  data: { shotId: shot.id, characterId: char.id },
                });
              }
            }
          }
        }

        episodesCreated.push(episode);
      }

      return episodesCreated;
    });

    // 统计最终创建的分镜总数
    const shotCount = await prisma.shot.count({
      where: { scene: { episode: { seasonId: season.id } } },
    });

    return Response.json({
      episodesCreated: created.length,
      shotCount,
      episodes: created.map((e) => ({ id: e.id, number: e.number, title: e.title })),
    });
  } catch (err) {
    // 区分 Agnes 业务错误与其他异常
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: err instanceof Error ? err.message : "拆分失败" }, { status: 500 });
  }
}

/**
 * 从 AI 返回的文本中提取 JSON 字符串。
 *
 * AI 有时会把 JSON 包在 markdown 代码块中，有时会夹杂额外文字。
 * 本函数依次尝试：1) 提取 ```代码块``` 内容；2) 截取首个 `{` 到末个 `}` 之间的内容。
 *
 * @param text - AI 返回的原始文本
 * @returns 提取出的 JSON 字符串；无法提取时返回 null
 */
function extractJson(text: string): string | null {
  // 尝试从 markdown 代码块中提取
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // 尝试直接解析：截取最外层花括号之间的内容
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}
