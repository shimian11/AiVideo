/**
 * @file AI 辅助扩写描述
 * @description
 * 根据 type（character/location/style）将用户简短描述扩写为详细档案。
 * 鉴权 + getDecryptedApiKey 模式同 /api/prompt/enhance。
 */

import { auth } from "@/lib/auth";
import { getDecryptedApiKey } from "@/lib/api-key";
import { chatCompletion, AgnesError } from "@/lib/agnes";

type EntityType = "character" | "location" | "style";

const SYSTEM_PROMPTS: Record<EntityType, string> = {
  character:
    "你是短剧角色设计师。根据用户简短描述，扩写成详细角色档案，含外貌(年龄/性别/发型/五官/身材)、性格、服装、标志性特征。中文输出，详尽具体。",
  location:
    "你是短剧场景设计师。根据用户简短描述，扩写成详细场景描述，含环境布局、氛围、光线、色调。中文输出，详尽具体。",
  style:
    "你是AI绘图风格设计师。根据用户简短描述，扩写成详细画风设定，含美术风格、配色方案、镜头风格。中文输出，分点描述。",
};

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
    const { type, input } = body as { type?: string; input?: string };
    if (!type || !(type in SYSTEM_PROMPTS)) {
      return Response.json({ error: "无效的类型" }, { status: 400 });
    }
    if (!input?.trim()) {
      return Response.json({ error: "请输入简短描述" }, { status: 400 });
    }

    const system = SYSTEM_PROMPTS[type as EntityType];
    const enhanced = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: input.trim() },
      ],
      apiKey,
      { temperature: 0.8, maxTokens: 1024 },
    );
    return Response.json({ text: enhanced.trim() });
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "扩写失败" }, { status: 500 });
  }
}
