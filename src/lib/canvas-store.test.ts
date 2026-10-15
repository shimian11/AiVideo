/**
 * @file 画布状态层测试
 * @description
 * 覆盖 `loadCachedWorkflow` 的缓存读取与容错。
 *
 * 这个函数是「刷新不丢用户布局」的关键：studio 页面首次加载时必须
 * 先通过它判断有没有缓存，再决定整体构建还是增量合并。
 * 若这里行为不对，用户拖好的节点布局会在刷新后被数据库数据覆盖。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { loadCachedWorkflow } from "./canvas-store";
import type { CanvasNode } from "./canvas-types";

const KEY = "agnes_canvas_series_x";

function seed(nodes: unknown[], edges: unknown[] = []) {
  localStorage.setItem(KEY, JSON.stringify({ nodes, edges, viewport: { x: 0, y: 0, scale: 1 } }));
}

function node(id: string): CanvasNode {
  return { id, kind: "SHOT", title: id, position: { x: 10, y: 20 } };
}

beforeEach(() => {
  localStorage.clear();
});

describe("loadCachedWorkflow", () => {
  it("无缓存时返回 null", () => {
    expect(loadCachedWorkflow("series_x")).toBeNull();
  });

  it("有缓存时返回节点与连线", () => {
    seed([node("a"), node("b")], [{ id: "e1", source: "a", target: "b" }]);
    const cached = loadCachedWorkflow("series_x");
    expect(cached).not.toBeNull();
    expect(cached!.nodes).toHaveLength(2);
    expect(cached!.edges).toHaveLength(1);
    expect(cached!.nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it("缓存 JSON 损坏时返回 null 而不抛错", () => {
    localStorage.setItem(KEY, "{ 这不是合法 JSON");
    expect(loadCachedWorkflow("series_x")).toBeNull();
  });

  it("节点为空数组时返回 null（视为无有效缓存）", () => {
    seed([]);
    expect(loadCachedWorkflow("series_x")).toBeNull();
  });

  it("缺 edges 字段时返回空数组而不抛错", () => {
    localStorage.setItem(KEY, JSON.stringify({ nodes: [node("a")] }));
    const cached = loadCachedWorkflow("series_x");
    expect(cached!.nodes).toHaveLength(1);
    expect(cached!.edges).toEqual([]);
  });

  it("不同 seriesId 的缓存互相隔离", () => {
    seed([node("a")]);
    localStorage.setItem(
      "agnes_canvas_series_y",
      JSON.stringify({ nodes: [node("b")], edges: [] }),
    );
    expect(loadCachedWorkflow("series_x")!.nodes[0].id).toBe("a");
    expect(loadCachedWorkflow("series_y")!.nodes[0].id).toBe("b");
  });
});
