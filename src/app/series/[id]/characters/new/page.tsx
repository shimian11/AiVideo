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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-indigo-600">
        ← 返回
      </button>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">创建角色</h1>
      <p className="mt-1 text-sm text-zinc-500">
        角色档案将跨集复用，描述越详细，AI 生成时一致性越高
      </p>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <Field label="角色名" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：林悦" className="input" />
        </Field>

        <Field label="角色类型">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>

        <Field label="外貌描述（用于AI生图）" required hint="越具体越好：年龄、性别、发型、五官、身材等">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="例如：24岁女性，干练短发，五官清秀有灵气，皮肤白皙，身材纤细"
            className="input resize-y" />
        </Field>

        <Field label="性格设定" hint="性格特点，用于台词和配音风格参考">
          <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={2}
            placeholder="例如：性格坚韧但内心温柔，遇事冷静，偶尔有些小迷糊"
            className="input resize-y" />
        </Field>

        <Field label="服装描述" hint="日常穿着，用于保持跨镜头服装一致性">
          <input value={outfit} onChange={(e) => setOutfit(e.target.value)}
            placeholder="例如：白色衬衫+高腰西裤，戴银色细框眼镜"
            className="input" />
        </Field>

        <Field label="标志性特征" hint="独特特征，如疤痕、纹身、饰品等">
          <input value={features} onChange={(e) => setFeatures(e.target.value)}
            placeholder="例如：左手腕有蝴蝶纹身"
            className="input" />
        </Field>

        <Field label="配音音色预设" hint="可选，后续配音环节使用">
          <input value={voicePreset} onChange={(e) => setVoicePreset(e.target.value)}
            placeholder="例如：温柔女声"
            className="input" />
        </Field>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={() => router.back()} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
            取消
          </button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d4d4d8;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px #e0e7ff;
        }
      `}</style>
    </div>
  );
}

/**
 * 表单字段容器组件：统一标签、必填标记、提示文案与输入控件的布局。
 */
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
