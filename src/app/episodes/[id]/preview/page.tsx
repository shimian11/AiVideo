/**
 * @file 整集预览页 - 按顺序播放所有分镜视频
 * @description
 * 展示一集内所有分镜的关键帧和视频，支持连续播放预览。
 * 右上角提供导出/下载入口。
 */

"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { use } from "react";

/** 分镜数据（预览用） */
interface PreviewShot {
  id: string;
  number: number;
  shotType: string | null;
  duration: number;
  dialogue: string | null;
  keyframeUrl: string | null;
  videoUrl: string | null;
  status: string;
  scene: { number: number; location: { name: string } | null };
}

export default function EpisodePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = use(params);
  const [shots, setShots] = useState<PreviewShot[]>([]);
  const [episodeInfo, setEpisodeInfo] = useState<{ number: number; title: string | null; season: { series: { id: string; title: string } } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadEpisode();
  }, [episodeId]);

  async function loadEpisode() {
    try {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEpisodeInfo(data);

      // 按场→分镜顺序展平
      const allShots = data.scenes.flatMap((s: any) =>
        s.shots.map((sh: any) => ({ ...sh, scene: { number: s.number, location: s.location } })),
      );
      setShots(allShots);
    } finally {
      setLoading(false);
    }
  }

  /** 视频播放结束自动播放下一个 */
  function onVideoEnded() {
    if (currentIdx < shots.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  }

  /** 手动切换到指定分镜 */
  function playShot(idx: number) {
    setCurrentIdx(idx);
  }

  /** 下载单个分镜视频 */
  function downloadShot(url: string, name: string) {
    const a = document.createElement("a");
    a.href = `/api/download?url=${encodeURIComponent(url)}&type=video&name=${encodeURIComponent(name)}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-zinc-400">加载中…</div>;
  if (!episodeInfo) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-red-500">集不存在</div>;

  const seriesId = episodeInfo.season.series.id;
  const currentShot = shots[currentIdx];
  const videoShots = shots.filter((s) => s.videoUrl);
  const completedCount = shots.filter((s) => s.status === "completed" || s.videoUrl).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Link href={`/series/${seriesId}`} className="hover:text-indigo-600">{episodeInfo.season.series.title}</Link>
        <span>/</span>
        <Link href={`/episodes/${episodeId}`} className="hover:text-indigo-600">第 {episodeInfo.number} 集</Link>
        <span>/</span>
        <span>预览</span>
      </div>

      <h1 className="mt-3 text-xl font-bold text-zinc-900">
        第 {episodeInfo.number} 集 · 整集预览
        {episodeInfo.title && <span className="ml-2 text-zinc-500">{episodeInfo.title}</span>}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        共 {shots.length} 个分镜，{completedCount} 个已生成视频
      </p>

      {shots.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-zinc-200 py-16 text-center text-zinc-400">
          暂无分镜数据
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* 播放器 */}
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-black" style={{ aspectRatio: "9/16", maxHeight: "70vh" }}>
              {currentShot?.videoUrl ? (
                <video
                  ref={videoRef}
                  key={currentShot.id}
                  src={currentShot.videoUrl}
                  controls
                  autoPlay
                  onEnded={onVideoEnded}
                  className="h-full w-full object-contain"
                />
              ) : currentShot?.keyframeUrl ? (
                <img src={currentShot.keyframeUrl} alt="预览" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  分镜 #{currentShot?.number} 未生成
                </div>
              )}
            </div>

            {/* 当前分镜信息 */}
            {currentShot && (
              <div className="rounded-lg bg-white p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">分镜 #{currentShot.number}</span>
                  <span className="text-xs text-zinc-400">{currentShot.shotType}</span>
                  <span className="text-xs text-zinc-400">· 第{currentShot.scene.number}场</span>
                  {currentShot.scene.location && <span className="text-xs text-zinc-400">· {currentShot.scene.location.name}</span>}
                </div>
                {currentShot.dialogue && (
                  <p className="mt-1 text-zinc-600">💬 {currentShot.dialogue}</p>
                )}
                {currentShot.videoUrl && (
                  <button
                    onClick={() => downloadShot(currentShot.videoUrl!, `第${episodeInfo.number}集-分镜${currentShot.number}`)}
                    className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    ⬇ 下载此片段
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 分镜列表（播放队列） */}
          <div className="rounded-xl border border-zinc-200 bg-white p-3" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <h3 className="mb-2 text-xs font-semibold text-zinc-400">播放队列</h3>
            {shots.map((shot, idx) => (
              <button
                key={shot.id}
                onClick={() => playShot(idx)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg p-2 text-left transition ${
                  idx === currentIdx ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-zinc-50"
                }`}
              >
                <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                  {shot.keyframeUrl ? (
                    <img src={shot.keyframeUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-300">#{shot.number}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-700">#{shot.number} · {shot.shotType}</div>
                  <p className="truncate text-xs text-zinc-400">{shot.dialogue || "（无台词）"}</p>
                </div>
                {shot.videoUrl ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                ) : (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-zinc-300" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
