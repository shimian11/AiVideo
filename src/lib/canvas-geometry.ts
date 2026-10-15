/**
 * @file 画布几何计算（纯函数，无副作用）
 * @description
 * 无限画布的核心数学：屏幕坐标 <-> 世界坐标变换、围绕锚点缩放、
 * 连线贝塞尔路径生成、节点端点定位。
 *
 * 全部为纯函数，便于单元测试（见 canvas-geometry.test.ts）。
 */

import {
  SCALE_MAX,
  SCALE_MIN,
  NODE_SIZES,
  type NodeKind,
  type NodeSize,
  type Point,
  type PortSide,
  type Viewport,
} from "./canvas-types";

export type { Point, Viewport };

/** 屏幕坐标转世界坐标 */
export function screenToWorld(screen: Point, viewport: Viewport): Point {
  return {
    x: (screen.x - viewport.x) / viewport.scale,
    y: (screen.y - viewport.y) / viewport.scale,
  };
}

/** 世界坐标转屏幕坐标 */
export function worldToScreen(world: Point, viewport: Viewport): Point {
  return {
    x: world.x * viewport.scale + viewport.x,
    y: world.y * viewport.scale + viewport.y,
  };
}

/** 把缩放倍率限制在合法区间 */
export function clampScale(scale: number): number {
  // NaN 说明输入已损坏，退化为默认值；±Infinity 交给 min/max 夹到边界
  if (Number.isNaN(scale)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

/**
 * 围绕某个屏幕锚点缩放。
 *
 * 要求：锚点对应的世界坐标在缩放前后保持不变。
 * 推导：world = (screen - offset) / scale
 *       => offset = screen - world * scale
 *
 * @param anchorScreen 缩放锚点的屏幕坐标（通常是鼠标位置）
 * @param nextScale 目标缩放倍率（会被 clamp）
 * @param viewport 当前视口
 * @returns 新的视口，保证 anchorScreen 对应的世界坐标不变
 */
export function zoomAt(
  anchorScreen: Point,
  nextScale: number,
  viewport: Viewport,
): Viewport {
  const scale = clampScale(nextScale);
  const anchorWorld = screenToWorld(anchorScreen, viewport);
  return {
    scale,
    x: anchorScreen.x - anchorWorld.x * scale,
    y: anchorScreen.y - anchorWorld.y * scale,
  };
}

/**
 * 获取节点某个连接端点在世界坐标中的位置。
 * 节点原点为左上角，宽高取 NODE_SIZES 中的默认值。
 */
export function getPortPosition(
  position: Point,
  kind: NodeKind,
  side: PortSide,
  size?: NodeSize,
): Point {
  const { width, height } = size ?? NODE_SIZES[kind];
  switch (side) {
    case "left":
      return { x: position.x, y: position.y + height / 2 };
    case "right":
      return { x: position.x + width, y: position.y + height / 2 };
    case "top":
      return { x: position.x + width / 2, y: position.y };
    case "bottom":
      return { x: position.x + width / 2, y: position.y + height };
  }
}

/**
 * 生成水平方向的三次贝塞尔曲线路径（连线用）。
 *
 * 从 source 右端连到 target 左端。控制点水平外扩，距离与两端水平间距成正比，
 * 保证无论两端相距多远，曲线都不会出现回折。
 *
 * @returns SVG path 的 d 属性
 */
export function edgePath(from: Point, to: Point): string {
  const dx = Math.max(48, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/** 生成带箭头的端点 marker 的唯一 id */
export function arrowMarkerId(color: string): string {
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** 判断世界坐标点是否落在节点矩形内（用于点击命中测试） */
export function isPointInNode(
  point: Point,
  position: Point,
  kind: NodeKind,
  size?: NodeSize,
): boolean {
  const { width, height } = size ?? NODE_SIZES[kind];
  return (
    point.x >= position.x &&
    point.x <= position.x + width &&
    point.y >= position.y &&
    point.y <= position.y + height
  );
}

/**
 * 自动布局：按「资源层 -> 分镜层 -> 成片段」的数据流分层摆放。
 *
 * 注意：读取节点时必须只使用累加器 `index` 作为游标。若在循环里同时使用
 * 循环变量 `i` 与 `index` 相加（`nodeKinds[index + i]`），而 `index` 又在
 * 循环体内递增，会导致每次实际步进 2 个节点、跳号直至越界。
 *
 * @param nodeKinds 各节点类型（与 nodes 顺序一致）
 * @param columns 每层的节点数量，从第 0 层开始
 * @returns 与输入等长的坐标数组
 */
export function autoLayout(
  nodeKinds: readonly NodeKind[],
  columns: readonly number[],
): Point[] {
  const COL_GAP = 120;
  const ROW_GAP = 60;
  const NODE_COL_WIDTH = 320;
  const result: Point[] = [];
  let index = 0;

  /** 在第 col 列摆放 count 个节点，数量按剩余节点数收敛，层内纵向居中 */
  const layoutColumn = (col: number, count: number) => {
    const actual = Math.min(count, nodeKinds.length - index);
    if (actual <= 0) return;

    let totalHeight = (actual - 1) * ROW_GAP;
    for (let i = 0; i < actual; i++) {
      totalHeight += NODE_SIZES[nodeKinds[index + i]].height;
    }

    let y = -totalHeight / 2;
    for (let i = 0; i < actual; i++) {
      const kind = nodeKinds[index];
      result.push({ x: col * (NODE_COL_WIDTH + COL_GAP), y });
      y += NODE_SIZES[kind].height + ROW_GAP;
      index += 1;
    }
  };

  columns.forEach((count, col) => layoutColumn(col, count));

  // 兜底：columns 之和小于节点数时，剩余节点每列一个继续向右排开
  let col = columns.length;
  while (index < nodeKinds.length) {
    layoutColumn(col, 1);
    col += 1;
  }

  return result;
}
