// Agnes AI API 客户端封装
// 文档: https://agnes-ai.com/zh-Hans/docs
// 所有调用都在服务端执行，apiKey 由调用方（路由）从用户加密存储中解密后传入。

const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com";

export const MODELS = {
  chat: "agnes-2.0-flash",
  image: "agnes-image-2.1-flash",
  video: "agnes-video-v2.0",
} as const;

/** Agnes API 调用异常，携带 HTTP 状态码便于路由层映射 */
export class AgnesError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "AgnesError";
    this.status = status;
    this.body = body;
  }
}

function getBaseUrl(): string {
  return (process.env.AGNES_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const obj = data as Record<string, unknown> & { error?: unknown };
    if (obj.error && typeof obj.error === "object") {
      const e = obj.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
    }
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
  }
  return undefined;
}

interface AgnesFetchOptions extends RequestInit {
  timeoutMs?: number;
}

async function agnesFetch(
  path: string,
  apiKey: string,
  init: AgnesFetchOptions = {},
): Promise<unknown> {
  const baseUrl = getBaseUrl();
  const { timeoutMs = 180000, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: {
        ...(headers as Record<string, string> | undefined),
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const message = extractErrorMessage(data) || `Agnes API 请求失败 (HTTP ${res.status})`;
      throw new AgnesError(message, res.status, data);
    }
    return data;
  } catch (err) {
    if (err instanceof AgnesError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AgnesError("请求超时，Agnes 生成耗时较长，请稍后重试", 408);
    }
    throw new AgnesError(err instanceof Error ? err.message : "网络请求失败", 500);
  } finally {
    clearTimeout(timer);
  }
}

// ============ 聊天 / 提示词优化 ============

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  apiKey: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const data = (await agnesFetch(
    "/v1/chat/completions",
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        model: MODELS.chat,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    },
  )) as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content ?? "";
}

// ============ 图片生成 ============

export interface GenerateImageParams {
  prompt: string;
  size: string;
  ratio?: string;
  mode?: "text2img" | "img2img";
  inputImage?: string;
}

export interface GeneratedImage {
  url: string | null;
  b64: string | null;
}

export async function generateImage(
  params: GenerateImageParams,
  apiKey: string,
): Promise<GeneratedImage> {
  const { prompt, size, ratio, mode = "text2img", inputImage } = params;
  const extraBody: Record<string, unknown> = { response_format: "url" };
  if (mode === "img2img") {
    if (!inputImage) throw new AgnesError("图生图需要提供输入图像 URL", 400);
    extraBody.image = [inputImage];
  }
  const body: Record<string, unknown> = {
    model: MODELS.image,
    prompt,
    size,
    extra_body: extraBody,
  };
  if (ratio) body.ratio = ratio;

  const data = (await agnesFetch(
    "/v1/images/generations",
    apiKey,
    { method: "POST", body: JSON.stringify(body), timeoutMs: 360000 },
  )) as { data?: Array<{ url?: string; b64_json?: string }> };
  const item = data?.data?.[0];
  return { url: item?.url ?? null, b64: item?.b64_json ?? null };
}

// ============ 视频生成 (异步任务) ============

export interface CreateVideoParams {
  prompt: string;
  mode?: "text2vid" | "img2vid" | "keyframes";
  image?: string;
  keyframes?: string[];
  width?: number;
  height?: number;
  numFrames?: number;
  frameRate?: number;
  negativePrompt?: string;
  seed?: number;
}

export interface VideoTask {
  videoId: string;
  taskId: string;
  status: string;
  progress: number;
  seconds?: string;
  size?: string;
}

export async function createVideoTask(
  params: CreateVideoParams,
  apiKey: string,
): Promise<VideoTask> {
  const {
    prompt, mode = "text2vid", image, keyframes, width, height,
    numFrames, frameRate, negativePrompt, seed,
  } = params;

  const body: Record<string, unknown> = { model: MODELS.video, prompt };
  if (width) body.width = width;
  if (height) body.height = height;
  if (numFrames) body.num_frames = numFrames;
  if (frameRate) body.frame_rate = frameRate;
  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (seed !== undefined) body.seed = seed;

  if (mode === "img2vid" && image) {
    body.image = image;
  } else if (mode === "keyframes" && keyframes && keyframes.length > 0) {
    body.extra_body = { image: keyframes, mode: "keyframes" };
  }

  const data = (await agnesFetch(
    "/v1/videos",
    apiKey,
    { method: "POST", body: JSON.stringify(body), timeoutMs: 60000 },
  )) as {
    id?: string; task_id?: string; video_id?: string;
    status?: string; progress?: number; seconds?: string; size?: string;
  };

  return {
    videoId: data?.video_id || data?.task_id || data?.id || "",
    taskId: data?.task_id || data?.id || "",
    status: data?.status ?? "queued",
    progress: data?.progress ?? 0,
    seconds: data?.seconds,
    size: data?.size,
  };
}

export interface VideoResult {
  status: string;
  progress: number;
  url?: string;
  seconds?: string;
  size?: string;
  error?: string;
}

export async function getVideoResult(
  videoId: string,
  apiKey: string,
): Promise<VideoResult> {
  const data = (await agnesFetch(
    `/agnesapi?video_id=${encodeURIComponent(videoId)}`,
    apiKey,
    { method: "GET", timeoutMs: 30000 },
  )) as {
    status?: string; progress?: number; seconds?: string; size?: string;
    url?: string; metadata?: { url?: string }; error?: unknown;
  };

  let error: string | undefined;
  if (typeof data?.error === "string") error = data.error;
  else if (data?.error && typeof data.error === "object") {
    const e = data.error as Record<string, unknown>;
    if (typeof e.message === "string") error = e.message;
  }

  return {
    status: data?.status ?? "unknown",
    progress: data?.progress ?? 0,
    url: data?.url || data?.metadata?.url,
    seconds: data?.seconds,
    size: data?.size,
    error,
  };
}

// ============ 下载安全: 媒体 URL 白名单 (防 SSRF) ============

export function isAllowedMediaUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (
    host === "agnes-ai.com" ||
    host.endsWith(".agnes-ai.com") ||
    host === "agnes-ai.space" ||
    host.endsWith(".agnes-ai.space")
  ) {
    return true;
  }
  if (host === "storage.googleapis.com" && u.pathname.toLowerCase().startsWith("/agnes-aigc/")) {
    return true;
  }
  return false;
}
