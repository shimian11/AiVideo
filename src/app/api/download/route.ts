import { isAllowedMediaUrl } from "@/lib/agnes";

type MediaType = "image" | "video";

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function extFromContentType(ct: string): string {
  const key = ct.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXT[key] || "bin";
}

function slugify(text: string): string {
  const trimmed = text.trim().slice(0, 40);
  const slug = trimmed
    .replace(/[\s]+/g, "-")
    .replace(/[^\w\-一-鿿]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "agnes";
}

// 下载: 抓取 Agnes 媒体 URL，以附件形式流式返回给浏览器，触发浏览器原生下载（不在服务端保存）。
// 用后端代理而非前端直链，是因为 Agnes 的媒体域名跨域，浏览器 <a download> 无法强制下载；
// 后端加上 Content-Disposition: attachment 可确保浏览器弹出下载而非在线打开。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const type = searchParams.get("type") as MediaType | null;
    const name = searchParams.get("name") || "agnes";

    if (!url || !isAllowedMediaUrl(url)) {
      return Response.json({ error: "不允许的下载地址" }, { status: 400 });
    }
    if (type !== "image" && type !== "video") {
      return Response.json({ error: "无效的文件类型" }, { status: 400 });
    }

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) {
      return Response.json(
        { error: `抓取源文件失败 (HTTP ${res.status})` },
        { status: 502 },
      );
    }
    const contentType =
      res.headers.get("content-type") || (type === "image" ? "image/png" : "video/mp4");
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromContentType(contentType) || (type === "image" ? "png" : "mp4");
    const filename = `${slugify(name)}.${ext}`;

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "下载失败" },
      { status: 500 },
    );
  }
}
