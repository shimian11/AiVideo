"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IMAGE_SIZES, IMAGE_RATIOS } from "@/lib/constants";
import { fileToDataUri, triggerDownload } from "@/lib/client-utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea, Select, Field } from "@/components/ui/Input";

type Mode = "text2img" | "img2img";

export default function ImageStudio() {
  const [mode, setMode] = useState<Mode>("text2img");
  const [prompt, setPrompt] = useState("");
  const [inputImage, setInputImage] = useState<string>(""); // data URI 或公开 URL
  const [inputPreview, setInputPreview] = useState<string>("");
  const [size, setSize] = useState<string>("2K");
  const [ratio, setRatio] = useState<string>("1:1");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);

  // 从 URL 参数预填（重跑）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("prompt");
    if (p) setPrompt(p);
    const s = params.get("size");
    if (s) setSize(s);
    const r = params.get("ratio");
    if (r) setRatio(r);
    const m = params.get("mode");
    if (m === "img2img" || m === "text2img") setMode(m);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUri = await fileToDataUri(file);
      setInputImage(dataUri);
      setInputPreview(dataUri);
    } catch {
      setError("图片读取失败");
    }
  }

  async function enhance() {
    if (!prompt.trim()) {
      setError("请先输入提示词");
      return;
    }
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, target: "image" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "优化失败");
      setPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "优化失败");
    } finally {
      setEnhancing(false);
    }
  }

  async function generate() {
    if (!prompt.trim()) {
      setError("请输入提示词");
      return;
    }
    if (mode === "img2img" && !inputImage) {
      setError("图生图需要上传一张参考图片");
      return;
    }
    setLoading(true);
    setError(null);
    setNoApiKey(false);
    setResultUrl(null);
    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size,
          ratio,
          mode,
          inputImage: mode === "img2img" ? inputImage : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_API_KEY") {
          setError("未设置 Agnes API Key，请先到设置页填入");
          setNoApiKey(true);
          return;
        }
        throw new Error(data.error || "生成失败");
      }
      if (!data.url) throw new Error("未返回图片");
      setResultUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!resultUrl) return;
    triggerDownload(resultUrl, "image", prompt || "agnes-image");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* 控制面板 */}
      <Card className="flex flex-col gap-4 p-5 shadow-sm">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          <ModeButton active={mode === "text2img"} onClick={() => setMode("text2img")}>
            文生图
          </ModeButton>
          <ModeButton active={mode === "img2img"} onClick={() => setMode("img2img")}>
            图生图
          </ModeButton>
        </div>

        {mode === "img2img" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">参考图片</label>
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent-strong transition hover:file:bg-accent-soft/70"
            />
            {inputPreview && (
              <img
                src={inputPreview}
                alt="参考图"
                className="mt-1 max-h-40 w-auto rounded-lg border border-line object-contain"
              />
            )}
            <p className="text-xs text-faint">上传图片将用于风格转换 / 重绘，并尽量保留原始构图</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">提示词</label>
            <button
              onClick={enhance}
              disabled={enhancing}
              className="text-xs font-medium text-accent transition hover:text-accent-strong disabled:opacity-50"
            >
              {enhancing ? "优化中…" : "✨ 优化提示词"}
            </button>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="描述你想生成的画面，例如：日出时分薄雾峡谷上方的发光浮空城市，电影级写实风格"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="尺寸档位">
            <Select value={size} onChange={(e) => setSize(e.target.value)}>
              {IMAGE_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="宽高比">
            <Select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              {IMAGE_RATIOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button size="lg" className="mt-1 w-full" onClick={generate} disabled={loading}>
          {loading ? "生成中…（可能需要数十秒）" : "生成图片"}
        </Button>

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
        )}
        {noApiKey && (
          <Link
            href="/settings"
            className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong transition hover:bg-accent-soft/70"
          >
            前往设置页填入 API Key
          </Link>
        )}
      </Card>

      {/* 结果区 */}
      <Card className="flex min-h-[320px] flex-col gap-4 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">生成结果</h3>
        <div className="flex flex-1 items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-faint">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
              <span className="text-sm">正在生成图片…</span>
            </div>
          ) : resultUrl ? (
            <img
              src={resultUrl}
              alt="生成结果"
              className="max-h-[60vh] w-auto max-w-full rounded-lg border border-line object-contain animate-scale-in"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-faint">
              <span className="text-3xl opacity-40">🖼️</span>
              <span className="text-sm">生成的图片将显示在这里</span>
            </div>
          )}
        </div>
        {resultUrl && !loading && (
          <Button
            variant="outline"
            className="border-accent/40 text-accent hover:border-accent hover:bg-accent-soft"
            onClick={download}
          >
            ⬇ 下载并保存
          </Button>
        )}
        {resultUrl && !loading && (
          <p className="text-xs text-faint">结果不会保存，请及时下载到本地</p>
        )}
      </Card>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
