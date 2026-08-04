/**
 * @file 场景管理页
 * @description 展示剧集下所有场景，支持编辑与删除。新建走 /series/[id]/locations/new。
 */

"use client";

import { use } from "react";
import { EntityManage, type EntityField } from "@/components/EntityManage";

const fields: EntityField[] = [
  { key: "name", label: "场景名", required: true },
  {
    key: "description",
    label: "场景描述",
    type: "textarea",
    required: true,
    hint: "环境、布局、氛围元素等",
  },
  { key: "mood", label: "氛围", hint: "如：紧张、温馨、萧瑟" },
  { key: "lightingNotes", label: "光线备注", hint: "如：黄昏逆光、冷色调" },
  { key: "referenceUrl", label: "参考图 URL" },
];

export default function LocationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <EntityManage
      seriesId={id}
      title="场景库"
      description="场景档案跨集复用，确保环境风格统一"
      entityLabel="场景"
      createHref={`/series/${id}/locations/new`}
      listPath="locations"
      itemApiBase="/api/locations"
      fields={fields}
      renderCard={(it) => ({
        id: String(it.id),
        title: String(it.name),
        subtitle: (it.mood as string) || undefined,
        desc: String(it.description),
        imageUrl: (it.referenceUrl as string) || null,
      })}
    />
  );
}
