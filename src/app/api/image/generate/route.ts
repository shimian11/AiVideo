import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/api-key";
import { generateImage, AgnesError } from "@/lib/agnes";

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
    const { prompt, size, ratio, mode, inputImage, seriesId } = body as {
      prompt?: string; size?: string; ratio?: string; mode?: string; inputImage?: string; seriesId?: string;
    };
    if (!prompt?.trim()) return Response.json({ error: "请输入提示词" }, { status: 400 });
    if (!size) return Response.json({ error: "请选择尺寸" }, { status: 400 });

    const m = mode === "img2img" ? "img2img" : "text2img";
    const result = await generateImage(
      {
        prompt: prompt.trim(),
        size,
        ratio: ratio || undefined,
        mode: m,
        inputImage: inputImage || undefined,
      },
      apiKey,
    );
    if (!result.url && !result.b64) {
      return Response.json({ error: "生成失败: 未返回图片" }, { status: 502 });
    }

    await prisma.generationHistory.create({
      data: {
        userId: session.user.id,
        seriesId: seriesId || null,
        type: "IMAGE",
        prompt: prompt.trim(),
        config: { size, ratio, mode: m },
        resultUrl: result.url || null,
      },
    });

    return Response.json({ url: result.url, b64: result.b64 });
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
