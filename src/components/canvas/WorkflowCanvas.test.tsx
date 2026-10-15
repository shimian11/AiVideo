/**
 * @file 画布容器交互测试
 * @description
 * 覆盖 libTV 式画布的核心交互：节点创建、拖拽移动、拉线连接、
 * 缩放、删除、双击创建。这些是用户每天都要用的操作，
 * 回归成本高，因此用 jsdom + fireEvent 固化成自动化断言。
 *
 * 说明：jsdom 的 getBoundingClientRect 全返回 0，
 * 因此「容器内屏幕坐标」等于 clientX/clientY，测试里按此构造坐标。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { useCanvasWorkflow } from "@/lib/canvas-store";
import type { CanvasNode } from "@/lib/canvas-types";

/** 测试用宿主：真实挂载 useCanvasWorkflow，避免手搓状态桩 */
function CanvasHost({
  initialNodes = [],
  onCreateNode,
}: {
  initialNodes?: CanvasNode[];
  onCreateNode?: (at: { x: number; y: number }) => void;
}) {
  const api = useCanvasWorkflow({
    seriesId: "test-series",
    initialNodes,
  });
  return <WorkflowCanvas api={api} onCreateNode={onCreateNode ?? (() => {})} />;
}

/** 造一个分镜节点 */
function shot(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    kind: "SHOT",
    title: `分镜 ${id}`,
    position: { x, y },
    status: "pending",
  };
}

/** 取画布交互层（挂指针事件的那个 div） */
function canvasLayer(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-testid='canvas-layer']");
  if (!el) throw new Error("未找到画布交互层");
  return el;
}

beforeEach(() => {
  localStorage.clear();
});

describe("WorkflowCanvas 基础渲染", () => {
  it("无节点时渲染空画布，不报错", () => {
    const { container } = render(<CanvasHost />);
    expect(canvasLayer(container)).toBeTruthy();
    // 工具栏应显示 0 节点 0 连线
    expect(screen.getByText("0 节点")).toBeTruthy();
    expect(screen.getByText("0 连线")).toBeTruthy();
  });

  it("节点以 data-node-id 暴露，便于定位与调试", () => {
    const { container } = render(<CanvasHost initialNodes={[shot("shot_a", 0, 0)]} />);
    const node = container.querySelector("[data-node-id='shot_a']");
    expect(node).toBeTruthy();
    expect(screen.getByText("1 节点")).toBeTruthy();
  });

  it("节点位置通过 transform 反映到 DOM", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 120, 240)]} />,
    );
    const node = container.querySelector<HTMLElement>("[data-node-id='shot_a']");
    expect(node?.style.transform).toContain("translate(120px, 240px)");
  });
});

describe("节点拖拽", () => {
  it("按住节点拖动后，位置按「屏幕位移 / 缩放」更新", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 100, 100)]} />,
    );
    const node = container.querySelector<HTMLElement>("[data-node-id='shot_a']")!;
    const layer = canvasLayer(container);

    // 在节点内按下（节点世界坐标 100..380 × 100..420，视口默认 scale=1）
    fireEvent.pointerDown(node, { clientX: 150, clientY: 150, button: 0, pointerId: 1 });
    // 移动 60,40
    fireEvent.pointerMove(layer, { clientX: 210, clientY: 190, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 210, clientY: 190, pointerId: 1 });

    expect(node.style.transform).toContain("translate(160px, 140px)");
  });

  it("非主键按下不触发拖拽", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 100, 100)]} />,
    );
    const node = container.querySelector<HTMLElement>("[data-node-id='shot_a']")!;
    const layer = canvasLayer(container);

    fireEvent.pointerDown(node, { clientX: 150, clientY: 150, button: 2, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 300, clientY: 300, pointerId: 1 });

    // 右键不应移动节点
    expect(node.style.transform).toContain("translate(100px, 100px)");
  });
});

describe("空白处平移", () => {
  it("在空白处拖动可平移视口，节点屏幕位置随之改变", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 0, 0)]} />,
    );
    const layer = canvasLayer(container);

    // 变换层初始 transform 应为 translate(0px, 0px) scale(1)
    const world = container.querySelector<HTMLElement>("[data-testid='canvas-world']")!;
    expect(world.style.transform).toContain("translate(0px, 0px)");

    // 在远离节点的空白处按下并拖动
    fireEvent.pointerDown(layer, { clientX: 900, clientY: 600, button: 0, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 800, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 800, clientY: 500, pointerId: 1 });

    expect(world.style.transform).toContain("translate(-100px, -100px)");
  });
});

describe("缩放控制", () => {
  it("点击放大/缩小按钮改变缩放倍率", () => {
    const { container } = render(<CanvasHost />);
    const world = container.querySelector<HTMLElement>("[data-testid='canvas-world']")!;
    expect(world.style.transform).toContain("scale(1)");

    fireEvent.click(screen.getByLabelText("放大"));
    expect(world.style.transform).toContain("scale(1.2)");

    fireEvent.click(screen.getByLabelText("缩小"));
    expect(world.style.transform).toContain("scale(1)");
  });

  it("重置视图回到 scale=1 与原点", () => {
    const { container } = render(<CanvasHost />);
    const world = container.querySelector<HTMLElement>("[data-testid='canvas-world']")!;

    fireEvent.click(screen.getByLabelText("放大"));
    fireEvent.click(screen.getByLabelText("放大"));
    expect(world.style.transform).not.toContain("scale(1)");

    fireEvent.click(screen.getByLabelText("重置视图"));
    expect(world.style.transform).toContain("translate(0px, 0px)");
    expect(world.style.transform).toContain("scale(1)");
  });
});

describe("拉线连接", () => {
  it("从输出端口拖到目标节点后建立连线", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 0, 0), shot("shot_b", 500, 0)]} />,
    );
    const layer = canvasLayer(container);
    expect(screen.getByText("0 连线")).toBeTruthy();

    // 节点 a 的输出端口在世界坐标 (280, 160)
    const port = container.querySelector<HTMLElement>(
      "[data-node-id='shot_a'] [data-port='out']",
    )!;
    fireEvent.pointerDown(port, { clientX: 280, clientY: 160, button: 0, pointerId: 1 });

    // 拖到节点 b 内部（世界坐标 500..780 × 0..320）
    fireEvent.pointerMove(layer, { clientX: 560, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 560, clientY: 160, pointerId: 1 });

    expect(screen.getByText("1 连线")).toBeTruthy();
  });

  it("拖到空白处释放不建立连线", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 0, 0), shot("shot_b", 500, 0)]} />,
    );
    const layer = canvasLayer(container);
    const port = container.querySelector<HTMLElement>(
      "[data-node-id='shot_a'] [data-port='out']",
    )!;

    fireEvent.pointerDown(port, { clientX: 280, clientY: 160, button: 0, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 300, clientY: 400, pointerId: 1 });

    expect(screen.getByText("0 连线")).toBeTruthy();
  });
});

describe("删除", () => {
  it("按 Delete 删除选中节点，并级联删除其连线", () => {
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 0, 0), shot("shot_b", 500, 0)]} />,
    );
    const layer = canvasLayer(container);

    // 先建一条 a -> b 的连线
    const port = container.querySelector<HTMLElement>(
      "[data-node-id='shot_a'] [data-port='out']",
    )!;
    fireEvent.pointerDown(port, { clientX: 280, clientY: 160, button: 0, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 560, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 560, clientY: 160, pointerId: 1 });
    expect(screen.getByText("1 连线")).toBeTruthy();

    // 选中节点 a 后按 Delete
    const nodeA = container.querySelector<HTMLElement>("[data-node-id='shot_a']")!;
    fireEvent.pointerDown(nodeA, { clientX: 100, clientY: 160, button: 0, pointerId: 2 });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(container.querySelector("[data-node-id='shot_a']")).toBeNull();
    // 级联删除：连线也应消失
    expect(screen.getByText("0 连线")).toBeTruthy();
    // 另一个节点不受影响
    expect(container.querySelector("[data-node-id='shot_b']")).toBeTruthy();
  });

  it("在输入框内按 Delete 不删除节点（避免误删正在编辑的内容）", () => {
    const { container } = render(
      <CanvasHost
        initialNodes={[
          {
            id: "text_a",
            kind: "TEXT",
            title: "笔记",
            position: { x: 0, y: 0 },
            text: "草稿",
          },
        ]}
      />,
    );

    // 选中文本节点，焦点落在其 textarea 上
    const node = container.querySelector<HTMLElement>("[data-node-id='text_a']")!;
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "Delete" });

    expect(container.querySelector("[data-node-id='text_a']")).toBeTruthy();
  });
});

describe("双击创建", () => {
  it("双击画布空白处触发创建回调，并传入世界坐标", () => {
    const onCreate = vi.fn();
    const { container } = render(
      <CanvasHost initialNodes={[shot("shot_a", 0, 0)]} onCreateNode={onCreate} />,
    );
    const layer = canvasLayer(container);

    fireEvent.doubleClick(layer, { clientX: 400, clientY: 300 });

    expect(onCreate).toHaveBeenCalledTimes(1);
    // 默认 scale=1、无偏移，世界坐标应等于容器坐标
    expect(onCreate).toHaveBeenCalledWith({ x: 400, y: 300 });
  });
});

describe("节点内容渲染", () => {
  it("分镜节点展示状态徽标与台词上下文", () => {
    const { container } = render(
      <CanvasHost
        initialNodes={[
          {
            id: "shot_x",
            kind: "SHOT",
            title: "分镜 #3",
            position: { x: 0, y: 0 },
            status: "video_done",
            context: { dialogue: "你终于来了。", shotType: "特写", duration: "5" },
          },
        ]}
      />,
    );
    expect(screen.getByText("视频已生成")).toBeTruthy();
    expect(screen.getByText(/你终于来了/)).toBeTruthy();
    // 景别渲染时带「· 」前缀，故用正则匹配
    expect(screen.getByText(/特写/)).toBeTruthy();
  });

  it("文本节点的输入内容受控更新", () => {
    const { container } = render(
      <CanvasHost
        initialNodes={[
          { id: "t1", kind: "TEXT", title: "笔记", position: { x: 0, y: 0 }, text: "" },
        ]}
      />,
    );
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    fireEvent.change(textarea, { target: { value: "新灵感" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("新灵感");
  });
});
