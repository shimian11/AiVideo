"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface HistoryTag {
  id: string;
  name: string;
}
interface HistoryDetail {
  id: string;
  type: "IMAGE" | "VIDEO";
  prompt: string;
  config: Record<string, unknown>;
  resultUrl: string | null;
  createdAt: string;
  tags: { tag: HistoryTag }[];
}

/** 按 type 把 config 展开成「标签-值」对，便于详情页表格化展示 */
function configEntries(
  type: "IMAGE" | "VIDEO",
  config: Record<string, unknown>,
): { label: string; value: string }[] {
  const push = (arr: { label: string; value: string }[], label: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") arr.push({ label, value: String(v) });
  };
  const entries: { label: string; value: string }[] = [];
  if (type === "IMAGE") {
    push(entries, "模式", config.mode);
    push(entries, "尺寸", config.size);
    push(entries, "比例", config.ratio);
    return entries;
  }
  // VIDEO
  push(entries, "模式", config.mode);
  if (config.width && config.height) {
    entries.push({ label: "分辨率", value: `${config.width}×${config.height}` });
  }
  push(entries, "帧数", config.numFrames);
  if (config.frameRate) {
    entries.push({ label: "帧率", value: `${config.frameRate} fps` });
  }
  if (config.numFrames && config.frameRate) {
    const sec = Number(config.numFrames) / Number(config.frameRate);
    if (Number.isFinite(sec) && sec > 0) {
      entries.push({ label: "时长", value: `${sec.toFixed(1)} 秒` });
    }
  }
  push(entries, "反向提示词", config.negativePrompt);
  if (config.seed !== undefined && config.seed !== null && config.seed !== "") {
    entries.push({ label: "种子", value: String(config.seed) });
  }
  return entries;
}

export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/history/${id}`);
        if (res.status === 404) {
          setError("历史不存在或已删除");
          return;
        }
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as HistoryDetail;
        if (!cancelled) setItem(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onDelete() {
    if (!item) return;
    if (!confirm("删除这条历史？此操作不可撤销。")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("删除失败，请稍后重试");
        return;
      }
      router.push("/history");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-sm text-faint">加载中…</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link href="/history" className="text-sm text-accent transition hover:text-accent-strong">
          ← 返回历史列表
        </Link>
        <div className="mt-6 rounded-xl border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">{error || "历史不存在"}</p>
        </div>
      </div>
    );
  }

  const entries = configEntries(item.type, item.config);
  const rerunHref = `${item.type === "IMAGE" ? "/image" : "/video"}?prompt=${encodeURIComponent(item.prompt)}`;

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-4 py-8">
      {/* 顶部：返回 + 类型 + 时间 */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/history"
          className="text-sm text-muted transition hover:text-ink"
        >
          ← 返回 /history
        </Link>
        <Badge tone={item.type === "IMAGE" ? "default" : "accent"}>
          {item.type === "IMAGE" ? "图片" : "视频"}
        </Badge>
        <span className="text-xs text-faint">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>

      {/* 提示词 */}
      <Card className="mt-4 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          提示词
        </h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
          {item.prompt}
        </p>
      </Card>

      {/* 配置 */}
      {entries.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
            配置
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {entries.map((e) => (
              <div key={e.label} className="min-w-0">
                <dt className="text-xs text-faint">{e.label}</dt>
                <dd className="mt-0.5 truncate text-sm text-ink" title={e.value}>
                  {e.value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* 结果 */}
      <Card className="mt-4 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          生成结果
        </h2>
        {item.resultUrl ? (
          item.type === "IMAGE" ? (
            <div className="mt-3 flex justify-center">
              <img
                src={item.resultUrl}
                alt="生成结果"
                className="max-h-[60vh] w-auto max-w-full rounded-lg border border-line"
              />
            </div>
          ) : (
            <video
              src={item.resultUrl}
              controls
              autoPlay
              loop
              className="mt-3 max-h-[60vh] w-full rounded-lg border border-line"
            />
          )
        ) : (
          <p className="mt-3 text-sm text-faint">未保存结果</p>
        )}
      </Card>

      {/* 标签 */}
      {item.tags.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
            标签
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map(({ tag }) => (
              <Badge key={tag.id} tone="accent">
                {tag.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* 操作 */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={rerunHref}
          className="inline-flex items-center rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent-soft"
        >
          重跑
        </Link>
        <Button variant="danger" onClick={onDelete} disabled={deleting}>
          {deleting ? "删除中…" : "删除"}
        </Button>
      </div>
    </div>
  );
}
