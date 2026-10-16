/**
 * @file 画布节点卡片
 * @description
 * 按 libTV 的五类节点（文本 / 图片 / 视频 / 音频 / 脚本）外加本项目特有的
 * 资源节点（角色 / 场景 / 风格）与分镜节点渲染。
 *
 * 每类节点只渲染与自己相关的内容与操作，公共的标题栏、状态点、输出端口
 * 与删除按钮统一处理。
 */

"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "./Icon";
import { NODE_KIND_LABEL, NODE_SIZES, type CanvasNode } from "@/lib/canvas-types";
import type { CanvasWorkflowApi } from "@/lib/canvas-store";

/**
 * 节点类型 -> 图标。
 * 不用 emoji：彩色 emoji 依赖系统 emoji 字体，在无该字体的环境
 * （headless Chrome、Linux 服务器）会渲染成空白，浏览器自测已实测到。
 */
const NODE_ICON: Record<string, IconName> = {
  TEXT: "text",
  SCRIPT: "script",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  CHARACTER: "character",
  LOCATION: "location",
  STYLE: "style",
  SHOT: "shot",
};

/** 生成状态 -> 徽标色调 */
const STATUS_TONE: Record<string, "default" | "accent" | "success" | "danger" | "warning"> = {
  pending: "default",
  keyframe_done: "accent",
  video_done: "accent",
  completed: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待生成",
  keyframe_done: "关键帧已生成",
  video_done: "视频已生成",
  completed: "已完成",
  failed: "失败",
};

export function WorkflowNodeCard({
  node,
  selected,
  linkTarget,
  onStartLink,
  onAction,
  api,
}: {
  node: CanvasNode;
  selected: boolean;
  linkTarget: boolean;
  onStartLink: (e: React.PointerEvent) => void;
  onAction?: (node: CanvasNode, action: string) => void;
  api: CanvasWorkflowApi;
}) {
  const size = NODE_SIZES[node.kind];
  const kindLabel = NODE_KIND_LABEL[node.kind];

  /** 触发节点操作；未提供处理器时忽略 */
  const act = (action: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.(node, action);
  };

  const deleteNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.removeNode(node.id);
  };

  return (
    <div
      data-node-id={node.id}
      data-node-kind={node.kind}
      className="pointer-events-auto absolute left-0 top-0 flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow"
      style={{
        width: size.width,
        minHeight: size.height,
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        borderColor: selected
          ? "var(--color-accent)"
          : linkTarget
            ? "var(--color-success)"
            : "var(--color-line)",
        boxShadow: selected
          ? "0 0 0 3px var(--color-accent-soft)"
          : linkTarget
            ? "0 0 0 3px rgba(22,163,74,0.14)"
            : undefined,
      }}
    >
      {/* 标题栏：拖拽把手 */}
      <div className="flex shrink-0 cursor-grab items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 active:cursor-grabbing">
        <span className="text-faint">
          <Icon name={NODE_ICON[node.kind] ?? "shot"} size={14} />
        </span>
        <span className="truncate text-xs font-semibold text-ink">
          {node.title || kindLabel}
        </span>
        {node.status && (
          <Badge tone={STATUS_TONE[node.status] ?? "default"} className="ml-auto shrink-0">
            {STATUS_LABEL[node.status] ?? node.status}
          </Badge>
        )}
        <button
          onClick={deleteNode}
          title="删除节点"
          className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition hover:bg-danger-soft hover:text-danger"
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      {/* 节点主体：按类型分派 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {node.kind === "TEXT" && (
          <textarea
            value={node.text ?? ""}
            onChange={(e) => api.updateNode(node.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="记录创意、备注或分镜思路…"
            className="h-full min-h-[110px] w-full resize-none rounded-lg border border-line bg-canvas p-2 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent"
          />
        )}

        {(node.kind === "CHARACTER" || node.kind === "LOCATION" || node.kind === "STYLE") && (
          <>
            {node.mediaUrl ? (
              <img
                src={node.mediaUrl}
                alt={node.title}
                className="h-24 w-full rounded-lg border border-line object-cover"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                暂无参考图
              </div>
            )}
            {node.subtitle && (
              <p className="line-clamp-3 text-xs leading-relaxed text-muted">{node.subtitle}</p>
            )}
          </>
        )}

        {node.kind === "SCRIPT" && (
          <>
            <p className="line-clamp-4 text-xs leading-relaxed text-muted">
              {node.subtitle || "（剧本内容为空）"}
            </p>
            <div className="mt-auto flex gap-2">
              <button
                onClick={act("split")}
                className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
              >
                拆分为分镜
              </button>
            </div>
          </>
        )}

        {node.kind === "IMAGE" && (
          <>
            {node.mediaUrl ? (
              <img
                src={node.mediaUrl}
                alt={node.title}
                className="max-h-40 w-full rounded-lg border border-line object-contain"
              />
            ) : (
              <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                未生成
              </div>
            )}
            <button
              onClick={act("generate-image")}
              className="mt-auto rounded-lg border border-accent px-2 py-1.5 text-xs font-medium text-accent transition hover:bg-accent-soft"
            >
              {node.mediaUrl ? "重新生成图片" : "生成图片"}
            </button>
          </>
        )}

        {node.kind === "VIDEO" && (
          <>
            {node.mediaUrl ? (
              <video
                src={node.mediaUrl}
                controls
                loop
                muted
                className="max-h-40 w-full rounded-lg border border-line bg-black object-contain"
              />
            ) : (
              <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                未生成
              </div>
            )}
            <button
              onClick={act("generate-video")}
              className="mt-auto rounded-lg border border-accent px-2 py-1.5 text-xs font-medium text-accent transition hover:bg-accent-soft"
            >
              {node.mediaUrl ? "重新生成视频" : "生成视频"}
            </button>
          </>
        )}

        {node.kind === "AUDIO" && (
          <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-xs text-faint">
            <Icon name="audio" size={22} />
            <span>配音待接入</span>
          </div>
        )}

        {node.kind === "SHOT" && (
          <>
            <div className="flex items-center gap-2 text-xs text-faint">
              <span>#{node.subtitle?.split(" · ")[0] ?? ""}</span>
              {node.context?.shotType && <span>· {node.context.shotType}</span>}
              {node.context?.duration && <span>· {node.context.duration}s</span>}
            </div>
            {node.mediaUrl ? (
              <img
                src={node.mediaUrl}
                alt={`分镜 ${node.title}`}
                className="h-36 w-full rounded-lg border border-line object-cover"
              />
            ) : (
              <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                关键帧未生成
              </div>
            )}
            {node.context?.videoUrl && (
              <video
                src={node.context.videoUrl}
                controls
                loop
                muted
                className="h-24 w-full rounded-lg border border-line bg-black object-contain"
              />
            )}
            {node.context?.dialogue && (
              <p className="line-clamp-2 flex items-start gap-1 text-xs italic text-muted">
                <Icon name="audio" size={12} className="mt-0.5 shrink-0" />
                <span>{node.context.dialogue}</span>
              </p>
            )}
            <div className="mt-auto flex gap-2">
              <button
                onClick={act("generate-shot")}
                className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
              >
                生成此分镜
              </button>
              <button
                onClick={act("open-episode")}
                title="在分镜板中打开"
                className="flex items-center rounded-lg border border-line px-2 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-ink"
              >
                <Icon name="external" size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 输出端口：拖拽到其他节点建立数据流 */}
      <div
        data-port="out"
        onPointerDown={onStartLink}
        title="拖拽以连接到其他节点"
        className="pointer-events-auto absolute right-0 top-1/2 flex h-4 w-4 -translate-y-1/2 translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-surface bg-line-strong transition hover:scale-125 hover:bg-accent"
      />
    </div>
  );
}
