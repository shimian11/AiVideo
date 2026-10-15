/**
 * @file 画布工作台（libTV 式节点工作流）
 * @description
 * 复刻 libTV 的核心交互：一块无限画布，把剧本、角色、场景、风格、分镜
 * 都变成可自由摆放的节点，节点之间用连线表达数据流向。
 *
 * 与既有页面的关系：
 *   - 数据完全来自既有 API（/api/series/[id]、/api/jobs、/api/series/[id]/scripts/split）
 *   - 生成动作复用既有 worker，不引入第二套执行引擎
 *   - 分镜板（/episodes/[id]）保留为「线性视图」，画布是「空间视图」，两者互补
 *
 * 数据流：
 *   GET /api/series/[id]?include=storyboard
 *     -> flattenSeriesForCanvas -> buildSeriesWorkflow / mergeSeriesIntoNodes
 *     -> 画布节点
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { CanvasEmptyHint } from "@/components/canvas/CanvasToolbar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCanvasWorkflow, loadCachedWorkflow } from "@/lib/canvas-store";
import {
  buildSeriesWorkflow,
  flattenSeriesForCanvas,
  mergeSeriesIntoNodes,
} from "@/lib/canvas-builder";
import type { CanvasNode, NodeKind, Point } from "@/lib/canvas-types";

/** 可创建的节点类型（资源类节点由剧集数据自动生成，不在此列） */
const CREATABLE: { kind: NodeKind; label: string; hint: string }[] = [
  { kind: "TEXT", label: "文本", hint: "记录创意、备注、分镜思路" },
  { kind: "SCRIPT", label: "脚本", hint: "手动撰写剧本片段" },
  { kind: "IMAGE", label: "图片", hint: "独立生成一张参考图" },
  { kind: "VIDEO", label: "视频", hint: "独立生成一段视频" },
  { kind: "SHOT", label: "分镜", hint: "新建一个自定义分镜" },
];

export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = use(params);
  const router = useRouter();

  const [series, setSeries] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);

  const api = useCanvasWorkflow({
    seriesId,
    title: (series?.title as string) ?? "工作流",
  });

  /** 拉取剧集完整数据（含分镜树） */
  const fetchSeries = useCallback(async () => {
    try {
      const res = await fetch(`/api/series/${seriesId}?include=storyboard`);
      if (!res.ok) throw new Error("剧集不存在或加载失败");
      const data = await res.json();
      setSeries(data);
      return data;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  // ---- 首次加载：有缓存则增量合并（保留用户布局），否则整体构建 ----
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const data = await fetchSeries();
      if (!data) return;
      const flat = flattenSeriesForCanvas(data);

      // 关键：必须先读缓存再决定策略。若直接用数据库数据整体替换，
      // hydration effect 刚恢复的用户布局会被同轮覆盖，刷新即丢布局。
      const cached = loadCachedWorkflow(seriesId);
      if (cached) {
        const merged = mergeSeriesIntoNodes(cached.nodes, flat);
        if (merged) api.replaceWorkflow(merged.nodes, merged.edges);
        return;
      }

      const { nodes, edges } = buildSeriesWorkflow(flat);
      if (nodes.length > 0) api.replaceWorkflow(nodes, edges);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  /** 同步剧集数据：保留用户布局，只刷新节点内容与新增节点 */
  const syncFromSeries = useCallback(
    async (data?: Record<string, unknown>) => {
      const raw = data ?? (await fetchSeries());
      if (!raw) return;
      const flat = flattenSeriesForCanvas(raw);
      const merged = mergeSeriesIntoNodes(api.nodes, flat);
      if (merged) api.replaceWorkflow(merged.nodes, merged.edges);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, fetchSeries],
  );

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- 创建节点 ----
  const handleCreateAt = useCallback(
    (at: Point) => {
      setShowCreateMenu(true);
      // 记住创建位置：菜单点击时使用
      createAtRef.current = at;
    },
    [],
  );
  const createAtRef = useRef<Point>({ x: 0, y: 0 });

  const createNode = (kind: NodeKind) => {
    const at = createAtRef.current;
    const titles: Record<string, string> = {
      TEXT: "文本笔记",
      SCRIPT: "剧本片段",
      IMAGE: "图片",
      VIDEO: "视频",
      SHOT: "分镜",
    };
    const id = api.addNode(kind, at, { title: titles[kind] ?? kind });
    setShowCreateMenu(false);
    api.setSelectedId(id);
    notify(`已创建「${titles[kind] ?? kind}」节点`);
  };

  // ---- 节点操作 ----
  const handleNodeAction = useCallback(
    async (node: CanvasNode, action: string) => {
      if (action === "open-episode") {
        router.push(`/episodes/${node.refId ?? seriesId}`);
        return;
      }

      if (action === "split" && node.refId) {
        setBusyNodeId(node.id);
        try {
          const res = await fetch(`/api/series/${seriesId}/scripts/split`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptId: node.refId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "拆分失败");
          notify(`拆分完成：${data.episodesCreated} 集 / ${data.shotCount} 个分镜`);
          await syncFromSeries();
        } catch (e) {
          notify(e instanceof Error ? e.message : "拆分失败");
        } finally {
          setBusyNodeId(null);
        }
        return;
      }

      if (action === "generate-shot" && node.refId) {
        setBusyNodeId(node.id);
        try {
          const res = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "generate_shot",
              shotId: node.refId,
              stepTypes: ["keyframe", "video"],
            }),
          });
          const job = await res.json();
          if (!res.ok) throw new Error(job.error || "创建任务失败");

          // 用 SSE 订阅进度，完成后刷新画布数据
          await new Promise<void>((resolve) => {
            const es = new EventSource(`/api/jobs/${job.id}/stream`);
            es.onmessage = (e) => {
              try {
                const d = JSON.parse(e.data);
                if (["completed", "failed", "cancelled"].includes(d.status)) {
                  es.close();
                  resolve();
                }
              } catch {
                /* 忽略单条解析失败 */
              }
            };
            es.onerror = () => {
              es.close();
              resolve();
            };
          });

          await syncFromSeries();
          notify("分镜生成完成，画布已更新");
        } catch (e) {
          notify(e instanceof Error ? e.message : "生成失败");
        } finally {
          setBusyNodeId(null);
        }
        return;
      }

      notify("该节点类型暂不支持此操作");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesId, router, syncFromSeries],
  );

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.25rem)] items-center justify-center text-sm text-faint">
        加载画布…
      </div>
    );
  }

  if (loadError || !series) {
    return (
      <div className="flex h-[calc(100vh-3.25rem)] flex-col items-center justify-center gap-3">
        <p className="text-sm text-danger">{loadError || "剧集不存在"}</p>
        <Link href="/dashboard" className="text-sm text-accent hover:text-accent-strong">
          返回剧集列表
        </Link>
      </div>
    );
  }

  const seriesTitle = (series.title as string) ?? "未命名剧集";

  return (
    <div className="flex h-[calc(100vh-3.25rem)] flex-col">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <Link
          href={`/series/${seriesId}`}
          className="text-sm text-faint transition hover:text-accent"
        >
          ← {seriesTitle}
        </Link>
        <span className="text-sm font-semibold text-ink">画布工作台</span>
        <Badge tone="accent">libTV 式节点流</Badge>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void syncFromSeries()}
            title="从数据库重新加载节点内容，保留你摆放的位置"
          >
            同步数据
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCreateMenu(true)}>
            + 添加节点
          </Button>
        </div>
      </header>

      {/* 画布区 */}
      <div className="relative min-h-0 flex-1">
        <WorkflowCanvas
          api={api}
          onCreateNode={handleCreateAt}
          onNodeAction={handleNodeAction}
        />

        {api.nodes.length === 0 && (
          <CanvasEmptyHint onCreate={() => setShowCreateMenu(true)} />
        )}

        {/* 操作提示 */}
        {busyNodeId && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent-strong">
            正在生成，请稍候…
          </div>
        )}

        {/* 创建节点菜单 */}
        {showCreateMenu && (
          <>
            <div
              className="absolute inset-0 z-20"
              onClick={() => setShowCreateMenu(false)}
            />
            <div className="absolute left-1/2 top-1/2 z-30 w-64 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink">
                创建节点
              </div>
              {CREATABLE.map((c) => (
                <button
                  key={c.kind}
                  onClick={() => createNode(c.kind)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-medium text-accent-strong">
                    {c.label[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{c.label}节点</span>
                    <span className="block truncate text-xs text-faint">{c.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 轻量提示 */}
        {toast && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink shadow-md">
            {toast}
          </div>
        )}

        {/* 操作说明 */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-lg border border-line bg-surface/90 px-3 py-2 text-[11px] leading-relaxed text-faint backdrop-blur md:block">
          拖拽空白处平移 · 滚轮缩放 · 拖拽节点移动<br />
          拖拽节点右侧圆点连线 · Delete 删除选中 · Esc 取消
        </div>
      </div>
    </div>
  );
}
