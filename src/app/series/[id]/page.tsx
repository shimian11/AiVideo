/**
 * @file 剧集详情页
 * @description
 * 展示单部剧集的完整信息，通过 Tab 切换不同视图：
 * 概览（简介 + 资源统计）、角色库、场景库、风格设定、剧本管理、集数列表。
 * 是剧集制作的中央枢纽页，角色/场景/风格/剧本均由此进入管理。
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { Card, CardLink } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

/** 角色数据结构 */
interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  personality: string | null;
  outfit: string | null;
  features: string | null;
  referenceUrl: string | null;
}

/** 场景数据结构 */
interface Location {
  id: string;
  name: string;
  description: string;
  mood: string | null;
  referenceUrl: string | null;
}

/** 风格设定数据结构 */
interface StyleProfile {
  id: string;
  name: string;
  artStyle: string;
  colorPalette: string | null;
  cameraStyle: string | null;
}

/** 集数据结构 */
interface Episode {
  id: string;
  number: number;
  title: string | null;
  status: string;
  duration: number | null;
}

/** 剧集详情完整数据结构（含所有关联资源） */
interface SeriesDetail {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  status: string;
  targetCount: number;
  characters: Character[];
  locations: Location[];
  styles: StyleProfile[];
  scripts: { id: string; title: string; content: string; version: number }[];
  seasons: { id: string; number: number; title: string | null; episodes: Episode[] }[];
}

/**
 * 剧集详情页组件。
 *
 * 通过路由参数 id 获取剧集 ID，拉取剧集完整数据后按 Tab 展示不同资源。
 */
export default function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // ---- 数据与加载状态 ----
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // 当前激活的 Tab
  const [tab, setTab] = useState<"overview" | "characters" | "locations" | "styles" | "scripts" | "episodes">("overview");

  useEffect(() => {
    loadSeries();
  }, [id]);

  /** 拉取剧集详情。 */
  async function loadSeries() {
    setLoading(true);
    try {
      const res = await fetch(`/api/series/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSeries(data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-faint">加载中…</div>;
  }
  if (!series) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-danger">剧集不存在</div>;
  }

  // 剧集状态码 -> 中文标签
  const statusLabel: Record<string, string> = {
    planning: "规划中",
    production: "制作中",
    completed: "已完成",
    archived: "已归档",
  };

  // Tab 配置：标签后附带资源数量
  const tabs = [
    { key: "overview" as const, label: "概览" },
    { key: "characters" as const, label: `角色 (${series.characters.length})` },
    { key: "locations" as const, label: `场景 (${series.locations.length})` },
    { key: "styles" as const, label: `风格 (${series.styles.length})` },
    { key: "scripts" as const, label: "剧本" },
    { key: "episodes" as const, label: "集数" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 animate-fade-in">
      {/* 面包屑 */}
      <Link href="/dashboard" className="text-sm text-faint transition hover:text-accent">
        ← 返回剧集列表
      </Link>

      {/* 标题区 */}
      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{series.title}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Badge tone="accent">{series.genre}</Badge>
            <span>{statusLabel[series.status] || series.status}</span>
            <span>·</span>
            <span>计划 {series.targetCount} 集</span>
          </p>
        </div>
        <Link
          href={`/series/${id}/generate-video`}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent/20 transition-all duration-200 hover:bg-accent-strong"
        >
          AI 生视频
        </Link>
      </div>

      {/* Tab 导航 */}
      <div className="mt-6 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="mt-6">
        {tab === "overview" && (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-sm font-semibold text-ink">故事简介</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {series.synopsis || "暂无简介"}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <StatCard label="角色" value={series.characters.length} href={`/series/${id}/characters`} />
              <StatCard label="场景" value={series.locations.length} href={`/series/${id}/locations`} />
              <StatCard label="风格设定" value={series.styles.length} href={`/series/${id}/styles`} />
            </div>
          </div>
        )}

        {tab === "characters" && (
          <EntityList
            title="角色库"
            description="角色档案跨集复用，确保人物外观一致性"
            emptyText="还没有角色，先创建角色档案"
            createHref={`/series/${id}/characters/new`}
            items={series.characters.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: c.role,
              desc: c.description,
              imageUrl: c.referenceUrl,
            }))}
          />
        )}

        {tab === "locations" && (
          <EntityList
            title="场景库"
            description="场景档案跨集复用，确保环境风格统一"
            emptyText="还没有场景，先创建场景档案"
            createHref={`/series/${id}/locations/new`}
            items={series.locations.map((l) => ({
              id: l.id,
              title: l.name,
              subtitle: l.mood || "",
              desc: l.description,
              imageUrl: l.referenceUrl,
            }))}
          />
        )}

        {tab === "styles" && (
          <EntityList
            title="风格设定"
            description="定义画风、色调和镜头语言，全局应用到所有分镜"
            emptyText="还没有风格设定"
            createHref={`/series/${id}/styles/new`}
            items={series.styles.map((s) => ({
              id: s.id,
              title: s.name,
              subtitle: s.colorPalette || "",
              desc: s.artStyle,
            }))}
          />
        )}

        {tab === "scripts" && (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">剧本管理</h3>
                <p className="mt-0.5 text-xs text-faint">AI生成或手动创建剧本，然后拆分为分镜</p>
              </div>
              <Link
                href={`/series/${id}/scripts`}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-accent/20 transition-all duration-200 hover:bg-accent-strong"
              >
                管理剧本 -&gt;
              </Link>
            </div>
            {series.scripts.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="还没有剧本" hint="前往剧本管理页创建或用 AI 生成" />
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                {series.scripts.map((s) => (
                  <Card key={s.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">{s.title}</span>
                      <span className="text-xs text-faint">v{s.version}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{s.content}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "episodes" && (
          <div>
            {series.seasons.map((season) => (
              <div key={season.id} className="mb-6">
                <h3 className="text-sm font-semibold text-ink">
                  {season.title || `第 ${season.number} 季`}
                </h3>
                {season.episodes.length === 0 ? (
                  <p className="mt-2 text-sm text-faint">暂无集数，将在剧本拆分后自动生成</p>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {season.episodes.map((ep) => (
                      <Link
                        key={ep.id}
                        href={`/episodes/${ep.id}`}
                        className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition-all duration-200 hover:border-accent/40"
                      >
                        <div>
                          <span className="font-medium text-ink">第 {ep.number} 集</span>
                          {ep.title && <span className="ml-2 text-sm text-muted">{ep.title}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-faint">
                          <span>{ep.duration || 60}s</span>
                          <Badge>{ep.status}</Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 统计卡片：展示某类资源的数量，点击跳转对应管理页。
 */
function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <CardLink href={href} className="p-4 text-center">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </CardLink>
  );
}

/**
 * 通用实体列表组件。
 *
 * 用于角色、场景、风格等资源的统一展示：标题 + 描述 + 可选参考图，空态时引导创建。
 */
function EntityList({
  title,
  description,
  emptyText,
  createHref,
  items,
}: {
  title: string;
  description: string;
  emptyText: string;
  createHref: string;
  items: { id: string; title: string; subtitle: string; desc: string; imageUrl?: string | null }[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-faint">{description}</p>
        </div>
        <Link
          href={createHref}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-accent/20 transition-all duration-200 hover:bg-accent-strong"
        >
          + 新增
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={emptyText} />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4 transition-all duration-200 hover:border-accent/30">
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.title} className="mb-3 h-32 w-full rounded-lg object-cover" />
              )}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-ink">{item.title}</h4>
                {item.subtitle && <Badge>{item.subtitle}</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{item.desc}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
