/**
 * @file 无限画布容器
 * @description
 * 复刻 libTV 的无限画布交互：
 * - 空白处拖拽平移，滚轮以鼠标位置为中心缩放
 * - 节点可拖拽移动，右侧输出端点可拉线到其他节点建立数据流
 * - 单击选中，Delete 删除，双击空白处创建节点
 * - 网格底纹随视口平移与缩放
 *
 * 实现要点：所有坐标运算都通过 canvas-geometry 的纯函数完成，
 * 屏幕坐标与世界坐标的转换集中在一处，避免散落的魔法计算。
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NODE_SIZES, type CanvasNode, type NodeKind, type Point } from "@/lib/canvas-types";
import { getPortPosition, screenToWorld, edgePath } from "@/lib/canvas-geometry";
import type { CanvasWorkflowApi } from "@/lib/canvas-store";
import { WorkflowNodeCard } from "./WorkflowNodeCard";
import { CanvasToolbar } from "./CanvasToolbar";

/** 画布交互模式 */
type DragMode =
  | { kind: "none" }
  | { kind: "pan"; startPointer: Point; startViewport: Point }
  | { kind: "node"; nodeId: string; startPointer: Point; startNodePos: Point }
  | { kind: "link"; sourceId: string; pointerWorld: Point };

const GRID_SIZE = 26;

export function WorkflowCanvas({
  api,
  onCreateNode,
  onNodeAction,
}: {
  api: CanvasWorkflowApi;
  /** 双击空白处时回调，由外层弹出节点创建面板 */
  onCreateNode: (at: Point) => void;
  /** 节点上的操作（生成 / 预览 / 删除等） */
  onNodeAction?: (node: CanvasNode, action: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>({ kind: "none" });
  const [hoverLinkTarget, setHoverLinkTarget] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { nodes, edges, viewport, moveNode, addEdge, setViewport, zoomAtScreen, selectedId, setSelectedId, removeNode } = api;

  /** 把浏览器事件坐标换算成容器内的屏幕坐标 */
  const toContainerPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  // ---- 容器尺寸观测：供 fitToContent 使用 ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- 滚轮缩放：必须 passive:false 才能 preventDefault 阻止页面滚动 ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const anchor = toContainerPoint(e.clientX, e.clientY);
      const factor = Math.pow(0.999, e.deltaY);
      zoomAtScreen(anchor, viewport.scale * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toContainerPoint, viewport.scale, zoomAtScreen]);

  // ---- 键盘：Delete 删除选中节点，Esc 取消选中/拉线 ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // 输入框内不拦截按键
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeNode(selectedId);
      }
      if (e.key === "Escape") {
        setDrag({ kind: "none" });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, removeNode, setSelectedId]);

  // ---- 指针交互统一入口 ----
  const onPointerDown = (e: React.PointerEvent) => {
    // 只响应主键
    if (e.button !== 0) return;
    const pointer = toContainerPoint(e.clientX, e.clientY);

    // 命中测试：从后往前（后绘制的节点在上层）
    const hit = [...nodes].reverse().find((n) => {
      const size = NODE_SIZES[n.kind];
      return (
        pointer.x >= n.position.x * viewport.scale + viewport.x &&
        pointer.x <= (n.position.x + size.width) * viewport.scale + viewport.x &&
        pointer.y >= n.position.y * viewport.scale + viewport.y &&
        pointer.y <= (n.position.y + size.height) * viewport.scale + viewport.y
      );
    });

    if (hit) {
      setSelectedId(hit.id);
      setDrag({
        kind: "node",
        nodeId: hit.id,
        startPointer: pointer,
        startNodePos: hit.position,
      });
    } else {
      setSelectedId(null);
      setDrag({ kind: "pan", startPointer: pointer, startViewport: { x: viewport.x, y: viewport.y } });
    }
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.kind === "none") return;
    const pointer = toContainerPoint(e.clientX, e.clientY);

    if (drag.kind === "pan") {
      setViewport((v) => ({
        ...v,
        x: drag.startViewport.x + (pointer.x - drag.startPointer.x),
        y: drag.startViewport.y + (pointer.y - drag.startPointer.y),
      }));
      return;
    }

    if (drag.kind === "node") {
      // 屏幕位移除以缩放倍率得到世界位移，保证任何缩放下拖拽都跟手
      const dx = (pointer.x - drag.startPointer.x) / viewport.scale;
      const dy = (pointer.y - drag.startPointer.y) / viewport.scale;
      moveNode(drag.nodeId, {
        x: drag.startNodePos.x + dx,
        y: drag.startNodePos.y + dy,
      });
      return;
    }

    if (drag.kind === "link") {
      const world = screenToWorld(pointer, viewport);
      // 实时高亮可连接的落点
      const target = nodes.find(
        (n) =>
          n.id !== drag.sourceId &&
          world.x >= n.position.x &&
          world.x <= n.position.x + NODE_SIZES[n.kind].width &&
          world.y >= n.position.y &&
          world.y <= n.position.y + NODE_SIZES[n.kind].height,
      );
      setHoverLinkTarget(target?.id ?? null);
      setDrag({ ...drag, pointerWorld: world });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.kind === "link" && hoverLinkTarget) {
      addEdge(drag.sourceId, hoverLinkTarget);
    }
    setDrag({ kind: "none" });
    setHoverLinkTarget(null);
    containerRef.current?.releasePointerCapture(e.pointerId);
  };

  /** 从输出端点开始拉线 */
  const startLink = (nodeId: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const pointer = toContainerPoint(e.clientX, e.clientY);
    setDrag({
      kind: "link",
      sourceId: nodeId,
      pointerWorld: screenToWorld(pointer, viewport),
    });
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const pointer = toContainerPoint(e.clientX, e.clientY);
    onCreateNode(screenToWorld(pointer, viewport));
  };

  const gridStyle = {
    backgroundImage: `linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)`,
    backgroundSize: `${GRID_SIZE * viewport.scale}px ${GRID_SIZE * viewport.scale}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };

  const isPanning = drag.kind === "pan";

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* 网格底纹 */}
      <div className="pointer-events-none absolute inset-0" style={gridStyle} />

      {/* 交互层 */}
      <div
        ref={containerRef}
        data-testid="canvas-layer"
        className={`absolute inset-0 touch-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* 变换层：节点与连线共享同一变换，保证相对位置恒定 */}
        <div
          data-testid="canvas-world"
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          {/* 连线层 */}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            <defs>
              <marker
                id="canvas-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-line-strong)" />
              </marker>
              <marker
                id="canvas-arrow-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const from = nodes.find((n) => n.id === edge.source);
              const to = nodes.find((n) => n.id === edge.target);
              if (!from || !to) return null;
              const p1 = getPortPosition(from.position, from.kind, "right");
              const p2 = getPortPosition(to.position, to.kind, "left");
              const isActive =
                selectedId === edge.source || selectedId === edge.target;
              return (
                <g key={edge.id}>
                  {/* 加宽透明热区，便于点击删除 */}
                  <path
                    d={edgePath(p1, p2)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      api.removeEdge(edge.id);
                    }}
                  />
                  <path
                    d={edgePath(p1, p2)}
                    fill="none"
                    stroke={isActive ? "var(--color-accent)" : "var(--color-line-strong)"}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    strokeDasharray={isActive ? undefined : undefined}
                    markerEnd={isActive ? "url(#canvas-arrow-active)" : "url(#canvas-arrow)"}
                  />
                </g>
              );
            })}

            {/* 拖拽中的临时连线 */}
            {drag.kind === "link" &&
              (() => {
                const from = nodes.find((n) => n.id === drag.sourceId);
                if (!from) return null;
                const p1 = getPortPosition(from.position, from.kind, "right");
                return (
                  <path
                    d={edgePath(p1, drag.pointerWorld)}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    markerEnd="url(#canvas-arrow-active)"
                  />
                );
              })()}
          </svg>

          {/* 节点层 */}
          {nodes.map((node) => (
            <WorkflowNodeCard
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              linkTarget={hoverLinkTarget === node.id}
              onStartLink={startLink(node.id)}
              onAction={onNodeAction}
              api={api}
            />
          ))}
        </div>
      </div>

      {/* 工具栏（固定层，不随视口变换） */}
      <CanvasToolbar
        api={api}
        containerSize={containerSize}
        onFit={() => api.fitToContent(containerSize)}
      />
    </div>
  );
}

export type { NodeKind };
