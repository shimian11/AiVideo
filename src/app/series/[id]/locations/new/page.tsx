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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-indigo-600">← 返回</button>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">创建场景</h1>
      <p className="mt-1 text-sm text-zinc-500">场景档案跨集复用，确保环境风格统一</p>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <div>
          <label className="text-sm font-medium text-zinc-700">场景名 <span className="text-red-500">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：男主家-客厅"
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">场景描述（用于AI生图） <span className="text-red-500">*</span></label>
          <p className="mt-0.5 text-xs text-zinc-400">描述空间布局、家具、装饰等，越具体一致性越高</p>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="例如：现代简约风格客厅，浅灰色沙发，茶几上有笔记本电脑，落地窗，窗外是城市夜景"
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-y" />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">氛围</label>
          <select value={mood} onChange={(e) => setMood(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500">
            <option value="">请选择</option>
            {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">光线说明</label>
          <p className="mt-0.5 text-xs text-zinc-400">固定光线描述，确保跨镜头光影一致</p>
          <input value={lightingNotes} onChange={(e) => setLightingNotes(e.target.value)}
            placeholder="例如：暖色调台灯照明，柔和侧光"
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={() => router.back()} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">取消</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
