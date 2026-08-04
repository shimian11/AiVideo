/**
 * @file 新建角色页
 * @description
 * 为指定剧集创建新角色的表单页。
 * 角色档案（外貌、服装、特征）会跨集复用，描述越详细，后续 AI 生图时人物一致性越高。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";

/** 角色类型选项：主角/反派/配角/龙套 */
const ROLES = [
  { value: "protagonist", label: "主角" },
  { value: "antagonist", label: "反派" },
  { value: "supporting", label: "配角" },
  { value: "extra", label: "龙套" },
];

/**
 * 新建角色页组件。
 *
 * 通过表单收集角色信息，提交至 POST /api/series/[id]/characters，成功后返回剧集详情页。
 */
export default function NewCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = use(params);
  const router = useRouter();

  // ---- 表单字段 ----
  const [name, setName] = useState("");
  const [role, setRole] = useState("protagonist");
  const [description, setDescription] = useState("");
  const [personality, setPersonality] = useState("");
  const [outfit, setOutfit] = useState("");
  const [features, setFeatures] = useState("");
  const [voicePreset, setVoicePreset] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 提交保存角色，校验必填项后调用接口，成功后跳回剧集页。 */
  async function save() {
    if (!name.trim() || !description.trim()) {
      setError("角色名和描述为必填项");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, description, personality, outfit, features, voicePreset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      router.push(`/series/${seriesId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>← 返回</Button>
      <h1 className="mt-4 text-2xl font-bold text-ink">创建角色</h1>
      <p className="mt-1 text-sm text-muted">
        角色档案将跨集复用，描述越详细，AI 生成时一致性越高
      </p>

      <Card className="mt-6 flex flex-col gap-4 p-6">
        <Field label="角色名" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：林悦" />
        </Field>

        <Field label="角色类型">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>

        <Field label="外貌描述（用于AI生图）" required hint="越具体越好：年龄、性别、发型、五官、身材等">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="例如：24岁女性，干练短发，五官清秀有灵气，皮肤白皙，身材纤细" />
        </Field>

        <Field label="性格设定" hint="性格特点，用于台词和配音风格参考">
          <Textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={2}
            placeholder="例如：性格坚韧但内心温柔，遇事冷静，偶尔有些小迷糊" />
        </Field>

        <Field label="服装描述" hint="日常穿着，用于保持跨镜头服装一致性">
          <Input value={outfit} onChange={(e) => setOutfit(e.target.value)}
            placeholder="例如：白色衬衫+高腰西裤，戴银色细框眼镜" />
        </Field>

        <Field label="标志性特征" hint="独特特征，如疤痕、纹身、饰品等">
          <Input value={features} onChange={(e) => setFeatures(e.target.value)}
            placeholder="例如：左手腕有蝴蝶纹身" />
        </Field>

        <Field label="配音音色预设" hint="可选，后续配音环节使用">
          <Input value={voicePreset} onChange={(e) => setVoicePreset(e.target.value)}
            placeholder="例如：温柔女声" />
        </Field>

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
