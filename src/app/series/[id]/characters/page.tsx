/**
 * @file 角色管理页
 * @description 展示剧集下所有角色，支持编辑与删除。新建走 /series/[id]/characters/new。
 */

"use client";

import { use } from "react";
import { EntityManage, type EntityField } from "@/components/EntityManage";

const ROLE_LABEL: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  extra: "龙套",
};

const fields: EntityField[] = [
  { key: "name", label: "角色名", required: true },
  {
    key: "role",
    label: "角色类型",
    type: "select",
    options: [
      { value: "protagonist", label: "主角" },
      { value: "antagonist", label: "反派" },
      { value: "supporting", label: "配角" },
      { value: "extra", label: "龙套" },
    ],
  },
  {
    key: "description",
    label: "外貌描述",
    type: "textarea",
    required: true,
    hint: "越具体越好：年龄、性别、发型、五官、身材等",
    aiAssist: true,
  },
  { key: "personality", label: "性格设定", type: "textarea" },
  { key: "outfit", label: "服装描述" },
  { key: "features", label: "标志性特征" },
  { key: "voicePreset", label: "配音音色预设" },
  { key: "referenceUrl", label: "参考图 URL" },
];

export default function CharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <EntityManage
      seriesId={id}
      title="角色库"
      description="角色档案跨集复用，确保人物外观一致性"
      entityLabel="角色"
      createHref={`/series/${id}/characters/new`}
      listPath="characters"
      itemApiBase="/api/characters"
      fields={fields}
      type="character"
      renderCard={(it) => ({
        id: String(it.id),
        title: String(it.name),
        subtitle: ROLE_LABEL[String(it.role)] || String(it.role),
        desc: String(it.description),
        imageUrl: (it.referenceUrl as string) || null,
      })}
    />
  );
}
