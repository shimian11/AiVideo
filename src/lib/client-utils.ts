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
