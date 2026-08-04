/**
 * @file 新建风格设定页
 * @description
 * 为指定剧集创建新风格设定的表单页。
 * 风格设定（画风、色调、镜头语言、负面提示词）会全局应用到该剧集的所有分镜，
 * 统一整部短剧的视觉风格。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";

/** 画风预设选项，可点击快捷填入 */
const ART_STYLES = [
  "电影感写实，8K高清，景深效果",
  "二次元动漫风，线条细腻，色彩清爽",
  "水彩插画风，柔和色调，手绘质感",
  "赛博朋克风，霓虹灯光，高对比",
  "国风水墨，淡雅色调，意境感",
  "3D渲染，CG质感，光影真实",
];

/** 色调预设选项 */
const PALETTES = ["暖色调", "冷色调", "高对比", "低饱和", "高饱和", "黑白", "复古色调"];
/** 镜头语言预设选项 */
const CAMERA_STYLES = ["手持摄影，有微抖", "稳定器，平滑运镜", "电影感，缓慢推拉", "固定机位", "运动镜头，跟随拍摄"];

/**
 * 新建风格设定页组件。
 *
 * 通过表单收集风格信息，提交至 POST /api/series/[id]/styles，成功后返回剧集详情页。
 */
export default function NewStylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = use(params);
  const router = useRouter();

  // ---- 表单字段 ----
  const [name, setName] = useState("");
  const [artStyle, setArtStyle] = useState(ART_STYLES[0]);
  const [colorPalette, setColorPalette] = useState("");
  const [cameraStyle, setCameraStyle] = useState("");
  // 负面提示词预设常见缺陷词，避免 AI 生成畸变画面
  const [negativePrompt, setNegativePrompt] = useState("毁容，面部扭曲，肢体变形，手指畸形，模糊，低质量");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 提交保存风格设定，校验必填项后调用接口，成功后跳回剧集页。 */
  async function save() {
    if (!name.trim() || !artStyle.trim()) {
      setError("风格名和画风描述为必填项");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/styles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, artStyle, colorPalette, cameraStyle, negativePrompt }),
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
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">创建风格设定</h1>
      <p className="mt-1 text-sm text-zinc-500">定义画风、色调和镜头语言，全局应用到所有分镜</p>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <div>
          <label className="text-sm font-medium text-zinc-700">风格名 <span className="text-red-500">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：电影感写实"
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">画风描述 <span className="text-red-500">*</span></label>
          <p className="mt-0.5 text-xs text-zinc-400">可从预设选择或自行编辑，将注入每个分镜的生图提示词</p>
          <textarea value={artStyle} onChange={(e) => setArtStyle(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-y" />
          {/* 画风快捷预设按钮 */}
          <div className="mt-1 flex flex-wrap gap-1">
            {ART_STYLES.map((s) => (
              <button key={s} onClick={() => setArtStyle(s)}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 hover:bg-indigo-50 hover:text-indigo-600">
                {s.split("，")[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-zinc-700">色调</label>
            <select value={colorPalette} onChange={(e) => setColorPalette(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500">
              <option value="">请选择</option>
              {PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">镜头语言</label>
            <select value={cameraStyle} onChange={(e) => setCameraStyle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500">
              <option value="">请选择</option>
              {CAMERA_STYLES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">全局负面提示词</label>
          <p className="mt-0.5 text-xs text-zinc-400">所有分镜生成都会附加这些排除词</p>
          <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-y" />
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
