import { describe, expect, it } from "vitest";
import {
  autoLayout,
  clampScale,
  edgePath,
  getPortPosition,
  isPointInNode,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "./canvas-geometry";
import { SCALE_MAX, SCALE_MIN, type NodeKind } from "./canvas-types";

describe("坐标变换", () => {
  it("screenToWorld 与 worldToScreen 互为逆运算", () => {
    const viewport = { x: -320, y: 140, scale: 1.5 };
    const screen = { x: 200, y: 90 };
    const world = screenToWorld(screen, viewport);
    expect(world.x).toBeCloseTo((200 + 320) / 1.5, 6);
    expect(world.y).toBeCloseTo((90 - 140) / 1.5, 6);

    const back = worldToScreen(world, viewport);
    expect(back.x).toBeCloseTo(screen.x, 6);
    expect(back.y).toBeCloseTo(screen.y, 6);
  });

  it("缩放为 1 时世界坐标等于屏幕坐标减去偏移", () => {
    const viewport = { x: 50, y: 30, scale: 1 };
    expect(screenToWorld({ x: 150, y: 130 }, viewport)).toEqual({
      x: 100,
      y: 100,
    });
  });
});

describe("clampScale", () => {
  it("把越界的缩放值夹到合法区间", () => {
    expect(clampScale(0)).toBe(SCALE_MIN);
    expect(clampScale(99)).toBe(SCALE_MAX);
    expect(clampScale(1)).toBe(1);
  });

  it("对 NaN / Infinity 退化为 1", () => {
    expect(clampScale(NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(SCALE_MAX);
    expect(clampScale(-Infinity)).toBe(SCALE_MIN);
  });
});

describe("zoomAt", () => {
  it("缩放前后锚点对应的世界坐标保持不变", () => {
    const viewport = { x: 0, y: 0, scale: 1 };
    const anchor = { x: 300, y: 200 };

    const before = screenToWorld(anchor, viewport);
    const next = zoomAt(anchor, 2, viewport);
    const after = screenToWorld(anchor, next);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.scale).toBe(2);
  });

  it("在已有偏移的视口下同样保持锚点不动", () => {
    const viewport = { x: -480, y: 260, scale: 0.6 };
    const anchor = { x: 900, y: 100 };
    const before = screenToWorld(anchor, viewport);
    const next = zoomAt(anchor, 1.4, viewport);

    expect(screenToWorld(anchor, next).x).toBeCloseTo(before.x, 6);
    expect(screenToWorld(anchor, next).y).toBeCloseTo(before.y, 6);
  });

  it("超出边界的缩放被夹紧", () => {
    const next = zoomAt({ x: 10, y: 10 }, 100, { x: 0, y: 0, scale: 1 });
    expect(next.scale).toBe(SCALE_MAX);
  });
});

describe("getPortPosition", () => {
  it("默认尺寸下四个方向的端点位于边中点", () => {
    const pos = { x: 100, y: 100 };
    // SHOT 默认 280x320
    expect(getPortPosition(pos, "SHOT", "left")).toEqual({ x: 100, y: 260 });
    expect(getPortPosition(pos, "SHOT", "right")).toEqual({ x: 380, y: 260 });
    expect(getPortPosition(pos, "SHOT", "top")).toEqual({ x: 240, y: 100 });
    expect(getPortPosition(pos, "SHOT", "bottom")).toEqual({ x: 240, y: 420 });
  });

  it("支持自定义尺寸", () => {
    const size = { width: 200, height: 100 };
    expect(getPortPosition({ x: 0, y: 0 }, "TEXT", "right", size)).toEqual({
      x: 200,
      y: 50,
    });
  });
});

describe("edgePath", () => {
  it("生成以 M 开头、包含两个控制点的三次贝塞尔", () => {
    const d = edgePath({ x: 0, y: 0 }, { x: 200, y: 100 });
    expect(d.startsWith("M 0 0 C")).toBe(true);
    expect(d.match(/C/g)?.length).toBe(1);
  });

  it("水平间距很小时控制点仍保持最小外扩，避免曲线回折", () => {
    const d = edgePath({ x: 10, y: 50 }, { x: 20, y: 80 });
    // 最小外扩 48 => 第一个控制点 x = 58
    expect(d).toContain("58 50");
  });
});

describe("isPointInNode", () => {
  it("命中节点内部与边界", () => {
    const pos = { x: 0, y: 0 };
    expect(isPointInNode({ x: 10, y: 10 }, pos, "SHOT")).toBe(true);
    expect(isPointInNode({ x: 280, y: 320 }, pos, "SHOT")).toBe(true);
  });

  it("节点外部的点不命中", () => {
    expect(isPointInNode({ x: 281, y: 10 }, { x: 0, y: 0 }, "SHOT")).toBe(false);
    expect(isPointInNode({ x: -1, y: 10 }, { x: 0, y: 0 }, "SHOT")).toBe(false);
  });
});

describe("autoLayout", () => {
  it("按列数分层摆放，层内在纵向上居中", () => {
    const kinds: NodeKind[] = ["CHARACTER", "LOCATION", "STYLE", "SHOT"];
    const points = autoLayout(kinds, [3, 1]);

    // 三个资源节点 x 相同
    expect(points[0].x).toBe(points[1].x);
    expect(points[1].x).toBe(points[2].x);
    // 分镜节点在下一列
    expect(points[3].x).toBeGreaterThan(points[0].x);
    // 同层节点纵向不重叠（按顺序递减间距递增）
    expect(points[1].y).toBeGreaterThan(points[0].y);
    expect(points[2].y).toBeGreaterThan(points[1].y);
  });

  it("列数之和小于节点数时剩余节点仍被安排坐标", () => {
    const points = autoLayout(["SHOT", "SHOT", "SHOT"], [1]);
    expect(points).toHaveLength(3);
    expect(points[1].x).toBeGreaterThan(points[0].x);
    expect(points[2].x).toBeGreaterThan(points[1].x);
  });

  it("返回的坐标数量与输入一致", () => {
    const kinds = Array(6).fill("TEXT") as ("TEXT")[];
    expect(autoLayout(kinds, [2, 2, 2])).toHaveLength(6);
  });
});
