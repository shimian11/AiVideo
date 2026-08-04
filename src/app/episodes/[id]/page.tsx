/**
 * @file 集详情页（分镜板）
 * @description
 * 展示单集的分镜板，采用三栏布局：
 * - 左栏：按场景分组的分镜列表（含缩略图、状态指示）
 * - 中栏：选中分镜的详情查看 / 编辑（景别、时长、提示词、台词）
 * - 右栏：生成结果预览（关键帧、视频片段）
 *
 * 该页是分镜级别操作的主界面，Phase 3 将在右栏加入批量生成功能。
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { use } from "react";

/** 角色数据结构（分镜关联用） */
interface Character {
  id: string;
  name: string;
  description: string;
}

/** 分镜数据结构 */
interface ShotData {
  id: string;
  number: number;
  shotType: string | null;
  duration: number;
  imagePrompt: string | null;
  videoPrompt: string | null;
  dialogue: string | null;
  keyframeUrl: string | null;
  videoUrl: string | null;
  status: string;
  characters: { character: Character }[];
}

/** 场景数据结构（含多个分镜） */
interface SceneData {
  id: string;
  number: number;
  description: string | null;
  location: { id: string; name: string; description: string } | null;
  shots: ShotData[];
}

/** 集完整数据结构（含场景与所属季/剧集信息） */
interface EpisodeData {
  id: string;
  number: number;
  title: string | null;
  status: string;
  duration: number | null;
  season: { id: string; number: number; title: string | null; series: { id: string; title: string } };
  scenes: SceneData[];
}

/** 分镜状态码 -> 中文标签 */
const STATUS_LABEL: Record<string, string> = {
  pending: "待生成",
  keyframe_done: "关键帧已生成",
  video_done: "视频已生成",
  audio_done: "配音已生成",
  completed: "已完成",
  failed: "失败",
};

/** 分镜状态码 -> 标签背景色 */
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-500",
  keyframe_done: "bg-blue-50 text-blue-600",
  video_done: "bg-indigo-50 text-indigo-600",
  audio_done: "bg-purple-50 text-purple-600",
  completed: "bg-green-50 text-green-600",
  failed: "bg-red-50 text-red-600",
};

/**
 * 集详情页组件。
 *
 * 通过路由参数 id 获取集 ID，拉取集完整数据后渲染三栏分镜板。
 * 支持选中分镜查看详情、切换编辑模式修改分镜字段并保存。
 */
export default function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = use(params);

  // ---- 数据与加载状态 ----
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedShot, setSelectedShot] = useState<ShotData | null>(null);
  const [editing, setEditing] = useState(false);

  // ---- 编辑表单字段 ----
  const [editImagePrompt, setEditImagePrompt] = useState("");
  const [editVideoPrompt, setEditVideoPrompt] = useState("");
  const [editDialogue, setEditDialogue] = useState("");
  const [editShotType, setEditShotType] = useState("中景");
  const [editDuration, setEditDuration] = useState(5);
  const [saving, setSaving] = useState(false);

  // 批量生成相关状态
  const [generating, setGenerating] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ progress: number; doneSteps: number; totalSteps: number } | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  /** 拉取集详情（含所有分镜）。用 useCallback 包裹以便依赖复用。 */
  const loadEpisode = useCallback(async () => {
    try {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEpisode(data);
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    loadEpisode();
  }, [loadEpisode]);

  /** 选中某个分镜，并把其字段同步到编辑表单的初始值。 */
  function selectShot(shot: ShotData) {
    setSelectedShot(shot);
    setEditing(false);
    setEditImagePrompt(shot.imagePrompt || "");
    setEditVideoPrompt(shot.videoPrompt || "");
    setEditDialogue(shot.dialogue || "");
    setEditShotType(shot.shotType || "中景");
    setEditDuration(shot.duration || 5);
  }

  /** 保存分镜编辑结果，成功后重新拉取集数据以同步列表状态。 */
  async function saveShot() {
    if (!selectedShot) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shots/${selectedShot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: editImagePrompt,
          videoPrompt: editVideoPrompt,
          dialogue: editDialogue,
          shotType: editShotType,
          duration: editDuration,
        }),
      });
      if (res.ok) {
        await loadEpisode();
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  /** 批量生成整集所有分镜（关键帧+视频），通过 SSE 实时接收进度。 */
  async function generateAll() {
    setGenerating(true);
    setJobProgress(null);
    try {
      // 创建任务
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_episode",
          episodeId,
          stepTypes: ["keyframe", "video"],
        }),
      });
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || "创建任务失败");

      // 通过 SSE 监听进度
      await new Promise<void>((resolve) => {
        const es = new EventSource(`/api/jobs/${job.id}/stream`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data);
          setJobProgress({ progress: data.progress, doneSteps: data.doneSteps, totalSteps: data.totalSteps });
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            es.close();
            resolve();
          }
        };
        es.onerror = () => {
          es.close();
          resolve();
        };
      });

      // 重新加载集数据
      await loadEpisode();
    } finally {
      setGenerating(false);
    }
  }

  /** 重新生成单个分镜（关键帧+视频）。 */
  async function regenerateShot(shotId: string) {
    setRegenerating(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_shot",
          shotId,
          stepTypes: ["keyframe", "video"],
        }),
      });
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || "创建任务失败");

      // 通过 SSE 监听进度
      await new Promise<void>((resolve) => {
        const es = new EventSource(`/api/jobs/${job.id}/stream`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            es.close();
            resolve();
          }
        };
        es.onerror = () => {
          es.close();
          resolve();
        };
      });

      await loadEpisode();
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-zinc-400">加载中…</div>;
  if (!episode) return <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-red-500">集不存在</div>;

  const seriesId = episode.season.series.id;
  // 统计分镜总数与已完成数，用于概览栏展示进度
  const totalShots = episode.scenes.reduce((sum, s) => sum + s.shots.length, 0);
  const completedShots = episode.scenes.reduce(
    (sum, s) => sum + s.shots.filter((sh) => sh.status === "completed").length, 0,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Link href={`/series/${seriesId}`} className="hover:text-indigo-600">{episode.season.series.title}</Link>
        <span>/</span>
        <span>第 {episode.number} 集{episode.title ? ` · ${episode.title}` : ""}</span>
      </div>

      {/* 概览栏：集号、状态、完成进度 */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">第 {episode.number} 集</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[episode.status] || "bg-zinc-100"}`}>
            {STATUS_LABEL[episode.status] || episode.status}
          </span>
        </div>
        <div className="text-sm text-zinc-500">
          {completedShots}/{totalShots} 分镜完成
          <span className="ml-2">·</span>
          <span className="ml-2">{episode.scenes.length} 场</span>
          <Link href={`/episodes/${episodeId}/preview`} className="ml-4 rounded-lg border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
            ▶ 预览整集
          </Link>
        </div>
      </div>

      {/* 批量生成工具栏 */}
      {totalShots > 0 && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3">
          <button
            onClick={generateAll}
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating ? "生成中…" : "🚀 一键生成全部分镜"}
          </button>
          {jobProgress && (
            <div className="flex flex-1 items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${jobProgress.progress}%` }} />
              </div>
              <span className="text-xs text-zinc-500">
                {jobProgress.doneSteps}/{jobProgress.totalSteps} ({jobProgress.progress}%)
              </span>
            </div>
          )}
        </div>
      )}

      {totalShots === 0 ? (
        // 无分镜时的空态引导
        <div className="mt-12 rounded-xl border border-dashed border-zinc-200 py-16 text-center">
          <div className="text-3xl">🎬</div>
          <p className="mt-4 text-zinc-500">本集还没有分镜</p>
          <Link href={`/series/${seriesId}/scripts`} className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            去剧本页拆分分镜
          </Link>
        </div>
      ) : (
        // 三栏布局：分镜列表 / 分镜编辑 / 生成预览
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* 左：分镜列表（按场景分组） */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
            {episode.scenes.map((scene) => (
              <div key={scene.id} className="mb-4">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="text-xs font-semibold text-zinc-400">第{scene.number}场</span>
                  {scene.location && <span className="text-xs text-zinc-400">· {scene.location.name}</span>}
                </div>
                {scene.shots.map((shot) => (
                  <button
                    key={shot.id}
                    onClick={() => selectShot(shot)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-lg p-2 text-left transition ${
                      selectedShot?.id === shot.id ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-zinc-50"
                    }`}
                  >
                    {/* 缩略图：有关键帧显示图片，否则显示编号占位 */}
                    <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                      {shot.keyframeUrl ? (
                        <img src={shot.keyframeUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-300">#{shot.number}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-zinc-700">#{shot.number}</span>
                        <span className="text-xs text-zinc-400">{shot.shotType}</span>
                        <span className="text-xs text-zinc-400">· {shot.duration}s</span>
                      </div>
                      <p className="truncate text-xs text-zinc-400">{shot.dialogue || shot.imagePrompt?.slice(0, 30) || "无描述"}</p>
                    </div>
                    {/* 状态指示点 */}
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      shot.status === "completed" ? "bg-green-500" :
                      shot.status === "failed" ? "bg-red-500" :
                      shot.status === "pending" ? "bg-zinc-300" : "bg-indigo-500"
                    }`} />
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* 中：分镜详情查看 / 编辑 */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
            {!selectedShot ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                ← 点击左侧选择一个分镜
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-900">分镜 #{selectedShot.number}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[selectedShot.status] || "bg-zinc-100"}`}>
                      {STATUS_LABEL[selectedShot.status] || selectedShot.status}
                    </span>
                    {!editing ? (
                      <button onClick={() => setEditing(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">编辑</button>
                    ) : (
                      <button onClick={() => setEditing(false)} className="text-xs text-zinc-400">取消</button>
                    )}
                  </div>
                </div>

                {/* 出场角色标签 */}
                {selectedShot.characters.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedShot.characters.map((sc) => (
                      <span key={sc.character.id} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                        {sc.character.name}
                      </span>
                    ))}
                  </div>
                )}

                {!editing ? (
                  // 查看模式：只读展示分镜字段
                  <>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">景别 / 时长</label>
                      <p className="mt-0.5 text-sm text-zinc-700">{selectedShot.shotType} · {selectedShot.duration}秒</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">文生图提示词</label>
                      <p className="mt-0.5 text-sm text-zinc-600">{selectedShot.imagePrompt || "（空）"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">图生视频提示词</label>
                      <p className="mt-0.5 text-sm text-zinc-600">{selectedShot.videoPrompt || "（空）"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">台词/旁白</label>
                      <p className="mt-0.5 text-sm text-zinc-600">{selectedShot.dialogue || "（无）"}</p>
                    </div>
                  </>
                ) : (
                  // 编辑模式：可修改分镜字段
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-400">景别</label>
                        <select value={editShotType} onChange={(e) => setEditShotType(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm">
                          {["远景", "全景", "中景", "近景", "特写", "大特写"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-400">时长（秒）</label>
                        <input type="number" value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} min={3} max={10}
                          className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">文生图提示词（静态画面）</label>
                      <textarea value={editImagePrompt} onChange={(e) => setEditImagePrompt(e.target.value)} rows={4}
                        className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm resize-y" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">图生视频提示词（动态描述）</label>
                      <textarea value={editVideoPrompt} onChange={(e) => setEditVideoPrompt(e.target.value)} rows={3}
                        className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm resize-y" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400">台词/旁白</label>
                      <textarea value={editDialogue} onChange={(e) => setEditDialogue(e.target.value)} rows={2}
                        className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm resize-y" />
                    </div>
                    <button onClick={saveShot} disabled={saving}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                      {saving ? "保存中…" : "保存"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 右：生成结果预览（关键帧 + 视频） */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
            {!selectedShot ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">选择分镜查看预览</div>
            ) : (
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold text-zinc-900">生成结果</h3>

                {/* 关键帧预览（竖屏 9:16） */}
                <div>
                  <label className="text-xs font-medium text-zinc-400">关键帧</label>
                  <div className="mt-1 aspect-[9/16] max-w-[200px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {selectedShot.keyframeUrl ? (
                      <img src={selectedShot.keyframeUrl} alt="关键帧" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-300">未生成</div>
                    )}
                  </div>
                </div>

                {/* 视频片段预览 */}
                <div>
                  <label className="text-xs font-medium text-zinc-400">视频片段</label>
                  <div className="mt-1">
                    {selectedShot.videoUrl ? (
                      <video src={selectedShot.videoUrl} controls loop className="max-w-full rounded-lg border border-zinc-200" />
                    ) : (
                      <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-300">未生成</div>
                    )}
                  </div>
                </div>

                {/* 生成操作 */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => regenerateShot(selectedShot.id)}
                    disabled={regenerating}
                    className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {regenerating ? "生成中…" : "🔄 重新生成本分镜"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
