"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VIDEO_DURATIONS, VIDEO_SIZE_PRESETS } from "@/lib/constants";
import { triggerDownload, compressImageFile } from "@/lib/client-utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

type Mode = "text2vid" | "img2vid" | "keyframes";

const STATUS_TEXT: Record<string, string> = {
  queued: "排队中…",
  in_progress: "生成中…",
  completed: "已完成",
  failed: "生成失败",
  unknown: "查询中…",
};

export default function VideoStudio() {
  const [mode, setMode] = useState<Mode>("text2vid");
  const [prompt, setPrompt] = useState("");
  const [img2vid, setImg2vid] = useState<string>("");
  const [img2vidPreview, setImg2vidPreview] = useState<string>("");
  const [keyframes, setKeyframes] = useState<string[]>([]);
  const [durationIdx, setDurationIdx] = useState(1); // 默认约 5 秒
  const [sizeValue, setSizeValue] = useState<string>("1280x720");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [enhancing, setEnhancing] = useState(false);

  const [loading, setLoading] = useState(false); // 创建任务中
  const [polling, setPolling] = useState(false); // 轮询结果中
  const [videoId, setVideoId] = useState<string>("");
  const [historyId, setHistoryId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // 刷新页面后从 localStorage 恢复未完成的任务
  useEffect(() => {
    const saved = localStorage.getItem("agnes_video_id");
    if (saved) {
      setVideoId(saved);
      const savedHid = localStorage.getItem("agnes_video_history_id");
      if (savedHid) setHistoryId(savedHid);
      void pollStatus(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从 URL 参数预填（重跑）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("prompt");
    if (p) setPrompt(p);
  }, []);

  async function onImg2vidFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // 压缩后再用，避免超大 base64 请求体超过请求体上限
      const uri = await compressImageFile(file);
      setImg2vid(uri);
      setImg2vidPreview(uri);
    } catch {
      setError("图片读取失败");
    }
  }

  async function onKeyframeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (keyframes.length >= 4) return;
    try {
      const uri = await compressImageFile(file);
      setKeyframes((prev) => [...prev, uri]);
    } catch {
      setError("图片读取失败");
    }
    e.target.value = "";
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
        body: JSON.stringify({ prompt, target: "video" }),
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

  async function pollStatus(vid: string) {
    setPolling(true);
    setError(null);
    const start = Date.now();
    let errors = 0;
    while (true) {
      if (cancelledRef.current) return;
      let done = false;
      try {
        const res = await fetch(`/api/video/status?video_id=${encodeURIComponent(vid)}`);
        if (res.status === 404) {
          setError("任务不存在或已过期");
          done = true;
        } else if (res.ok) {
          errors = 0;
          const data = await res.json();
          setStatus(data.status || "unknown");
          setProgress(typeof data.progress === "number" ? data.progress : 0);
          if (data.status === "completed") {
            setResultUrl(data.url || null);
            done = true;
            // 回填结果 URL 到生成历史
            const hid = historyId || localStorage.getItem("agnes_video_history_id");
            if (hid && data.url) {
              void fillHistoryResultUrl(hid, data.url);
            }
          } else if (data.status === "failed") {
            setError(data.error || "视频生成失败");
            done = true;
          }
        } else {
          // 非 404 的错误响应：尝试解析 JSON，识别 NO_API_KEY 等明确错误
          let code: string | undefined;
          try {
            const data = await res.json();
            code = data?.code;
          } catch {
            // 响应体不是 JSON，按普通错误处理
          }
          if (code === "NO_API_KEY") {
            setError("未设置 Agnes API Key，请先到设置页填入");
            setNoApiKey(true);
            done = true;
          } else {
            errors++;
          }
        }
      } catch {
        errors++;
      }
      if (done) break;
      if (errors >= 6) {
        setError("查询多次失败，请稍后重试");
        break;
      }
      if (Date.now() - start > 600000) {
        setError("生成超时（超过 10 分钟），请稍后在画廊查看或重试");
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    setPolling(false);
    localStorage.removeItem("agnes_video_id");
    localStorage.removeItem("agnes_video_history_id");
  }

  async function fillHistoryResultUrl(hid: string, url: string) {
    try {
      await fetch(`/api/history/${hid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultUrl: url }),
      });
    } catch {
      // 回填失败不影响结果展示
    }
  }

  async function generate() {
    if (!prompt.trim()) {
      setError("请输入提示词");
      return;
    }
    if (mode === "img2vid" && !img2vid) {
      setError("图生视频需要上传一张图片");
      return;
    }
    if (mode === "keyframes" && keyframes.length < 2) {
      setError("关键帧动画至少需要 2 张图片");
      return;
    }

    const dur = VIDEO_DURATIONS[durationIdx];
    const sizePreset = VIDEO_SIZE_PRESETS.find((s) => s.value === sizeValue) || VIDEO_SIZE_PRESETS[0];

    const body: Record<string, unknown> = {
      prompt,
      mode,
      numFrames: dur.numFrames,
      frameRate: dur.frameRate,
      width: sizePreset.width,
      height: sizePreset.height,
    };
    if (negativePrompt.trim()) body.negativePrompt = negativePrompt.trim();
    if (seed.trim() && !Number.isNaN(Number(seed))) body.seed = Number(seed);
    if (mode === "img2vid") body.image = img2vid;
    else if (mode === "keyframes") body.keyframes = keyframes;

    setLoading(true);
    setError(null);
    setNoApiKey(false);
    setResultUrl(null);
    setStatus("");
    setProgress(0);
    try {
      const res = await fetch("/api/video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // 服务端可能返回空/非 JSON 响应体（如网关 413），先读文本再安全解析
      const text = await res.text();
      let data: {
        code?: string;
        error?: string;
        videoId?: string;
        historyId?: string;
        status?: string;
      } = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        if (data.code === "NO_API_KEY") {
          setError("未设置 Agnes API Key，请先到设置页填入");
          setNoApiKey(true);
          setLoading(false);
          return;
        }
        throw new Error(
          (data.error as string) ||
            `创建任务失败（HTTP ${res.status}），请检查图片大小后重试`,
        );
      }
      setVideoId(data.videoId ?? "");
      setHistoryId(data.historyId || "");
      localStorage.setItem("agnes_video_id", data.videoId ?? "");
      if (data.historyId) {
        localStorage.setItem("agnes_video_history_id", data.historyId);
      } else {
        localStorage.removeItem("agnes_video_history_id");
      }
      setStatus(data.status || "queued");
      setLoading(false);
      await pollStatus(data.videoId ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建任务失败");
      setLoading(false);
    }
  }

  function download() {
    if (!resultUrl) return;
    triggerDownload(resultUrl, "video", prompt || "agnes-video");
  }

  const busy = loading || polling;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* 控制面板 */}
      <Card className="flex flex-col gap-4 p-5 shadow-sm">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          <ModeButton active={mode === "text2vid"} onClick={() => setMode("text2vid")}>
            文生视频
          </ModeButton>
          <ModeButton active={mode === "img2vid"} onClick={() => setMode("img2vid")}>
            图生视频
          </ModeButton>
          <ModeButton active={mode === "keyframes"} onClick={() => setMode("keyframes")}>
            关键帧
          </ModeButton>
        </div>

        {mode === "img2vid" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">输入图片</label>
            <input
              type="file"
              accept="image/*"
              onChange={onImg2vidFile}
              className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent-strong transition hover:file:bg-accent-soft/70"
            />
            {img2vidPreview && (
              <img
                src={img2vidPreview}
                alt="输入图"
                className="mt-1 max-h-32 w-auto rounded-lg border border-line object-contain"
              />
            )}
          </div>
        )}

        {mode === "keyframes" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">
              关键帧图片（2-4 张，{keyframes.length}/4）
            </label>
            <div className="flex flex-wrap gap-2">
              {keyframes.map((src, i) => (
                <div key={i} className="relative">
                  <img
                    src={src}
                    alt={`关键帧 ${i + 1}`}
                    className="h-20 w-20 rounded-lg border border-line object-cover"
                  />
                  <button
                    onClick={() => setKeyframes((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger/90 text-xs text-white transition hover:bg-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
              {keyframes.length < 4 && (
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong text-2xl text-faint transition hover:border-accent/40 hover:text-accent">
                  +
                  <input type="file" accept="image/*" onChange={onKeyframeFile} className="hidden" />
                </label>
              )}
            </div>
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
            rows={3}
            placeholder="例如：A young astronaut walking across a red desert planet, slow cinematic tracking shot, dramatic sunset lighting"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="时长">
            <Select
              value={durationIdx}
              onChange={(e) => setDurationIdx(Number(e.target.value))}
            >
              {VIDEO_DURATIONS.map((d, i) => (
                <option key={d.numFrames} value={i}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="尺寸">
            <Select value={sizeValue} onChange={(e) => setSizeValue(e.target.value)}>
              {VIDEO_SIZE_PRESETS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted transition hover:text-ink">
            高级选项
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Input
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="反向提示词（要避免的内容）"
            />
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="随机种子（可选，固定后可复现）"
            />
          </div>
        </details>

        <Button size="lg" className="mt-1 w-full" onClick={generate} disabled={busy}>
          {loading ? "提交任务中…" : polling ? "生成中…请勿关闭页面" : "生成视频"}
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
          {busy ? (
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
              <Badge tone="accent">{STATUS_TEXT[status] || "处理中…"}</Badge>
              {polling && (
                <div className="w-full">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-xs text-faint">{progress}%</div>
                </div>
              )}
              {videoId && (
                <div className="text-xs text-faint">任务 ID: {videoId}</div>
              )}
            </div>
          ) : resultUrl ? (
            <video
              src={resultUrl}
              controls
              autoPlay
              loop
              className="max-h-[60vh] w-auto max-w-full rounded-lg border border-line animate-scale-in"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-faint">
              <span className="text-3xl opacity-40">🎬</span>
              <span className="text-sm">生成的视频将显示在这里</span>
            </div>
          )}
        </div>
        {resultUrl && !busy && (
          <Button
            variant="outline"
            className="border-accent/40 text-accent hover:border-accent hover:bg-accent-soft"
            onClick={download}
          >
            ⬇ 下载并保存
          </Button>
        )}
        {resultUrl && !busy && (
          <div className="flex items-center justify-between text-xs text-faint">
            <span>结果已保存到历史</span>
            {historyId && (
              <Link
                href={`/history/${historyId}`}
                className="font-medium text-accent transition hover:text-accent-strong"
              >
                查看详情 →
              </Link>
            )}
          </div>
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
      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition sm:text-sm ${
        active
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
