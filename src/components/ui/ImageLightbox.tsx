/**
 * 图片预览灯箱：点击图片后全屏查看大图。
 * 点击背景或右上角 ✕ 关闭；点击图片本身不关闭（避免误关）。
 */

"use client";

import { useEffect } from "react";

export function ImageLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4 animate-fade-in"
      onClick={onClose}
    >
      <img
        src={url}
        alt="预览"
        className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute right-4 top-4 rounded-full bg-surface/80 p-2 text-ink transition hover:bg-surface"
      >
        ✕
      </button>
    </div>
  );
}
