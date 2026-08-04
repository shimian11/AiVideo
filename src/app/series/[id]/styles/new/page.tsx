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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";

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
    <div className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>← 返回</Button>
      <h1 className="mt-4 text-2xl font-bold text-ink">创建风格设定</h1>
      <p className="mt-1 text-sm text-muted">定义画风、色调和镜头语言，全局应用到所有分镜</p>

      <Card className="mt-6 flex flex-col gap-4 p-6">
        <Field label="风格名" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：电影感写实" />
        </Field>

        <Field label="画风描述" required hint="可从预设选择或自行编辑，将注入每个分镜的生图提示词">
          <Textarea value={artStyle} onChange={(e) => setArtStyle(e.target.value)} rows={2} />
          {/* 画风快捷预设按钮 */}
          <div className="mt-2 flex flex-wrap gap-1">
            {ART_STYLES.map((s) => (
              <button key={s} onClick={() => setArtStyle(s)}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted transition hover:bg-accent-soft hover:text-accent-strong">
                {s.split("，")[0]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="色调">
            <Select value={colorPalette} onChange={(e) => setColorPalette(e.target.value)}>
              <option value="">请选择</option>
              {PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="镜头语言">
            <Select value={cameraStyle} onChange={(e) => setCameraStyle(e.target.value)}>
              <option value="">请选择</option>
              {CAMERA_STYLES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="全局负面提示词" hint="所有分镜生成都会附加这些排除词">
          <Textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2} />
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
