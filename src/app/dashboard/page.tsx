/**
 * @file 剧集列表与创建页（仪表盘）
 * @description
 * 短剧平台首页，展示当前用户的所有剧集，并支持创建新剧集。
 * 页面以卡片网格展示每部剧集的标题、简介、题材、角色/场景/季数量，
 * 点击卡片跳转至剧集详情页；点击「创建新剧集」弹出表单弹窗。
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** 剧集列表项的数据结构（与后端 GET /api/series 返回一致） */
interface SeriesItem {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  status: string;
  targetCount: number;
  coverUrl: string | null;
  updatedAt: string;
  _count: { characters: number; locations: number; seasons: number };
}

/** 题材预设选项，供创建表单下拉选择 */
const GENRES = ["都市", "古风", "科幻", "悬疑", "甜宠", "逆袭", "穿越", "重生", "玄幻", "其他"];

/**
 * 仪表盘页面组件。
 *
 * 负责：加载并展示用户剧集列表、控制创建弹窗的显隐、提交创建请求。
 */
export default function DashboardPage() {
  // ---- 列表数据 ----
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // ---- 创建表单字段 ----
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("都市");
  const [targetCount, setTargetCount] = useState(10);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeries();
  }, []);

  /** 拉取当前用户的剧集列表。 */
  async function loadSeries() {
    setLoading(true);
    try {
      const res = await fetch("/api/series");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  /** 提交创建新剧集请求，成功后关闭弹窗并刷新列表。 */
  async function create() {
    if (!title.trim()) {
      setError("请输入标题");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, synopsis, genre, targetCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");
      // 重置表单并刷新列表
      setShowCreate(false);
      setTitle("");
      setSynopsis("");
      setGenre("都市");
      setTargetCount(10);
      await loadSeries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  // 剧集状态码 -> 中文标签映射
  const statusLabel: Record<string, string> = {
    planning: "规划中",
    production: "制作中",
    completed: "已完成",
    archived: "已归档",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">我的剧集</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + 创建新剧集
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-zinc-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="text-4xl">🎬</div>
          <p className="mt-4 text-zinc-500">还没有剧集，点击上方按钮创建第一部短剧</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="group block rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-indigo-600">
                  {s.title}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                  {statusLabel[s.status] || s.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
                {s.synopsis || "暂无简介"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-600">{s.genre}</span>
                <span>{s._count.seasons} 季</span>
                <span>{s._count.characters} 角色</span>
                <span>{s._count.locations} 场景</span>
                <span>计划 {s.targetCount} 集</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 创建剧集弹窗：点击遮罩关闭，点击弹窗内容阻止冒泡 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-zinc-900">创建新剧集</h2>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：都市逆袭之重生2026"
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">简介</label>
                <textarea
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  rows={3}
                  placeholder="一句话描述故事核心…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-zinc-700">题材</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700">计划集数</label>
                  <input
                    type="number"
                    value={targetCount}
                    onChange={(e) => setTargetCount(Number(e.target.value))}
                    min={1}
                    max={200}
                    className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={create}
                disabled={creating}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {creating ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
