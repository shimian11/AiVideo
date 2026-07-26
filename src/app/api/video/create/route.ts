import { createVideoTask, AgnesError } from "@/lib/agnes";
import { isValidNumFrames } from "@/lib/constants";

// 创建视频生成任务 (异步)。返回 video_id 供前端轮询。
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      prompt,
      mode,
      image,
      keyframes,
      width,
      height,
      numFrames,
      frameRate,
      negativePrompt,
      seed,
    } = body as {
      prompt?: string;
      mode?: string;
      image?: string;
      keyframes?: string[];
      width?: number;
      height?: number;
      numFrames?: number;
      frameRate?: number;
      negativePrompt?: string;
      seed?: number | string;
    };

    if (!prompt || !prompt.trim()) {
      return Response.json({ error: "请输入提示词" }, { status: 400 });
    }

    const m =
      mode === "img2vid" ? "img2vid" : mode === "keyframes" ? "keyframes" : "text2vid";

    if (m === "img2vid" && !image) {
      return Response.json({ error: "图生视频需要提供一张图片" }, { status: 400 });
    }
    if (m === "keyframes" && (!Array.isArray(keyframes) || keyframes.length < 2)) {
      return Response.json({ error: "关键帧动画至少需要 2 张图片" }, { status: 400 });
    }

    if (numFrames !== undefined && numFrames !== null && !isValidNumFrames(Number(numFrames))) {
      return Response.json(
        { error: "num_frames 必须满足 <= 441 且为 8n+1" },
        { status: 400 },
      );
    }

    const task = await createVideoTask({
      prompt: prompt.trim(),
      mode: m,
      image: image || undefined,
      keyframes: Array.isArray(keyframes) ? keyframes : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      numFrames: numFrames ? Number(numFrames) : undefined,
      frameRate: frameRate ? Number(frameRate) : undefined,
      negativePrompt: negativePrompt || undefined,
      seed: seed !== undefined && seed !== "" ? Number(seed) : undefined,
    });

    if (!task.videoId) {
      return Response.json({ error: "创建任务失败: 未返回 video_id" }, { status: 502 });
    }
    return Response.json(task);
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "创建任务失败" },
      { status: 500 },
    );
  }
}
