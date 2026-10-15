/**
 * @file 剧集数据 -> 画布工作流构建器
 * @description
 * 把 Series 及其关联的 Character / Location / StyleProfile / Script / Shot
 * 转成 libTV 式的节点图：
 *
 *   左列（资源层）      中列（分镜层）
 *   [角色A] ─┐
 *   [角色B] ─┼─→ [分镜#1] ─→ ...
 *   [场景X] ─┤   [分镜#2]
 *   [风格S]  ┘   [分镜#3]
 *
 * 连线规则（自动生成）：
 *   - 角色 -> 分镜：该分镜出场了此角色（ShotCharacter）
 *   - 场景 -> 分镜：该分镜所在场挂在此场景下
 *   - 风格：全局生效，不自动连线（否则线条数量爆炸），由用户按需手动连接
 */

import type { CanvasEdge, CanvasNode } from "./canvas-types";

/** 布局常量（世界坐标 px） */
const RESOURCE_X = 0;
const SHOT_X = 460;
const ROW_GAP = 44;

/** 分镜节点附带的数据（从数据库实体提取） */
export interface ShotSource {
  id: string;
  number: number;
  shotType: string | null;
  duration: number;
  dialogue: string | null;
  keyframeUrl: string | null;
  videoUrl: string | null;
  status: string;
  sceneId: string;
  sceneNumber: number;
  locationId: string | null;
  characterIds: string[];
}

export interface SeriesSource {
  id: string;
  title: string;
  characters: {
    id: string;
    name: string;
    role: string;
    description: string;
    referenceUrl: string | null;
  }[];
  locations: {
    id: string;
    name: string;
    description: string;
    referenceUrl: string | null;
  }[];
  styles: { id: string; name: string; artStyle: string; referenceUrl: string | null }[];
  scripts: { id: string; title: string; content: string }[];
  shots: ShotSource[];
}

/**
 * 构建初始画布。
 *
 * @returns 节点与连线；若无任何可展示内容时返回空数组
 */
export function buildSeriesWorkflow(
  series: SeriesSource,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  let y = 0;

  // ---- 左列：资源节点 ----
  const resourceNodeIds = new Map<string, string>();

  const pushResource = (
    id: string,
    kind: CanvasNode["kind"],
    title: string,
    subtitle: string,
    mediaUrl: string | null,
  ) => {
    nodes.push({
      id,
      kind,
      refId: id,
      title,
      subtitle,
      mediaUrl,
      position: { x: RESOURCE_X, y },
    });
    y += 220 + ROW_GAP;
  };

  for (const c of series.characters) {
    pushResource(c.id, "CHARACTER", c.name, c.description, c.referenceUrl);
    resourceNodeIds.set(c.id, c.id);
  }
  for (const l of series.locations) {
    pushResource(l.id, "LOCATION", l.name, l.description, l.referenceUrl);
    resourceNodeIds.set(l.id, l.id);
  }
  for (const s of series.styles) {
    pushResource(s.id, "STYLE", s.name, s.artStyle, s.referenceUrl);
    resourceNodeIds.set(s.id, s.id);
  }

  // ---- 左列顶部：脚本节点（排在资源之前，让阅读顺序为「剧本 -> 资源 -> 分镜」）----
  const scriptNodeIds: string[] = [];
  if (series.scripts.length > 0) {
    const scriptYBase = -series.scripts.length * (260 + ROW_GAP) - ROW_GAP;
    series.scripts.forEach((sc, i) => {
      const id = `script_${sc.id}`;
      nodes.push({
        id,
        kind: "SCRIPT",
        refId: sc.id,
        title: sc.title,
        subtitle: sc.content.slice(0, 180),
        position: { x: RESOURCE_X, y: scriptYBase + i * (260 + ROW_GAP) },
      });
      scriptNodeIds.push(id);
    });
  }

  // ---- 中列：分镜节点 ----
  let shotY = 0;
  let lastSceneId: string | null = null;
  const shotNodeIds = new Map<string, string>();

  for (const shot of series.shots) {
    // 场次切换时增加间距，让分组在视觉上可辨
    if (lastSceneId !== null && shot.sceneId !== lastSceneId) {
      shotY += 28;
    }
    lastSceneId = shot.sceneId;

    const id = `shot_${shot.id}`;
    nodes.push({
      id,
      kind: "SHOT",
      refId: shot.id,
      title: `分镜 #${shot.number}`,
      subtitle: `第${shot.sceneNumber}场 · ${shot.number}`,
      mediaUrl: shot.keyframeUrl,
      status: shot.status,
      context: {
        shotType: shot.shotType ?? "",
        duration: String(shot.duration),
        dialogue: shot.dialogue ?? "",
        videoUrl: shot.videoUrl ?? "",
      },
      position: { x: SHOT_X, y: shotY },
    });
    shotNodeIds.set(shot.id, id);
    shotY += 340 + ROW_GAP;
  }

  // ---- 连线：角色 / 场景 -> 分镜 ----
  for (const shot of series.shots) {
    const target = shotNodeIds.get(shot.id);
    if (!target) continue;

    for (const charId of shot.characterIds) {
      const source = resourceNodeIds.get(charId);
      if (source) edges.push({ id: `e_${source}_${target}`, source, target });
    }
    if (shot.locationId) {
      const source = resourceNodeIds.get(shot.locationId);
      if (source) edges.push({ id: `e_${source}_${target}`, source, target });
    }
  }

  return { nodes, edges };
}

/**
 * 把最新的剧集数据合并进已有画布。
 *
 * 这是 libTV 式画布的关键行为：**用户拖拽过的节点位置必须保留**，
 * 只有节点承载的数据（标题、缩略图、状态、台词）需要刷新。
 *
 * 合并规则：
 *   - 已存在的节点：按 id 匹配，更新内容字段，position 原样保留
 *   - 新增的节点（如拆分剧本后产生的新分镜）：追加到画布右侧空位
 *   - 画布上独有的节点（用户手动创建的文本节点等）：不受影响
 *   - 连线：取期望连线与现有连线的并集
 *
 * @returns 是否需要更新（无变化时返回 null，避免无意义的重渲染）
 */
export function mergeSeriesIntoNodes(
  existing: CanvasNode[],
  series: SeriesSource,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } | null {
  const expected = buildSeriesWorkflow(series);
  if (expected.nodes.length === 0) return null;

  const existingById = new Map(existing.map((n) => [n.id, n]));
  const merged: CanvasNode[] = [];
  let changed = false;

  // 1) 保留用户摆放顺序：先走已有节点，再追加新节点
  for (const node of existing) {
    const fresh = expected.nodes.find((n) => n.id === node.id);
    if (!fresh) {
      merged.push(node);
      continue;
    }
    const sameContent =
      node.title === fresh.title &&
      node.subtitle === fresh.subtitle &&
      node.mediaUrl === fresh.mediaUrl &&
      node.status === fresh.status &&
      JSON.stringify(node.context ?? {}) === JSON.stringify(fresh.context ?? {});
    if (!sameContent) changed = true;
    merged.push({ ...node, ...fresh, position: node.position });
  }

  // 2) 追加期望中存在但画布上缺失的节点，排在现有内容右侧
  const existingIds = new Set(existing.map((n) => n.id));
  const additions = expected.nodes.filter((n) => !existingIds.has(n.id));
  if (additions.length > 0) {
    changed = true;
    const maxX = existing.reduce((m, n) => Math.max(m, n.position.x), 0);
    additions.forEach((n, i) => {
      merged.push({ ...n, position: { x: maxX + 460 + i * 0, y: n.position.y } });
    });
  }

  if (!changed && existing.length === expected.nodes.length) return null;

  // 3) 连线取并集（保留用户手动拉的线）
  const edgeKeys = new Set<string>();
  const edges: CanvasEdge[] = [];
  for (const e of [...expected.edges]) {
    const key = `${e.source}->${e.target}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push(e);
  }

  return { nodes: merged, edges };
}

/**
 * 从剧集完整数据中提取画布构建所需的扁平结构。
 * 单独抽出是为了让 canvas-builder 不依赖 Prisma 的具体返回形状，便于测试。
 */
export function flattenSeriesForCanvas(raw: {
  id: string;
  title: string;
  characters: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  styles: Array<Record<string, unknown>>;
  scripts: Array<Record<string, unknown>>;
  seasons: Array<{
    episodes: Array<{
      id: string;
      scenes: Array<{
        id: string;
        number: number;
        locationId: string | null;
        shots: Array<Record<string, unknown>>;
      }>;
    }>;
  }>;
}): SeriesSource {
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

  return {
    id: raw.id,
    title: raw.title,
    characters: raw.characters.map((c) => ({
      id: str(c.id),
      name: str(c.name),
      role: str(c.role),
      description: str(c.description),
      referenceUrl: typeof c.referenceUrl === "string" ? c.referenceUrl : null,
    })),
    locations: raw.locations.map((l) => ({
      id: str(l.id),
      name: str(l.name),
      description: str(l.description),
      referenceUrl: typeof l.referenceUrl === "string" ? l.referenceUrl : null,
    })),
    styles: raw.styles.map((s) => ({
      id: str(s.id),
      name: str(s.name),
      artStyle: str(s.artStyle),
      referenceUrl: typeof s.referenceUrl === "string" ? s.referenceUrl : null,
    })),
    scripts: raw.scripts.map((sc) => ({
      id: str(sc.id),
      title: str(sc.title),
      content: str(sc.content),
    })),
    shots: raw.seasons.flatMap((season) =>
      season.episodes.flatMap((episode) =>
        episode.scenes.flatMap((scene) =>
          (scene.shots as Array<Record<string, unknown>>).map((sh) => ({
            id: str(sh.id),
            number: typeof sh.number === "number" ? sh.number : 0,
            shotType: typeof sh.shotType === "string" ? sh.shotType : null,
            duration: typeof sh.duration === "number" ? sh.duration : 5,
            dialogue: typeof sh.dialogue === "string" ? sh.dialogue : null,
            keyframeUrl: typeof sh.keyframeUrl === "string" ? sh.keyframeUrl : null,
            videoUrl: typeof sh.videoUrl === "string" ? sh.videoUrl : null,
            status: str(sh.status, "pending"),
            sceneId: scene.id,
            sceneNumber: scene.number,
            locationId: scene.locationId,
            characterIds: Array.isArray(sh.characters)
              ? (sh.characters as Array<{ character?: { id?: string } }>)
                  .map((sc2) => sc2?.character?.id)
                  .filter((v): v is string => typeof v === "string")
              : [],
          })),
        ),
      ),
    ),
  };
}
