// Agnes AI API 客户端封装
// 文档: https://agnes-ai.com/zh-Hans/docs
// 所有调用都在服务端执行，apiKey 由调用方（路由）从用户加密存储中解密后传入。

const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com";

/**
 * 当前使用的模型。
 *
 * 2026-10-17 全部切到免费档，原因：
 * - `agnes-video-v2.0` 已于 2026-09-25 23:59:59 (UTC+8) 正式退役（Retired），
 *   继续调用会直接失败，必须迁移。官方迁移目标为 Video 2.5 系列。
 * - `agnes-2.0-flash` 虽仍可用且免费，但官方已标记为「兼容旧版」。
 * - `agnes-image-2.1-flash` 换成同代最新的 2.5-flash，官方明确说明
 *   "请求与响应参数、支持的尺寸、计费方式与 2.1 Flash 完全一致"，可安全换名。
 *
 * 免费档位（2026-10 官网定价页 current price）：
 * - agnes-3.0-flash            文本  $0 / M tokens
 * - agnes-image-2.5-flash      图像  1K~4K 全部 $0 / 张
 * - agnes-video-2.5-flash      视频  $0 / 秒（限时免费）
 */
export const MODELS = {
  chat: "agnes-3.0-flash",
  image: "agnes-image-2.5-flash",
  video: "agnes-video-2.5-flash",
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

/**
 * 创建视频任务的参数。
 *
 * 注意：这套参数是 Agnes Video 2.5 系列的新协议，与已退役的 v2.0 完全不同。
 * v2.0 用 num_frames / frame_rate / width / height，2.5 系列改为
 * seconds（字符串）+ size（固定档位）+ aspect_ratio，输入媒体也换了字段名。
 *
 * mode 与 API mode 的对应关系：
 * - text2vid  -> API mode "text"      纯文本生成
 * - img2vid   -> API mode "keyframe"  用关键帧作首帧（first_frame）
 * - keyframes -> API mode "keyframe"  首尾帧动画（first_frame + last_frame）
 */
export interface CreateVideoParams {
  prompt: string;
  /** 前端使用的模式名，在此层映射为 API 的 mode */
  mode?: "text2vid" | "img2vid" | "keyframes";
  /** img2vid 模式的首帧图（关键帧 URL） */
  image?: string;
  /** keyframes 模式的首尾帧，[0] 为首帧、[1] 为尾帧 */
  keyframes?: string[];
  /** 时长（秒），API 要求字符串 "4"~"12"，默认 "5" */
  seconds?: string;
  /** 宽高比，如 "9:16"。API 的 size 固定为 "720P" */
  aspectRatio?: string;
  seed?: number;
}

/** Video 2.5 Flash 的时长合法区间（秒），超出会被 API 拒绝 */
export const VIDEO_SECONDS_MIN = 4;
export const VIDEO_SECONDS_MAX = 12;
export const VIDEO_SECONDS_DEFAULT = "5";

/**
 * 把任意时长收敛到 API 合法区间。
 *
 * 存在的理由：分镜表里的 duration 是历史数据，编辑下限曾是 3 秒，
 * 而新 API 下限是 4 秒。若不收敛，旧数据会直接 400。
 *
 * 注意区分两种非有限值：NaN 表示输入已损坏，退化为默认时长；
 * ±Infinity 语义上是"无限大/无限小"，应夹到边界而非退化。
 */
export function clampVideoSeconds(seconds: number): string {
  if (Number.isNaN(seconds)) return VIDEO_SECONDS_DEFAULT;
  const n = Math.min(VIDEO_SECONDS_MAX, Math.max(VIDEO_SECONDS_MIN, Math.round(seconds)));
  return String(n);
}

export interface VideoTask {
  videoId: string;
  taskId: string;
  status: string;
  progress: number;
  seconds?: string;
  size?: string;
}

/**
 * 判断是否为「队列满」类可重试错误。
 *
 * 免费档模型（Video 2.5 Flash）优先级低，高峰期频繁返回
 * 503 video_queue_full。这不是参数问题，稍等即可进队列，
 * 但不重试的话用户点一次「生成视频」就直接失败，体验极差。
 */
function isRetryableQueueError(err: AgnesError): boolean {
  if (err.status !== 503 && err.status !== 429) return false;
  if (err.body && typeof err.body === "object") {
    const code = (err.body as Record<string, unknown>).code;
    if (typeof code === "string") return code.includes("queue_full");
  }
  // 没有结构化 code 时，503/429 一律按可重试处理
  return true;
}

/** 队列满重试参数：最多 5 次，间隔 2s 起步翻倍（累计约 62s） */
const QUEUE_RETRY_MAX = 5;
const QUEUE_RETRY_BASE_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createVideoTask(
  params: CreateVideoParams,
  apiKey: string,
): Promise<VideoTask> {
  const { prompt, mode = "text2vid", image, keyframes, seconds, aspectRatio, seed } = params;

  const body: Record<string, unknown> = {
    model: MODELS.video,
    prompt,
    // Flash 档位只支持 720P，传其他值会 HTTP 400
    size: "720P",
    seconds: seconds ?? VIDEO_SECONDS_DEFAULT,
  };
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (seed !== undefined) body.seed = seed;

  if (mode === "img2vid" && image) {
    // 单图作首帧：对应 API 的 keyframe 模式，只提供 first_frame
    body.mode = "keyframe";
    body.first_frame = image;
  } else if (mode === "keyframes" && keyframes && keyframes.length >= 2) {
    body.mode = "keyframe";
    body.first_frame = keyframes[0];
    body.last_frame = keyframes[1];
  } else {
    body.mode = "text";
  }

  // 队列满时按指数退避重试。免费档在高峰期几乎必然遇到，
  // 不重试会导致用户视角下「视频生成随机失败」。
  let lastError: unknown;
  for (let attempt = 0; attempt <= QUEUE_RETRY_MAX; attempt++) {
    try {
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
    } catch (err) {
      lastError = err;
      const canRetry =
        err instanceof AgnesError &&
        isRetryableQueueError(err) &&
        attempt < QUEUE_RETRY_MAX;
      if (!canRetry) throw err;
      await sleep(QUEUE_RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }

  throw lastError;
}

export interface VideoResult {
  status: string;
  progress: number;
  url?: string;
  seconds?: string;
  size?: string;
  error?: string;
}

/**
 * 查询视频任务结果。
 *
 * 坑：2.5 系列的轮询必须带上 `model_name`，否则 keyframe / reference 模式的
 * 任务查不到结果（只有 text 模式可以省略）。漏带这个参数表现为
 * 「任务创建成功但永远停在 pending」，极难排查。
 */
export async function getVideoResult(
  videoId: string,
  apiKey: string,
): Promise<VideoResult> {
  const query = new URLSearchParams({ video_id: videoId, model_name: MODELS.video });
  const data = (await agnesFetch(
    `/agnesapi?${query.toString()}`,
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
