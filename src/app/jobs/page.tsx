/**
 * @file 任务列表页 - 全局任务监控
 * @description 展示当前用户的所有生成任务及其状态
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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

const STATUS_TONE: Record<string, "default" | "accent" | "success" | "danger"> = {
  queued: "default",
  running: "accent",
  completed: "success",
  failed: "danger",
  cancelled: "default",
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
        <div>
          <h1 className="text-2xl font-bold text-ink">任务列表</h1>
          <p className="mt-1 text-sm text-muted">查看生成任务的执行状态与进度</p>
        </div>
        {hasRunning && (
          <div className="flex items-center gap-2 text-sm text-accent">
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
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
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              filter === f.key ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-faint">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="📋" title="暂无任务" hint="生成剧集或分镜后，任务会显示在这里" />
        </div>
      ) : (
        <div className="mt-4 grid gap-2 animate-fade-in">
          {filtered.map((job) => (
            <Card key={job.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{TYPE_LABEL[job.type] || job.type}</span>
                  <Badge tone={STATUS_TONE[job.status] || "default"}>
                    {STATUS_LABEL[job.status] || job.status}
                  </Badge>
                </div>
                <span className="text-xs text-faint">
                  {new Date(job.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>

              {/* 进度条 */}
              {job.status === "running" && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-accent transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="text-xs text-muted">{job.doneSteps}/{job.totalSteps}</span>
                </div>
              )}

              {/* 错误信息 */}
              {job.status === "failed" && job.errorMessage && (
                <p className="mt-2 text-xs text-danger">{job.errorMessage}</p>
              )}

              {/* 操作按钮 */}
              <div className="mt-3 flex items-center gap-3">
                {job.episodeId && (
                  <Link href={`/episodes/${job.episodeId}`} className="text-xs text-accent hover:text-accent-strong">
                    查看分镜 -&gt;
                  </Link>
                )}
                {(job.status === "running" || job.status === "queued") && (
                  <button onClick={() => cancelJob(job.id)} className="text-xs text-danger transition hover:text-danger/70">
                    取消
                  </button>
                )}
                {job.status === "failed" && (
                  <button onClick={() => retryJob(job.id)} className="text-xs text-accent transition hover:text-accent-strong">
                    重试
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
