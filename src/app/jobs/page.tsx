/**
 * @file 任务列表页 - 全局任务监控
 * @description 展示当前用户的所有生成任务及其状态
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface JobItem {
  id: string;
  type: string;
  status: string;
  progress: number;
  totalSteps: number;
  doneSteps: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  seriesId: string | null;
  episodeId: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  generate_episode: "批量生成整集",
  generate_shot: "生成单个分镜",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-500",
  running: "bg-blue-50 text-blue-600",
  completed: "bg-green-50 text-green-600",
  failed: "bg-red-50 text-red-600",
  cancelled: "bg-zinc-100 text-zinc-400",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadJobs();
    // 每 5 秒刷新一次（如果有运行中的任务）
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadJobs() {
    try {
      const res = await fetch("/api/jobs?limit=30");
      const data = await res.json();
      setJobs(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function cancelJob(id: string) {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    await loadJobs();
  }

  async function retryJob(id: string) {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    await loadJobs();
  }

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const hasRunning = jobs.some((j) => j.status === "running" || j.status === "queued");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">任务列表</h1>
        {hasRunning && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            有任务运行中
          </div>
        )}
      </div>

      {/* 状态筛选 */}
      <div className="mt-4 flex gap-1">
        {[
          { key: "all", label: "全部" },
          { key: "running", label: "执行中" },
          { key: "queued", label: "排队中" },
          { key: "completed", label: "已完成" },
          { key: "failed", label: "失败" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === f.key ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-400">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-400">
          暂无任务
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {filtered.map((job) => (
            <div key={job.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">{TYPE_LABEL[job.type] || job.type}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[job.status] || "bg-zinc-100"}`}>
                    {STATUS_LABEL[job.status] || job.status}
                  </span>
                </div>
                <span className="text-xs text-zinc-400">
                  {new Date(job.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>

              {/* 进度条 */}
              {job.status === "running" && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500">{job.doneSteps}/{job.totalSteps}</span>
                </div>
              )}

              {/* 错误信息 */}
              {job.status === "failed" && job.errorMessage && (
                <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>
              )}

              {/* 操作按钮 */}
              <div className="mt-3 flex items-center gap-3">
                {job.episodeId && (
                  <Link href={`/episodes/${job.episodeId}`} className="text-xs text-indigo-600 hover:text-indigo-500">
                    查看分镜 →
                  </Link>
                )}
                {(job.status === "running" || job.status === "queued") && (
                  <button onClick={() => cancelJob(job.id)} className="text-xs text-red-500 hover:text-red-400">
                    取消
                  </button>
                )}
                {job.status === "failed" && (
                  <button onClick={() => retryJob(job.id)} className="text-xs text-indigo-600 hover:text-indigo-500">
                    重试
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
