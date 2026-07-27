import { auth } from "@/lib/auth";
import { getDecryptedApiKey } from "@/lib/api-key";
import { chatCompletion, AgnesError } from "@/lib/agnes";

function detectLanguage(text: string): "zh" | "en" {
  return /[一-鿿]/.test(text) ? "zh" : "en";
}

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
    const { prompt, target } = body as { prompt?: string; target?: string };
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "请输入提示词" }, { status: 400 });
    }
    const isVideo = target === "video";
    const lang = detectLanguage(prompt);
    const langInstruction =
      lang === "zh" ? "请用中文输出优化后的提示词。" : "Output the rewritten prompt in English.";
    const base = isVideo
      ? "You are a prompt engineer for AI video generation. Rewrite the user's short description into a rich, structured video prompt. Include: subject, action, scene, camera motion, lighting, and style."
      : "You are a prompt engineer for AI image generation. Rewrite the user's short description into a rich, structured image prompt. Include: subject, scene/environment, style, lighting, composition, and quality.";
    const system = `${base} ${langInstruction} Output ONLY the rewritten prompt, no quotes, no explanation.`;

    const enhanced = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      apiKey,
      { temperature: 0.8, maxTokens: 320 },
    );
    return Response.json({ prompt: enhanced.trim() });
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "提示词优化失败" }, { status: 500 });
  }
}
