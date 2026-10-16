/**
 * @file 画布图标集（内联 SVG）
 * @description
 * 统一用 SVG 线性图标，不用 emoji 或生僻 Unicode 符号。
 *
 * 原因：彩色 emoji（如 👤 U+1F464）依赖系统 emoji 字体，
 * 在无 emoji 字体的环境（headless Chrome、Linux 服务器、部分老旧系统）
 * 会渲染成空白或方框；⠿ ⌂ 一类符号也常缺字体支持。
 * 浏览器自测时已实测到角色图标与工具栏图标整体消失的问题。
 *
 * 风格：1.5px 线性描边，24 视窗，currentColor 继承文字色。
 */

export type IconName =
  | "zoom-in"
  | "zoom-out"
  | "fit"
  | "reset"
  | "layout"
  | "trash"
  | "close"
  | "text"
  | "script"
  | "image"
  | "video"
  | "audio"
  | "character"
  | "location"
  | "style"
  | "shot"
  | "film"
  | "link"
  | "refresh"
  | "plus"
  | "external";

/** 各图标的路径定义。视窗统一 24x24，描边不填充。 */
const PATHS: Record<IconName, string> = {
  "zoom-in": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5L21 21M11 8v6M8 11h6",
  "zoom-out": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5L21 21M8 11h6",
  fit: "M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4",
  reset: "M4 12a8 8 0 1 1 2.6 5.9M4 17v-5h5",
  layout: "M4 5h6v5H4zM14 5h6v9h-6zM4 14h6v5H4zM14 18h6v1h-6z",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6",
  close: "M6 6l12 12M18 6L6 18",
  text: "M5 6h14M12 6v12M9 18h6",
  script: "M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4M9 12h6M9 16h6",
  image: "M4 5h16v14H4zM4 15l4-4 3 3 3-3 6 6M15 9a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
  video: "M3 6h11v12H3zM14 10l7-4v12l-7-4",
  audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  character: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0",
  location: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  style: "M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-.6-2-2-2h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4 6 6 0 0 0-8-6zM7.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  shot: "M4 4h16v16H4zM4 9h16M9 9v11M15 4l5 5",
  film: "M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4",
  link: "M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  plus: "M12 5v14M5 12h14",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5",
};

export function Icon({
  name,
  size = 14,
  className = "",
  strokeWidth = 1.6,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
