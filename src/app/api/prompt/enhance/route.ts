import { chatCompletion, AgnesError } from "@/lib/agnes";

// 检测输入语言：含中文字符视为中文，否则视为英文
function detectLanguage(text: string): "zh" | "en" {
  return /[一-鿿]/.test(text) ? "zh" : "en";
}

// 用 Agnes 2.0 Flash 把用户的简短描述扩写成结构化提示词，
// 并保持与输入相同的语言（中文输入->中文输出，英文输入->英文输出）
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prompt, target } = body as { prompt?: string; target?: string };
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "请输入提示词" }, { status: 400 });
    }
    const isVideo = target === "video";
    const lang = detectLanguage(prompt);
    const langInstruction =
      lang === "zh"
        ? "请用中文输出优化后的提示词。"
        : "Output the rewritten prompt in English.";
    const base = isVideo
      ? "You are a prompt engineer for AI video generation. Rewrite the user's short description into a rich, structured video prompt. Include: subject, action, scene, camera motion, lighting, and style."
      : "You are a prompt engineer for AI image generation. Rewrite the user's short description into a rich, structured image prompt. Include: subject, scene/environment, style, lighting, composition, and quality.";
    const system = `${base} ${langInstruction} Output ONLY the rewritten prompt, no quotes, no explanation.`;

    const enhanced = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
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
