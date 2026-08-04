/**
 * @file 提示词拼装工具
 * @description
 * 从角色库、场景库、风格设定自动拼装出 AI 生图/生视频所需的提示词。
 * 该模块是「分镜 → AI 出图/出视频」链路的核心，所有提示词都遵循统一的拼装结构，
 * 以保证角色、场景、风格在整部短剧中的视觉一致性。
 */

import type { Character, Location, StyleProfile, Shot } from "@prisma/client";

/**
 * 拼装文生图提示词。
 *
 * 将景别、角色描述、场景描述、镜头画面描述、风格设定按固定顺序拼装为一段中文提示词，
 * 各部分之间用中文逗号「，」分隔。角色描述会完整注入，以保证同一角色在多张图中外貌一致。
 *
 * @param shot - 分镜数据，仅使用景别（shotType）与镜头画面描述（imagePrompt）
 * @param characters - 该分镜涉及的角色列表，使用其描述、服装、特征字段
 * @param location - 该分镜所在场景，使用其描述、氛围、光线备注；为 null 时跳过场景段
 * @param style - 该短剧的风格设定，使用其美术风格、配色、镜头风格；为 null 时跳过风格段
 * @returns 拼装完成的中文提示词字符串
 */
export function buildImagePrompt(
  shot: Pick<Shot, "shotType" | "imagePrompt">,
  characters: Pick<Character, "description" | "outfit" | "features">[],
  location: Pick<Location, "description" | "mood" | "lightingNotes"> | null,
  style: Pick<StyleProfile, "artStyle" | "colorPalette" | "cameraStyle"> | null,
): string {
  const parts: string[] = [];

  // 1. 景别（远景/中景/特写等，决定画面构图范围）
  if (shot.shotType) parts.push(shot.shotType);

  // 2. 角色描述（完整注入 description+outfit+features，保证一致性）
  for (const char of characters) {
    parts.push(char.description);
    if (char.outfit) parts.push(char.outfit);
    if (char.features) parts.push(char.features);
  }

  // 3. 场景描述（含氛围与光线，烘托画面基调）
  if (location) {
    parts.push(location.description);
    if (location.mood) parts.push(location.mood);
    if (location.lightingNotes) parts.push(location.lightingNotes);
  }

  // 4. 镜头画面描述（分镜特有，描述这一帧的具体画面内容）
  if (shot.imagePrompt) parts.push(shot.imagePrompt);

  // 5. 风格设定（统一全剧的美术与镜头语言）
  if (style) {
    parts.push(style.artStyle);
    if (style.colorPalette) parts.push(style.colorPalette);
    if (style.cameraStyle) parts.push(style.cameraStyle);
  }

  return parts.join("，");
}

/**
 * 拼装负面提示词。
 *
 * 负面提示词用于告诉 AI「不要生成什么」，目前直接取自风格设定中的 negativePrompt 字段。
 * 当风格未配置负面提示词时返回 null，调用方可据此判断是否需要附加。
 *
 * @param style - 风格设定，使用其 negativePrompt 字段；为 null 时表示无负面提示词
 * @returns 负面提示词字符串；无内容时返回 null
 */
export function buildNegativePrompt(
  style: Pick<StyleProfile, "negativePrompt"> | null,
): string | null {
  if (!style?.negativePrompt) return null;
  return style.negativePrompt;
}

/**
 * 拼装图生视频提示词。
 *
 * 图生视频需要描述「动态」，因此提示词由镜头描述、台词口型提示、稳定性约束三部分组成。
 * 当分镜包含台词时，会截取前 50 字作为口型同步提示，避免过长导致模型忽略。
 *
 * @param shot - 分镜数据，使用其镜头描述（videoPrompt）与台词（dialogue）
 * @returns 拼装完成的图生视频提示词字符串
 */
export function buildVideoPrompt(
  shot: Pick<Shot, "videoPrompt" | "dialogue">,
): string {
  const parts: string[] = [];

  if (shot.videoPrompt) parts.push(shot.videoPrompt);

  // 如果有台词，加入口型提示（截取前 50 字，避免提示词过长）
  if (shot.dialogue) {
    parts.push(`角色说话："${shot.dialogue.slice(0, 50)}"`);
  }

  // 稳定性约束：防止图生视频时角色面部变形、画面闪烁
  parts.push("保持角色面部清晰，光线稳定，画面流畅");

  return parts.join("，");
}

/**
 * 生成角色定妆照提示词。
 *
 * 定妆照用于在短剧制作前期确立角色的视觉形象，供后续分镜生图复用。
 * 提示词固定包含「人物定妆照，半身像，面部清晰」前缀与「简洁纯色背景，柔和光线，高清画质」后缀，
 * 中间注入角色的描述、服装、特征。
 *
 * @param character - 角色数据，使用其名称、描述、服装、特征字段
 * @returns 拼装完成的角色定妆照提示词字符串
 */
export function buildCharacterPortraitPrompt(
  character: Pick<Character, "name" | "description" | "outfit" | "features">,
): string {
  const parts: string[] = [
    "人物定妆照，半身像，面部清晰",
    character.description,
  ];
  if (character.outfit) parts.push(character.outfit);
  if (character.features) parts.push(character.features);
  parts.push("简洁纯色背景，柔和光线，高清画质");
  return parts.join("，");
}

/**
 * 生成场景参考图提示词。
 *
 * 场景参考图用于在短剧制作前期确立场景的视觉形象，供后续分镜生图复用。
 * 提示词固定包含「场景全景，无人」前缀（保证参考图只有环境没有人）与「高清画质，广角」后缀，
 * 中间注入场景的描述、氛围、光线备注。
 *
 * @param location - 场景数据，使用其名称、描述、氛围、光线备注字段
 * @returns 拼装完成的场景参考图提示词字符串
 */
export function buildLocationReferencePrompt(
  location: Pick<Location, "name" | "description" | "mood" | "lightingNotes">,
): string {
  const parts: string[] = [
    "场景全景，无人",
    location.description,
  ];
  if (location.mood) parts.push(location.mood);
  if (location.lightingNotes) parts.push(location.lightingNotes);
  parts.push("高清画质，广角");
  return parts.join("，");
}
