import { generateImage, AgnesError } from "@/lib/agnes";

// 图片生成: 文生图 / 图生图 (同步调用，可能耗时数十秒)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prompt, size, ratio, mode, inputImage } = body as {
      prompt?: string;
      size?: string;
      ratio?: string;
      mode?: string;
      inputImage?: string;
    };

    if (!prompt || !prompt.trim()) {
      return Response.json({ error: "请输入提示词" }, { status: 400 });
    }
    if (!size || typeof size !== "string") {
      return Response.json({ error: "请选择尺寸" }, { status: 400 });
    }

    const result = await generateImage({
      prompt: prompt.trim(),
      size,
      ratio: ratio || undefined,
      mode: mode === "img2img" ? "img2img" : "text2img",
      inputImage: inputImage || undefined,
    });

    if (!result.url && !result.b64) {
      return Response.json({ error: "生成失败: 未返回图片" }, { status: 502 });
    }

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
