// 前端与后端共享的预设常量

export const IMAGE_SIZES = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K · 推荐" },
  { value: "3K", label: "3K" },
  { value: "4K", label: "4K" },
] as const;

export const IMAGE_RATIOS = [
  { value: "1:1", label: "1:1 方形" },
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:3", label: "4:3 横版" },
  { value: "16:9", label: "16:9 横版" },
  { value: "9:16", label: "9:16 竖版" },
  { value: "2:3", label: "2:3 竖版" },
  { value: "3:2", label: "3:2 横版" },
  { value: "21:9", label: "21:9 超宽" },
] as const;

/**
 * 视频宽高比预设。
 *
 * 背景：Agnes Video 2.5 系列的 size 固定为 "720P"（Flash 档位只支持这一档，
 * 传其他值直接 HTTP 400），具体尺寸改由 aspect_ratio 决定。因此原先那套
 * width/height 组合预设已无意义，这里换成宽高比预设。
 *
 * 各宽高比在 720P 下的实际输出像素（官方文档）：
 *   21:9 → 1680x720   16:9 → 1280x704   4:3 → 960x720
 *   1:1  → 720x720    3:4  → 720x960    9:16 → 720x1280
 */
export const VIDEO_ASPECT_RATIOS = [
  { value: "9:16", label: "竖版 9:16 · 720P" },
  { value: "16:9", label: "横版 16:9 · 720P" },
  { value: "1:1", label: "方形 1:1 · 720P" },
  { value: "3:4", label: "竖版 3:4 · 720P" },
  { value: "4:3", label: "横版 4:3 · 720P" },
  { value: "21:9", label: "超宽 21:9 · 720P" },
] as const;

/**
 * 视频时长预设（秒）。
 *
 * 旧协议用 num_frames + frame_rate 且要求 8n+1（81/121/241/441 帧），
 * 新协议直接传 seconds 字符串，合法区间 "4"~"12"，默认 "5"。
 */
export const VIDEO_DURATIONS = [
  { seconds: "4", label: "4 秒" },
  { seconds: "5", label: "5 秒 · 推荐" },
  { seconds: "8", label: "8 秒" },
  { seconds: "10", label: "10 秒" },
  { seconds: "12", label: "12 秒" },
] as const;

/** 视频时长合法区间（秒），与 agnes.ts 的 clampVideoSeconds 保持一致 */
export const VIDEO_SECONDS_MIN = 4;
export const VIDEO_SECONDS_MAX = 12;
