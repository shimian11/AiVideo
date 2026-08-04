/**
 * @file 风格设定管理页
 * @description 展示剧集下所有风格设定，支持编辑与删除。新建走 /series/[id]/styles/new。
 */

"use client";

import { use } from "react";
import { EntityManage, type EntityField } from "@/components/EntityManage";

const fields: EntityField[] = [
  { key: "name", label: "风格名称", required: true },
  {
    key: "artStyle",
    label: "画风描述",
    type: "textarea",
    required: true,
    hint: "如：赛博朋克、水彩、写实电影感",
  },
  { key: "colorPalette", label: "配色", hint: "如：青橙对比、莫兰迪低饱和" },
  { key: "cameraStyle", label: "镜头风格", hint: "如：手持纪实、广角夸张" },
  { key: "negativePrompt", label: "负面提示词", type: "textarea" },
];

export default function StylesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <EntityManage
      seriesId={id}
      title="风格设定"
      description="定义画风、色调和镜头语言，全局应用到所有分镜"
      entityLabel="风格"
      createHref={`/series/${id}/styles/new`}
      listPath="styles"
      itemApiBase="/api/styles"
      fields={fields}
      renderCard={(it) => ({
        id: String(it.id),
        title: String(it.name),
        subtitle: (it.colorPalette as string) || undefined,
        desc: String(it.artStyle),
      })}
    />
  );
}
