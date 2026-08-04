/**
 * @file 剧集列表与创建页（仪表盘）
 * @description
 * 短剧平台首页，展示当前用户的所有剧集，并支持创建新剧集。
 * 页面以卡片网格展示每部剧集的标题、简介、题材、角色/场景/季数量，
 * 点击卡片跳转至剧集详情页；点击「创建新剧集」弹出表单弹窗。
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardLink } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";

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

  // 剧集状态 -> Badge 色调映射
  const statusTone: Record<string, "default" | "accent" | "success"> = {
    planning: "default",
    production: "accent",
    completed: "success",
    archived: "default",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">我的剧集</h1>
          <p className="mt-1 text-sm text-muted">管理你的短剧项目，点击卡片进入详情</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 创建新剧集</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-faint">加载中…</div>
      ) : items.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            icon="🎬"
            title="还没有剧集"
            hint="点击右上角按钮，创建你的第一部短剧"
            action={
              <Button onClick={() => setShowCreate(true)}>+ 创建新剧集</Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          {items.map((s) => (
            <CardLink key={s.id} href={`/series/${s.id}`} className="p-5">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-ink group-hover:text-accent">
                  {s.title}
                </h2>
                <Badge tone={statusTone[s.status] || "default"}>
                  {statusLabel[s.status] || s.status}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted">
                {s.synopsis || "暂无简介"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-faint">
                <Badge tone="accent">{s.genre}</Badge>
                <span>{s._count.seasons} 季</span>
                <span>{s._count.characters} 角色</span>
                <span>{s._count.locations} 场景</span>
                <span>计划 {s.targetCount} 集</span>
              </div>
            </CardLink>
          ))}
        </div>
      )}

      {/* 创建剧集弹窗 */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="创建新剧集" maxWidth="max-w-md">
        <div className="flex flex-col gap-3">
          <Field label="标题" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：都市逆袭之重生2026"
            />
          </Field>
          <Field label="简介">
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              rows={3}
              placeholder="一句话描述故事核心…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="题材">
              <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="计划集数">
              <Input
                type="number"
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                min={1}
                max={200}
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowCreate(false)}>
            取消
          </Button>
          <Button onClick={create} disabled={creating}>
            {creating ? "创建中…" : "创建"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
