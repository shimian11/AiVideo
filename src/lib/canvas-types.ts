/**
 * @file 画布工作流类型定义
 * @description
 * 复刻 libTV 的「无限画布 + 节点式工作流」所需的核心类型。
 *
 * 与 libTV 的对应关系：
 * - 文本节点  -> TEXT    （自由笔记 / 创意草稿）
 * - 脚本节点  -> SCRIPT  （AI 剧本生成与拆分，对应 libTV 的脚本节点）
 * - 图片节点  -> IMAGE   （角色定妆照 / 场景参考图 / 分镜关键帧）
 * - 视频节点  -> VIDEO   （分镜动态片段）
 * - 音频节点  -> AUDIO   （配音 / 音效，当前为占位）
 * - 资源节点  -> CHARACTER / LOCATION / STYLE（可复用的剧集档案，libTV 的资源库）
 * - 分镜节点  -> SHOT    （libTV 的分镜序列节点，聚合关键帧与视频）
 *
 * 设计约束：所有坐标均为「画布世界坐标」，与屏幕坐标通过 Viewport 变换互转。
 */

/** 画布视口：画布原点相对屏幕左上角的偏移量 + 缩放倍率 */
export interface Viewport {
  /** 画布原点在屏幕上的 x 偏移（px） */
  x: number;
  /** 画布原点在屏幕上的 y 偏移（px） */
  y: number;
  /** 缩放倍率，0.2 ~ 2.5 */
  scale: number;
}

/** 二维点（世界坐标或屏幕坐标，取决于上下文） */
export interface Point {
  x: number;
  y: number;
}

/** 节点在画布上的尺寸（世界坐标 px） */
export interface NodeSize {
  width: number;
  height: number;
}

/** 连线端点所在侧 */
export type PortSide = "left" | "right" | "top" | "bottom";

/** 画布节点类型 */
export type NodeKind =
  | "TEXT"
  | "SCRIPT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "CHARACTER"
  | "LOCATION"
  | "STYLE"
  | "SHOT";

/** 画布节点 */
export interface CanvasNode {
  id: string;
  kind: NodeKind;
  /** 世界坐标位置（节点左上角） */
  position: Point;
  /** 关联的实体 ID：Script.id / Shot.id / Character.id / Location.id / StyleProfile.id */
  refId?: string;
  /** 节点标题 */
  title: string;
  /** 摘要信息，按类型不同含义不同 */
  subtitle?: string;
  /** 媒体 URL（关键帧 / 视频 / 参考图） */
  mediaUrl?: string | null;
  /** 生成状态，与 Shot.status 对齐 */
  status?: string;
  /** 自由文本节点内容 */
  text?: string;
  /** 节点携带的上下文（角色描述、场景、风格等），沿连线传播 */
  context?: Record<string, string>;
}

/** 画布连线：表达数据流向，source 的输出作为 target 的输入上下文 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  /** source 上的输出端点名称，如 "image" / "prompt" */
  sourcePort?: string;
  /** target 上的输入端点名称 */
  targetPort?: string;
}

/** 一份完整的画布工作流 */
export interface CanvasWorkflow {
  id: string;
  seriesId: string;
  title: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 各类节点的默认尺寸（世界坐标 px） */
export const NODE_SIZES: Record<NodeKind, NodeSize> = {
  TEXT: { width: 260, height: 180 },
  SCRIPT: { width: 280, height: 220 },
  IMAGE: { width: 200, height: 240 },
  VIDEO: { width: 220, height: 220 },
  AUDIO: { width: 200, height: 140 },
  CHARACTER: { width: 220, height: 200 },
  LOCATION: { width: 220, height: 200 },
  STYLE: { width: 220, height: 180 },
  SHOT: { width: 280, height: 320 },
};

/** 视口缩放边界 */
export const SCALE_MIN = 0.2;
export const SCALE_MAX = 2.5;
export const SCALE_DEFAULT = 1;

/** 节点类型中文标签 */
export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  TEXT: "文本",
  SCRIPT: "脚本",
  IMAGE: "图片",
  VIDEO: "视频",
  AUDIO: "音频",
  CHARACTER: "角色",
  LOCATION: "场景",
  STYLE: "风格",
  SHOT: "分镜",
};
