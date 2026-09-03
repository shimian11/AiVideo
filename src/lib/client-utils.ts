// 前端浏览器端工具函数

/** 触发下载: 调用后端 /api/download 代理抓取 Agnes 媒体并落盘 + 流式返回给浏览器 */
export function triggerDownload(url: string, type: "image" | "video", name: string) {
  const a = document.createElement("a");
  a.href = `/api/download?url=${encodeURIComponent(url)}&type=${type}&name=${encodeURIComponent(name)}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 把上传的文件转成 data URI (用于图生图 / 图生视频输入) */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

interface LoadedImage {
  width: number;
  height: number;
  element: HTMLImageElement;
}

function loadImage(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight, element: img });
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

interface CompressOptions {
  /** 最大边的像素尺寸，超过则等比缩小（默认 1024） */
  maxDim?: number;
  /** JPEG 压缩质量 0-1（默认 0.85） */
  quality?: number;
}

/**
 * 上传图片在客户端压缩并转成 JPEG data URI。
 *
 * 目的：直接把原图转成 base64 data URI 塞进 JSON 请求会膨胀到几 MB，
 * 极易超过网关 / Next proxy 的请求体上限（表现为返回空 body 后
 * `res.json()` 抛 "Unexpected end of JSON input"）。先等比缩小并转 JPEG，
 * 可将体积降至数百 KB 以内，同时满足图生视频的输入需求。
 */
export async function compressImageFile(file: File, opts: CompressOptions = {}): Promise<string> {
  const { maxDim = 1024, quality = 0.85 } = opts;
  const src = URL.createObjectURL(file);
  try {
    const { width, height, element } = await loadImage(src);
    // 只在原图大于目标尺寸时才缩小，避免无谓放大
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片处理");

    ctx.drawImage(element, 0, 0, w, h);

    // 统一转成 JPEG，显著小于 PNG 原图的 base64 体积
    const dataUri = canvas.toDataURL("image/jpeg", quality);
    if (!dataUri.startsWith("data:image/jpeg")) {
      throw new Error("图片压缩失败");
    }
    return dataUri;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "图片压缩失败");
  } finally {
    URL.revokeObjectURL(src);
  }
}
