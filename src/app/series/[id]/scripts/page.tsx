/**
 * @file 剧本管理页
 * @description
 * 管理指定剧集的剧本，包含三个 Tab：
 * 1. 剧本列表：展示所有剧本版本，并提供「AI 拆分剧本为分镜」入口
 * 2. 手动创建：手动输入剧本标题与内容
 * 3. AI 生成：输入故事大纲，调用 AI 自动创作剧本
 *
 * 本页是「剧本 → 分镜」工作流的核心入口。
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";

/** 剧本列表项数据结构 */
interface ScriptItem {
  id: string;
  title: string;
  content: string;
  source: string;
  version: number;
  outline: string | null;
  createdAt: string;
  _count: { episodes: number };
}

/**
 * 剧本管理页组件。
 *
 * 负责剧本的列表展示、手动创建、AI 生成、AI 拆分四种操作的交互与状态管理。
 */
export default function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = use(params);
  const router = useRouter();

  // ---- 列表数据 ----
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 当前 Tab：list 列表 / manual 手动创建 / ai AI生成
  const [tab, setTab] = useState<"list" | "manual" | "ai">("list");

  // ---- 手动创建表单 ----
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  // ---- AI 生成表单 ----
  const [outline, setOutline] = useState("");
  const [episodeCount, setEpisodeCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genScriptId, setGenScriptId] = useState<string | null>(null);

  // ---- 拆分表单 ----
  const [splitScriptId, setSplitScriptId] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [splitResult, setSplitResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScripts();
  }, [seriesId]);

  /** 拉取剧本列表。 */
  async function loadScripts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/scripts`);
      const data = await res.json();
      setScripts(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  /** 手动创建剧本，成功后切换回列表 Tab 并刷新。 */
  async function createManual() {
    if (!title.trim() || !content.trim()) {
      setError("标题和内容为必填项");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadScripts();
      setTab("list");
      setTitle("");
      setContent("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  /** 调用 AI 生成剧本，成功后展示生成结果并刷新列表。 */
  async function generateAI() {
    if (!outline.trim()) {
      setError("请输入故事大纲");
      return;
    }
    setGenerating(true);
    setError(null);
    setGenResult(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/scripts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, episodeCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(data.content);
      setGenScriptId(data.script?.id);
      await loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  /** 调用 AI 将选定剧本拆分为集/场/分镜，成功后展示统计结果。 */
  async function splitScript() {
    if (!splitScriptId) {
      setError("请选择要拆分的剧本");
      return;
    }
    setSplitting(true);
    setError(null);
    setSplitResult(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/scripts/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: splitScriptId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSplitResult(`成功创建 ${data.episodesCreated} 集，共 ${data.shotCount} 个分镜`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setSplitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href={`/series/${seriesId}`} className="text-sm text-zinc-400 hover:text-indigo-600">
        ← 返回剧集
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">剧本管理</h1>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Tab 切换：列表 / 手动创建 / AI生成 */}
      <div className="mt-6 flex gap-1 border-b border-zinc-200">
        {[{ k: "list" as const, l: "剧本列表" }, { k: "manual" as const, l: "手动创建" }, { k: "ai" as const, l: "AI生成" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.k ? "border-indigo-600 text-indigo-600" : "border-transparent text-zinc-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {/* 剧本列表 + 拆分面板 */}
        {tab === "list" && (
          <div>
            {loading ? (
              <p className="text-sm text-zinc-400">加载中…</p>
            ) : scripts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-400">
                还没有剧本，点击"手动创建"或"AI生成"
              </div>
            ) : (
              <div className="grid gap-3">
                {scripts.map((s) => (
                  <div key={s.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-zinc-900">{s.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        {s.source === "ai_generated" && <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-600">AI生成</span>}
                        <span>v{s.version}</span>
                        <span>{s._count.episodes} 集已拆分</span>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-500">{s.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 拆分面板：选择剧本后调用 AI 拆分为分镜 */}
            {scripts.length > 0 && (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <h3 className="text-sm font-semibold text-zinc-700">拆分剧本为分镜</h3>
                <p className="mt-1 text-xs text-zinc-400">AI将剧本自动拆分为集-&gt;场-&gt;分镜，生成每个分镜的提示词</p>
                <div className="mt-3 flex gap-2">
                  <select value={splitScriptId} onChange={(e) => setSplitScriptId(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-300 p-2 text-sm">
                    <option value="">选择剧本…</option>
                    {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <button onClick={splitScript} disabled={splitting || !splitScriptId}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                    {splitting ? "拆分中…（可能需要1-2分钟）" : "AI拆分"}
                  </button>
                </div>
                {splitResult && <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{splitResult}</div>}
              </div>
            )}
          </div>
        )}

        {/* 手动创建表单 */}
        {tab === "manual" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">剧本标题</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第一季完整剧本"
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">剧本内容</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={15}
                  placeholder="输入完整剧本内容…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 resize-y" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTab("list")} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600">取消</button>
                <button onClick={createManual} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI 生成表单 */}
        {tab === "ai" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">故事大纲 / 主题描述</label>
                <p className="mt-0.5 text-xs text-zinc-400">描述故事的核心设定、主线剧情、人物关系等</p>
                <textarea value={outline} onChange={(e) => setOutline(e.target.value)} rows={6}
                  placeholder="例如：一个普通外卖员意外获得读心术超能力，从此人生开挂。他在送外卖过程中读到各种客户的秘密，利用这些信息一步步逆袭，最终成为商业巨头。但超能力也让他卷入了一场阴谋…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 resize-y" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">集数</label>
                <input type="number" value={episodeCount} onChange={(e) => setEpisodeCount(Number(e.target.value))} min={1} max={100}
                  className="mt-1 w-32 rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500" />
              </div>
              <button onClick={generateAI} disabled={generating}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {generating ? "AI创作中…（可能需要1-2分钟）" : "✨ AI生成剧本"}
              </button>
              {/* 生成结果展示，并提供快捷跳转至拆分 */}
              {genResult && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-zinc-700">生成结果</h4>
                    {genScriptId && (
                      <button onClick={() => { setSplitScriptId(genScriptId); setTab("list"); }}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                        去拆分此剧本 -&gt;
                      </button>
                    )}
                  </div>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-zinc-600">{genResult}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
