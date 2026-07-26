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

// 视频尺寸预设。API 会自动把不精确的尺寸映射到最近的标准档位 (480p/720p/1080p)。
export const VIDEO_SIZE_PRESETS = [
  { value: "1280x720", label: "横版 16:9 · 720p", width: 1280, height: 720 },
  { value: "720x1280", label: "竖版 9:16 · 720p", width: 720, height: 1280 },
  { value: "720x720", label: "方形 1:1 · 720p", width: 720, height: 720 },
  { value: "1152x768", label: "横版 3:2 · 默认", width: 1152, height: 768 },
  { value: "1024x576", label: "横版 16:9 · 480p", width: 1024, height: 576 },
  { value: "576x1024", label: "竖版 9:16 · 480p", width: 576, height: 1024 },
] as const;

// 视频时长预设。num_frames 必须 <= 441 且满足 8n+1 规则。
export const VIDEO_DURATIONS = [
  { numFrames: 81, frameRate: 24, label: "约 3 秒" },
  { numFrames: 121, frameRate: 24, label: "约 5 秒 · 推荐" },
  { numFrames: 241, frameRate: 24, label: "约 10 秒" },
  { numFrames: 441, frameRate: 24, label: "约 18 秒" },
] as const;

/** 校验 num_frames 是否满足 Agnes 约束: <= 441 且 8n+1 */
export function isValidNumFrames(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= 441 && (n - 1) % 8 === 0;
}
