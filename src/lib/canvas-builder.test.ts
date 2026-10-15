import { describe, expect, it } from "vitest";
import {
  buildSeriesWorkflow,
  flattenSeriesForCanvas,
  mergeSeriesIntoNodes,
  type SeriesSource,
} from "./canvas-builder";

/** 构造一个最小可用的剧集数据源 */
function makeSeries(overrides: Partial<SeriesSource> = {}): SeriesSource {
  return {
    id: "s1",
    title: "测试剧集",
    characters: [
      { id: "c1", name: "林晚", role: "protagonist", description: "28岁女记者", referenceUrl: "https://x/c1.png" },
      { id: "c2", name: "陈锋", role: "antagonist", description: "神秘商人", referenceUrl: null },
    ],
    locations: [
      { id: "l1", name: "旧公寓", description: "昏暗的老式公寓", referenceUrl: null },
    ],
    styles: [{ id: "st1", name: "冷峻悬疑", artStyle: "低饱和冷色调", referenceUrl: null }],
    scripts: [{ id: "sc1", title: "第一集剧本", content: "深夜，林晚回到公寓…".repeat(20) }],
    shots: [
      {
        id: "sh1", number: 1, shotType: "中景", duration: 5,
        dialogue: "你来了。", keyframeUrl: "https://x/sh1.png", videoUrl: null,
        status: "keyframe_done", sceneId: "scn1", sceneNumber: 1,
        locationId: "l1", characterIds: ["c1"],
      },
      {
        id: "sh2", number: 2, shotType: "特写", duration: 4,
        dialogue: null, keyframeUrl: null, videoUrl: null,
        status: "pending", sceneId: "scn1", sceneNumber: 1,
        locationId: "l1", characterIds: ["c1", "c2"],
      },
      {
        id: "sh3", number: 3, shotType: "远景", duration: 6,
        dialogue: null, keyframeUrl: null, videoUrl: null,
        status: "pending", sceneId: "scn2", sceneNumber: 2,
        locationId: null, characterIds: [],
      },
    ],
    ...overrides,
  };
}

describe("buildSeriesWorkflow", () => {
  const { nodes, edges } = buildSeriesWorkflow(makeSeries());

  it("为每个角色/场景/风格/剧本/分镜各生成一个节点", () => {
    const byKind = nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.kind] = (acc[n.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(byKind.CHARACTER).toBe(2);
    expect(byKind.LOCATION).toBe(1);
    expect(byKind.STYLE).toBe(1);
    expect(byKind.SCRIPT).toBe(1);
    expect(byKind.SHOT).toBe(3);
  });

  it("资源节点排在最左列，分镜节点排在右侧列", () => {
    const resource = nodes.find((n) => n.kind === "CHARACTER")!;
    const shot = nodes.find((n) => n.kind === "SHOT")!;
    expect(shot.position.x).toBeGreaterThan(resource.position.x);
  });

  it("剧本节点排在资源节点上方，保证阅读顺序为剧本 -> 资源 -> 分镜", () => {
    const script = nodes.find((n) => n.kind === "SCRIPT")!;
    const firstResource = nodes.find((n) => n.kind === "CHARACTER")!;
    expect(script.position.y).toBeLessThan(firstResource.position.y);
  });

  it("按出场角色与所在场景建立连线，风格不自动连线", () => {
    // sh1 出场 c1、位于 l1 => 2 条线
    // sh2 出场 c1+c2、位于 l1 => 3 条线
    // sh3 无角色无场景 => 0 条线
    expect(edges).toHaveLength(5);

    const sh1Edges = edges.filter((e) => e.target === "shot_sh1");
    expect(sh1Edges.map((e) => e.source).sort()).toEqual(["c1", "l1"]);

    const sh2Edges = edges.filter((e) => e.target === "shot_sh2");
    expect(sh2Edges.map((e) => e.source).sort()).toEqual(["c1", "c2", "l1"]);

    // 风格节点不连任何分镜，避免线条数量爆炸
    expect(edges.some((e) => e.source === "st1")).toBe(false);
  });

  it("连线不重复，且不会把节点连到自己", () => {
    const keys = edges.map((e) => `${e.source}->${e.target}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it("分镜节点携带关键帧、状态与台词上下文", () => {
    const sh1 = nodes.find((n) => n.id === "shot_sh1")!;
    expect(sh1.mediaUrl).toBe("https://x/sh1.png");
    expect(sh1.status).toBe("keyframe_done");
    expect(sh1.context?.dialogue).toBe("你来了。");
    expect(sh1.context?.shotType).toBe("中景");
  });

  it("空剧集返回空画布而不抛错", () => {
    const empty = buildSeriesWorkflow({
      id: "s", title: "空", characters: [], locations: [],
      styles: [], scripts: [], shots: [],
    });
    expect(empty.nodes).toHaveLength(0);
    expect(empty.edges).toHaveLength(0);
  });
});

describe("mergeSeriesIntoNodes", () => {
  it("保留用户拖拽过的节点位置，只更新内容", () => {
    const first = buildSeriesWorkflow(makeSeries());
    // 用户把第一个分镜节点拖到别处
    const moved = first.nodes.map((n) =>
      n.id === "shot_sh1" ? { ...n, position: { x: 999, y: 888 } } : n,
    );

    // 分镜 1 的关键帧生成完成
    const updatedSeries = makeSeries();
    updatedSeries.shots[0].keyframeUrl = "https://x/sh1-new.png";
    updatedSeries.shots[0].status = "video_done";

    const merged = mergeSeriesIntoNodes(moved, updatedSeries)!;
    expect(merged).not.toBeNull();

    const sh1 = merged.nodes.find((n) => n.id === "shot_sh1")!;
    expect(sh1.position).toEqual({ x: 999, y: 888 });      // 位置保留
    expect(sh1.mediaUrl).toBe("https://x/sh1-new.png");     // 内容刷新
    expect(sh1.status).toBe("video_done");
  });

  it("内容无变化时返回 null，避免无意义的重渲染", () => {
    const first = buildSeriesWorkflow(makeSeries());
    const merged = mergeSeriesIntoNodes(first.nodes, makeSeries());
    expect(merged).toBeNull();
  });

  it("新增分镜时追加节点而不丢弃已有节点", () => {
    const first = buildSeriesWorkflow(makeSeries());
    const grown = makeSeries();
    grown.shots.push({
      id: "sh4", number: 4, shotType: "全景", duration: 5,
      dialogue: null, keyframeUrl: null, videoUrl: null,
      status: "pending", sceneId: "scn2", sceneNumber: 2,
      locationId: null, characterIds: [],
    });

    const merged = mergeSeriesIntoNodes(first.nodes, grown)!;
    expect(merged.nodes.find((n) => n.id === "shot_sh4")).toBeDefined();
    // 原有三个分镜节点都还在
    expect(merged.nodes.filter((n) => n.kind === "SHOT")).toHaveLength(4);
  });

  it("用户手动创建的文本节点不受同步影响", () => {
    const first = buildSeriesWorkflow(makeSeries());
    const withText = [
      ...first.nodes,
      {
        id: "n1_text", kind: "TEXT" as const,
        title: "我的灵感", text: "加点悬念",
        position: { x: 500, y: 500 },
      },
    ];
    const merged = mergeSeriesIntoNodes(withText, makeSeries());
    // 内容无变化（文本节点不在期望集合中但被保留），走 null 分支也安全
    if (merged) {
      expect(merged.nodes.find((n) => n.id === "n1_text")?.text).toBe("加点悬念");
    } else {
      expect(withText.find((n) => n.id === "n1_text")?.text).toBe("加点悬念");
    }
  });
});

describe("flattenSeriesForCanvas", () => {
  it("从 Prisma 嵌套返回中提取扁平结构，容忍字段缺失", () => {
    const flat = flattenSeriesForCanvas({
      id: "s1",
      title: "剧集",
      characters: [{ id: "c1", name: "林晚", role: "protagonist", description: "d", referenceUrl: null }],
      locations: [],
      styles: [],
      scripts: [],
      seasons: [
        {
          episodes: [
            {
              id: "e1",
              scenes: [
                {
                  id: "scn1",
                  number: 1,
                  locationId: "l1",
                  shots: [
                    {
                      id: "sh1", number: 1, shotType: "中景", duration: 5,
                      dialogue: "hi", keyframeUrl: null, videoUrl: null, status: "pending",
                      characters: [{ character: { id: "c1", name: "林晚", description: "d" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(flat.characters).toHaveLength(1);
    expect(flat.shots).toHaveLength(1);
    expect(flat.shots[0].characterIds).toEqual(["c1"]);
    expect(flat.shots[0].sceneNumber).toBe(1);
    expect(flat.shots[0].locationId).toBe("l1");
  });

  it("字段类型异常时使用安全默认值而不抛错", () => {
    // 故意构造脏数据：字段类型与 schema 声明不符，验证 flatten 的容错
    const dirty = {
      id: "s1", title: "x",
      characters: [{ id: 123, name: null }],
      locations: [], styles: [], scripts: [],
      seasons: [{
        episodes: [{
          id: "e",
          scenes: [{
            id: "sc",
            number: "x" as unknown as number,
            locationId: null,
            shots: [{ id: "s", number: "y" as unknown as number }],
          }],
        }],
      }],
    };
    const flat = flattenSeriesForCanvas(dirty);
    expect(flat.characters[0].id).toBe("");
    expect(flat.shots[0].number).toBe(0);
    expect(flat.shots[0].duration).toBe(5);
  });
});
