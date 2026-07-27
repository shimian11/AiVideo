"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface HistoryTag {
  id: string;
  name: string;
}
interface HistoryItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  prompt: string;
  config: Record<string, unknown>;
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
    await fetch(`/api/history/${id}`, { method: "DELETE" });
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
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
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
    await fetch(`/api/history/${itemId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
    });
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
      <h1 className="text-2xl font-bold">生成历史</h1>
      <p className="mt-1 text-sm text-zinc-500">
        历史只保存提示词与配置，不保存图片/视频。点「重跑」带提示词回到工作台重新生成。
      </p>

      {/* 标签栏 */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterTagId(null)}
          className={`rounded-full px-3 py-1 text-xs ${
            filterTagId === null ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          全部
        </button>
        {tags.map((t) => (
          <span key={t.id} className="group flex items-center">
            <button
              onClick={() => setFilterTagId(t.id)}
              className={`rounded-l-full px-3 py-1 text-xs ${
                filterTagId === t.id ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {t.name}
            </button>
            <button
              onClick={() => deleteTag(t.id)}
              className="rounded-r-full bg-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-red-100 hover:text-red-600"
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
          className="ml-1 w-24 rounded-full border border-zinc-300 px-3 py-1 text-xs outline-none focus:border-indigo-500"
        />
      </div>

      {/* 搜索 */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索提示词…"
        className="mt-4 w-full rounded-lg border border-zinc-300 p-2.5 text-sm outline-none focus:border-indigo-500"
      />

      {/* 列表 */}
      {loading ? (
        <div className="mt-8 text-sm text-zinc-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-400">
          暂无历史，去
          <Link href="/image" className="mx-1 text-indigo-600">生成图片</Link>
          或
          <Link href="/video" className="mx-1 text-indigo-600">视频</Link>
          吧
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      {item.type === "IMAGE" ? "图" : "视"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {configSummary(item.type, item.config)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-800">{item.prompt}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`${item.type === "IMAGE" ? "/image" : "/video"}?prompt=${encodeURIComponent(item.prompt)}`}
                    className="rounded-lg border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    重跑
                  </Link>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-500 hover:border-red-500 hover:text-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>

              {/* 标签编辑 */}
              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
                  {tags.map((t) => {
                    const on = item.tags.some((it) => it.tag.id === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(item.id, t.id)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                          on
                            ? "bg-indigo-600 text-white"
                            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
