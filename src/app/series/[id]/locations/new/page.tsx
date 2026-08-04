/**
 * @file 新建场景页
 * @description
 * 为指定剧集创建新场景的表单页。
 * 场景档案（描述、氛围、光线）会跨集复用，确保不同分镜中同一场景的环境风格统一。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";

/** 氛围预设选项 */
const MOODS = ["温馨", "紧张", "阴暗", "明亮", "浪漫", "压抑", "神秘", "热闹", "冷清", "其他"];

/**
 * 新建场景页组件。
 *
 * 通过表单收集场景信息，提交至 POST /api/series/[id]/locations，成功后返回剧集详情页。
 */
export default function NewLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = use(params);
  const router = useRouter();

  // ---- 表单字段 ----
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState("");
  const [lightingNotes, setLightingNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 提交保存场景，校验必填项后调用接口，成功后跳回剧集页。 */
  async function save() {
    if (!name.trim() || !description.trim()) {
      setError("场景名和描述为必填项");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, mood, lightingNotes }),
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
      <h1 className="mt-4 text-2xl font-bold text-ink">创建场景</h1>
      <p className="mt-1 text-sm text-muted">场景档案跨集复用，确保环境风格统一</p>

      <Card className="mt-6 flex flex-col gap-4 p-6">
        <Field label="场景名" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：男主家-客厅" />
        </Field>

        <Field label="场景描述（用于AI生图）" required hint="描述空间布局、家具、装饰等，越具体一致性越高">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="例如：现代简约风格客厅，浅灰色沙发，茶几上有笔记本电脑，落地窗，窗外是城市夜景" />
        </Field>

        <Field label="氛围">
          <Select value={mood} onChange={(e) => setMood(e.target.value)}>
            <option value="">请选择</option>
            {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        <Field label="光线说明" hint="固定光线描述，确保跨镜头光影一致">
          <Input value={lightingNotes} onChange={(e) => setLightingNotes(e.target.value)}
            placeholder="例如：暖色调台灯照明，柔和侧光" />
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
