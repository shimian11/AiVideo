/**
 * @file 画布工具栏
 * @description
 * 固定悬浮在画布左下角的工具条：缩放控制、适配视图、自动布局、清空。
 * 缩放百分比实时反映当前视口倍率。
 */

"use client";

import { Button } from "@/components/ui/Button";
import type { CanvasWorkflowApi } from "@/lib/canvas-store";

export function CanvasToolbar({
  api,
  containerSize,
  onFit,
}: {
  api: CanvasWorkflowApi;
  containerSize: { width: number; height: number };
  onFit: () => void;
}) {
  const percent = Math.round(api.viewport.scale * 100);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface/95 p-1 shadow-sm backdrop-blur">
      <div className="pointer-events-auto flex items-center">
        <ToolButton label="缩小" onClick={() => api.zoomBy(1 / 1.2)}>
          −
        </ToolButton>
        <span className="min-w-[3.2rem] select-none text-center text-xs font-medium tabular-nums text-muted">
          {percent}%
        </span>
        <ToolButton label="放大" onClick={() => api.zoomBy(1.2)}>
          +
        </ToolButton>
      </div>

      <Divider />

      <div className="pointer-events-auto flex items-center">
        <ToolButton label="适配视图" onClick={onFit} disabled={containerSize.width === 0}>
          ⤢
        </ToolButton>
        <ToolButton label="重置视图" onClick={api.resetView}>
          ⌂
        </ToolButton>
      </div>

      <Divider />

      <div className="pointer-events-auto flex items-center">
        <ToolButton label="自动布局" onClick={api.runAutoLayout}>
          ⠿
        </ToolButton>
        <ToolButton label="清空画布" onClick={api.clear}>
          🗑
        </ToolButton>
      </div>

      <div className="pointer-events-auto hidden items-center gap-2 px-2 text-[11px] text-faint sm:flex">
        <span>{api.nodes.length} 节点</span>
        <span>·</span>
        <span>{api.edges.length} 连线</span>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-muted transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" />;
}

/** 供外层复用的空状态提示 */
export function CanvasEmptyHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/90 px-8 py-6 text-center backdrop-blur">
        <span className="text-2xl opacity-50">🎬</span>
        <p className="text-sm font-medium text-ink">画布是空的</p>
        <p className="max-w-[16rem] text-xs leading-relaxed text-faint">
          双击画布空白处创建节点，或点击下方按钮从剧本 / 角色 / 场景 / 风格开始搭建工作流
        </p>
        <Button size="sm" onClick={onCreate}>
          + 创建第一个节点
        </Button>
      </div>
    </div>
  );
}
