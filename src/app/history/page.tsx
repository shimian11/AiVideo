"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";

interface HistoryTag {
  id: string;
  name: string;
}
interface HistoryItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  prompt: string;
  config: Record<string, unknown>;
  resultUrl?: string | null;
  createdAt: string;
  tags: { tag: HistoryTag }[];
}

function configSummary(type: "IMAGE" | "VIDEO", config: Record<string, unknown>): string {
  if (type === "IMAGE") {
    return [config.size, config.ratio, config.mode].filter(Boolean).join(" · ");
  }
  const frames = config.numFrames;
  const fps = config.frameRate;
  const sec = frames && fps ? `${(Number(frames) / Number(fps)).toFixed(1)}s` : null;
  return [config.mode, sec, `${config.width}x${config.height}`].filter(Boolean).join(" · ");
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [tags, setTags] = useState<HistoryTag[]>([]);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, t] = await Promise.all([
        fetch("/api/history").then((r) => r.json()),
        fetch("/api/tags").then((r) => r.json()),
      ]);
      setItems(h.items || []);
      setTags(t.tags || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteItem(id: string) {
    if (!confirm("删除这条历史？")) return;
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败，请稍后重试");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function createTag() {
    if (!newTag.trim()) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTag.trim() }),
    });
    const data = await res.json();
    if (res.ok && data.tag) {
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTag("");
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("删除此标签？会从所有历史中移除。")) return;
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除标签失败，请稍后重试");
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== id));
    setItems((prev) =>
      prev.map((i) => ({ ...i, tags: i.tags.filter((t) => t.tag.id !== id) })),
    );
    if (filterTagId === id) setFilterTagId(null);
  }

  async function toggleTag(itemId: string, tagId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const current = item.tags.map((t) => t.tag.id);
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    const res = await fetch(`/api/history/${itemId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
    });
    if (!res.ok) {
      alert("更新标签失败，请稍后重试");
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              tags: next
                .map((id) => tags.find((t) => t.id === id))
                .filter((t): t is HistoryTag => !!t)
                .map((tag) => ({ tag })),
            }
          : i,
      ),
    );
  }

  const filtered = items.filter((i) => {
    if (filterTagId && !i.tags.some((t) => t.tag.id === filterTagId)) return false;
    if (search && !i.prompt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">生成历史</h1>
      <p className="mt-1 text-sm text-muted">
        保存提示词、配置与结果，点击查看详情。
      </p>

      {/* 标签栏 */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterTagId(null)}
          className={`rounded-full px-3 py-1 text-xs transition ${
            filterTagId === null ? "bg-accent text-white" : "bg-surface-2 text-muted hover:bg-line"
          }`}
        >
          全部
        </button>
        {tags.map((t) => (
          <span key={t.id} className="group flex items-center">
            <button
              onClick={() => setFilterTagId(t.id)}
              className={`rounded-l-full px-3 py-1 text-xs transition ${
                filterTagId === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted hover:bg-line"
              }`}
            >
              {t.name}
            </button>
            <button
              onClick={() => deleteTag(t.id)}
              className="rounded-r-full bg-surface-2 px-2 py-1 text-xs text-faint transition hover:bg-danger-soft hover:text-danger"
              title="删除标签"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createTag()}
          placeholder="新标签"
          className="ml-1 w-24 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink outline-none transition placeholder:text-faint focus:border-accent"
        />
      </div>

      {/* 搜索 */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索提示词…"
        className="mt-4"
      />

      {/* 列表 */}
      {loading ? (
        <div className="mt-8 text-sm text-faint">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="🗂️"
            title="暂无历史"
            hint="生成图片或视频后会保存在这里"
            action={
              <div className="flex items-center gap-3 text-sm">
                <Link href="/image" className="text-accent hover:text-accent-strong">去生成图片</Link>
                <span className="text-faint">或</span>
                <Link href="/video" className="text-accent hover:text-accent-strong">生成视频</Link>
              </div>
            }
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 animate-fade-in">
          {filtered.map((item) => (
            <Link key={item.id} href={`/history/${item.id}`} className="block">
              <Card className="p-4 transition-all duration-200 hover:border-accent/40 hover:shadow-[0_4px_20px_-6px_rgba(99,102,241,0.18)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {item.resultUrl && (
                      <div className="shrink-0">
                        {item.type === "IMAGE" ? (
                          <img
                            src={item.resultUrl}
                            alt=""
                            className="h-16 w-16 rounded-lg border border-line object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-surface-2 text-2xl">
                            🎬
                          </div>
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.type === "IMAGE" ? "default" : "accent"}>
                          {item.type === "IMAGE" ? "图" : "视"}
                        </Badge>
                        <span className="text-xs text-faint">
                          {configSummary(item.type, item.config)}
                        </span>
                        <span className="text-xs text-faint">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-ink">{item.prompt}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-accent text-accent hover:bg-accent-soft"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(
                          `${item.type === "IMAGE" ? "/image" : "/video"}?prompt=${encodeURIComponent(item.prompt)}`,
                        );
                      }}
                    >
                      重跑
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void deleteItem(item.id);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {/* 标签编辑 */}
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                    {tags.map((t) => {
                      const on = item.tags.some((it) => it.tag.id === t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void toggleTag(item.id, t.id);
                          }}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                            on
                              ? "bg-accent text-white"
                              : "bg-surface-2 text-muted hover:bg-line"
                          }`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
