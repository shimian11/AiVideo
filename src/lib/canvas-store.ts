/**
 * @file 画布工作流状态管理
 * @description
 * 复刻 libTV 的节点式工作流状态层：节点 / 连线的增删改、视口平移缩放、
 * 自动布局、localStorage 持久化（按 seriesId 隔离）。
 *
 * 拖拽与拉线过程中的「临时状态」不在此层，由 Canvas 组件内部维护，
 * 避免每次 pointermove 都触发全局状态广播。
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCALE_DEFAULT,
  type CanvasEdge,
  type CanvasNode,
  type CanvasWorkflow,
  type NodeKind,
  type Point,
  type Viewport,
} from "./canvas-types";
import { autoLayout, clampScale, zoomAt } from "./canvas-geometry";

const STORAGE_PREFIX = "agnes_canvas_";

function storageKey(seriesId: string): string {
  return `${STORAGE_PREFIX}${seriesId}`;
}

export interface UseCanvasWorkflowOptions {
  seriesId: string;
  title?: string;
  /** 首次进入时用于生成初始工作流的节点（无本地缓存时生效） */
  initialNodes?: CanvasNode[];
  initialEdges?: CanvasEdge[];
}

export interface CanvasWorkflowApi {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  addNode: (kind: NodeKind, at?: Point, patch?: Partial<CanvasNode>) => string;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: Point) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (id: string) => void;
  setViewport: (next: Viewport | ((v: Viewport) => Viewport)) => void;
  /** 整体替换节点与连线（用于「同步剧集数据」） */
  replaceWorkflow: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  /** 以某个屏幕锚点为中心缩放 */
  zoomAtScreen: (anchorScreen: Point, nextScale: number) => void;
  zoomBy: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetView: () => void;
  /** 按数据流重新自动布局（保留节点，重置坐标） */
  runAutoLayout: () => void;
  /** 把视口适配到内容包围盒 */
  fitToContent: (containerSize: { width: number; height: number }) => void;
  clear: () => void;
}

let nodeSeq = 0;
function nextNodeId(kind: NodeKind): string {
  nodeSeq += 1;
  return `n${nodeSeq}_${kind.toLowerCase()}`;
}

/**
 * 同步读取本地缓存的工作流（不经过 React 状态）。
 *
 * 存在的理由：调用方（如 studio 页首次加载）需要先判断「有没有缓存布局」，
 * 再决定是整体构建还是增量合并。如果只能通过 hook 的状态判断，
 * 会撞上 effect 执行顺序问题——hydration effect 刚 setState，
 * 同轮的另一个 effect 读到的仍是旧值，导致缓存布局被随后到来的
 * 数据库数据整体覆盖，用户拖好的布局刷新一次就丢。
 *
 * @param seriesId - 剧集 ID
 * @returns 缓存的节点与连线；无缓存或缓存损坏时返回 null
 */
export function loadCachedWorkflow(
  seriesId: string,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } | null {
  try {
    const raw = localStorage.getItem(storageKey(seriesId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<CanvasWorkflow>;
    if (!Array.isArray(saved.nodes) || saved.nodes.length === 0) return null;
    return {
      nodes: saved.nodes as CanvasNode[],
      edges: Array.isArray(saved.edges) ? (saved.edges as CanvasEdge[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * 画布工作流 Hook。
 *
 * 持久化策略：节点 / 连线 / 视口整体序列化到 localStorage。
 * 因为节点携带的是 refId（引用剧集实体），本地缓存不会与数据库实体脱钩，
 * 重新拉取剧集数据后按 refId 合并即可。
 */
export function useCanvasWorkflow(
  options: UseCanvasWorkflowOptions,
): CanvasWorkflowApi {
  const { seriesId, title = "工作流", initialNodes = [], initialEdges = [] } = options;

  const [workflow, setWorkflow] = useState<CanvasWorkflow>(() => ({
    id: seriesId,
    seriesId,
    title,
    viewport: { x: 0, y: 0, scale: SCALE_DEFAULT },
    nodes: initialNodes,
    edges: initialEdges,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // ---- 本地缓存恢复：仅在首次挂载时执行一次 ----
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(storageKey(seriesId));
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<CanvasWorkflow>;
      if (Array.isArray(saved.nodes) && saved.nodes.length > 0) {
        setWorkflow((prev) => ({
          ...prev,
          nodes: saved.nodes as CanvasNode[],
          edges: Array.isArray(saved.edges) ? (saved.edges as CanvasEdge[]) : [],
          viewport: saved.viewport ?? prev.viewport,
        }));
      }
    } catch {
      // 缓存损坏时静默回退到初始工作流
    }
  }, [seriesId]);

  // ---- 变更后写回缓存（防抖，避免拖拽时高频写盘） ----
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey(seriesId),
          JSON.stringify({
            nodes: workflow.nodes,
            edges: workflow.edges,
            viewport: workflow.viewport,
          }),
        );
      } catch {
        // 存储配额溢出时忽略，不影响画布使用
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [workflow, seriesId]);

  const setViewport = useCallback<CanvasWorkflowApi["setViewport"]>((next) => {
    setWorkflow((prev) => {
      const resolved = typeof next === "function" ? next(prev.viewport) : next;
      return { ...prev, viewport: resolved };
    });
  }, []);

  const addNode = useCallback<CanvasWorkflowApi["addNode"]>(
    (kind, at, patch) => {
      const id = nextNodeId(kind);
      setWorkflow((prev) => ({
        ...prev,
        nodes: [
          ...prev.nodes,
          {
            id,
            kind,
            title: patch?.title ?? "",
            position: at ?? { x: 0, y: 0 },
            ...patch,
          },
        ],
      }));
      return id;
    },
    [],
  );

  const updateNode = useCallback<CanvasWorkflowApi["updateNode"]>((id, patch) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  const removeNode = useCallback<CanvasWorkflowApi["removeNode"]>((id) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      // 连带删除与该节点相关的连线，避免出现悬空边
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const moveNode = useCallback<CanvasWorkflowApi["moveNode"]>((id, position) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    }));
  }, []);

  const addEdge = useCallback<CanvasWorkflowApi["addEdge"]>((source, target) => {
    if (source === target) return;
    setWorkflow((prev) => {
      // 同一对节点之间只保留一条边，重复拉线时忽略
      const exists = prev.edges.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source),
      );
      if (exists) return prev;
      return {
        ...prev,
        edges: [
          ...prev.edges,
          { id: `e_${source}_${target}`, source, target },
        ],
      };
    });
  }, []);

  const removeEdge = useCallback<CanvasWorkflowApi["removeEdge"]>((id) => {
    setWorkflow((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== id),
    }));
  }, []);

  const zoomAtScreen = useCallback<CanvasWorkflowApi["zoomAtScreen"]>(
    (anchorScreen, nextScale) => {
      setWorkflow((prev) => ({
        ...prev,
        viewport: zoomAt(anchorScreen, nextScale, prev.viewport),
      }));
    },
    [],
  );

  const zoomBy = useCallback<CanvasWorkflowApi["zoomBy"]>(
    (factor) => {
      setWorkflow((prev) => ({
        ...prev,
        viewport: { ...prev.viewport, scale: clampScale(prev.viewport.scale * factor) },
      }));
    },
    [],
  );

  const panBy = useCallback<CanvasWorkflowApi["panBy"]>((dx, dy) => {
    setWorkflow((prev) => ({
      ...prev,
      viewport: { ...prev.viewport, x: prev.viewport.x + dx, y: prev.viewport.y + dy },
    }));
  }, []);

  const resetView = useCallback<CanvasWorkflowApi["resetView"]>(() => {
    setWorkflow((prev) => ({ ...prev, viewport: { x: 0, y: 0, scale: SCALE_DEFAULT } }));
  }, []);

  const runAutoLayout = useCallback(() => {
    setWorkflow((prev) => {
      if (prev.nodes.length === 0) return prev;
      const points = autoLayout(
        prev.nodes.map((n) => n.kind),
        [3, 1],
      );
      return {
        ...prev,
        nodes: prev.nodes.map((n, i) => ({ ...n, position: points[i] ?? n.position })),
      };
    });
  }, []);

  const fitToContent = useCallback<CanvasWorkflowApi["fitToContent"]>(
    (containerSize) => {
      setWorkflow((prev) => {
        if (prev.nodes.length === 0 || containerSize.width === 0) return prev;
        const xs = prev.nodes.map((n) => n.position.x);
        const ys = prev.nodes.map((n) => n.position.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs) + 320;
        const maxY = Math.max(...ys) + 320;
        const scale = clampScale(
          Math.min(
            containerSize.width / (maxX - minX),
            containerSize.height / (maxY - minY),
            1.2,
          ),
        );
        return {
          ...prev,
          viewport: {
            scale,
            x: containerSize.width / 2 - ((minX + maxX) / 2) * scale,
            y: containerSize.height / 2 - ((minY + maxY) / 2) * scale,
          },
        };
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setWorkflow((prev) => ({ ...prev, nodes: [], edges: [] }));
    setSelectedId(null);
  }, []);

  const replaceWorkflow = useCallback<CanvasWorkflowApi["replaceWorkflow"]>(
    (nodes, edges) => {
      setWorkflow((prev) => ({ ...prev, nodes, edges }));
      setSelectedId(null);
    },
    [],
  );

  return useMemo(
    () => ({
      nodes: workflow.nodes,
      edges: workflow.edges,
      viewport: workflow.viewport,
      selectedId,
      setSelectedId,
      addNode,
      updateNode,
      removeNode,
      moveNode,
      addEdge,
      removeEdge,
      setViewport,
      replaceWorkflow,
      zoomAtScreen,
      zoomBy,
      panBy,
      resetView,
      runAutoLayout,
      fitToContent,
      clear,
    }),
    [
      workflow, selectedId, addNode, updateNode, removeNode, moveNode, addEdge,
      removeEdge, setViewport, replaceWorkflow, zoomAtScreen, zoomBy, panBy,
      resetView, runAutoLayout, fitToContent, clear,
    ],
  );
}
