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
import { EmptyState } from "@/components/ui/EmptyState";

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

      // 按场->分镜顺序展平
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

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-faint">加载中…</div>;
  if (!episodeInfo) return <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-danger">集不存在</div>;

  const seriesId = episodeInfo.season.series.id;
  const currentShot = shots[currentIdx];
  const videoShots = shots.filter((s) => s.videoUrl);
  const completedCount = shots.filter((s) => s.status === "completed" || s.videoUrl).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-fade-in">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-faint">
        <Link href={`/series/${seriesId}`} className="transition hover:text-accent">{episodeInfo.season.series.title}</Link>
        <span>/</span>
        <Link href={`/episodes/${episodeId}`} className="transition hover:text-accent">第 {episodeInfo.number} 集</Link>
        <span>/</span>
        <span>预览</span>
      </div>

      <h1 className="mt-3 text-xl font-bold text-ink">
        第 {episodeInfo.number} 集 · 整集预览
        {episodeInfo.title && <span className="ml-2 text-muted">{episodeInfo.title}</span>}
      </h1>
      <p className="mt-1 text-sm text-muted">
        共 {shots.length} 个分镜，{completedCount} 个已生成视频
      </p>

      {shots.length === 0 ? (
        <div className="mt-12">
          <EmptyState title="暂无分镜数据" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* 播放器 */}
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-xl border border-line bg-black" style={{ aspectRatio: "9/16", maxHeight: "70vh" }}>
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
                <div className="flex h-full items-center justify-center text-muted">
                  分镜 #{currentShot?.number} 未生成
                </div>
              )}
            </div>

            {/* 当前分镜信息 */}
            {currentShot && (
              <div className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">分镜 #{currentShot.number}</span>
                  <span className="text-xs text-faint">{currentShot.shotType}</span>
                  <span className="text-xs text-faint">· 第{currentShot.scene.number}场</span>
                  {currentShot.scene.location && <span className="text-xs text-faint">· {currentShot.scene.location.name}</span>}
                </div>
                {currentShot.dialogue && (
                  <p className="mt-1 text-muted">💬 {currentShot.dialogue}</p>
                )}
                {currentShot.videoUrl && (
                  <button
                    onClick={() => downloadShot(currentShot.videoUrl!, `第${episodeInfo.number}集-分镜${currentShot.number}`)}
                    className="mt-2 text-xs font-medium text-accent transition hover:text-accent-strong"
                  >
                    ⬇ 下载此片段
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 分镜列表（播放队列） */}
          <div className="rounded-xl border border-line bg-surface p-3" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <h3 className="mb-2 text-xs font-semibold text-faint">播放队列</h3>
            {shots.map((shot, idx) => (
              <button
                key={shot.id}
                onClick={() => playShot(idx)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg p-2 text-left transition ${
                  idx === currentIdx ? "bg-accent-soft ring-1 ring-accent/20" : "hover:bg-surface-2"
                }`}
              >
                <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded border border-line bg-surface-2">
                  {shot.keyframeUrl ? (
                    <img src={shot.keyframeUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-faint">#{shot.number}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-ink">#{shot.number} · {shot.shotType}</div>
                  <p className="truncate text-xs text-faint">{shot.dialogue || "（无台词）"}</p>
                </div>
                {shot.videoUrl ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" />
                ) : (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-faint" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
