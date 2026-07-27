"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VIDEO_DURATIONS, VIDEO_SIZE_PRESETS } from "@/lib/constants";
import { fileToDataUri, triggerDownload } from "@/lib/client-utils";

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
      void pollStatus(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onImg2vidFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uri = await fileToDataUri(file);
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
      const uri = await fileToDataUri(file);
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
          } else if (data.status === "failed") {
            setError(data.error || "视频生成失败");
            done = true;
          }
        } else {
          errors++;
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
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_API_KEY") {
          setError("未设置 Agnes API Key，请先到设置页填入");
          setNoApiKey(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error || "创建任务失败");
      }
      setVideoId(data.videoId);
      localStorage.setItem("agnes_video_id", data.videoId);
      setStatus(data.status || "queued");
      setLoading(false);
      await pollStatus(data.videoId);
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
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex gap-2">
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
            <label className="text-sm font-medium text-zinc-700">输入图片</label>
            <input
              type="file"
              accept="image/*"
              onChange={onImg2vidFile}
              className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {img2vidPreview && (
              <img
                src={img2vidPreview}
                alt="输入图"
                className="mt-1 max-h-32 w-auto rounded-lg border border-zinc-200 object-contain"
              />
            )}
          </div>
        )}

        {mode === "keyframes" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">
              关键帧图片（2-4 张，{keyframes.length}/4）
            </label>
            <div className="flex flex-wrap gap-2">
              {keyframes.map((src, i) => (
                <div key={i} className="relative">
                  <img
                    src={src}
                    alt={`关键帧 ${i + 1}`}
                    className="h-20 w-20 rounded-lg border border-zinc-200 object-cover"
                  />
                  <button
                    onClick={() => setKeyframes((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
              {keyframes.length < 4 && (
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-2xl text-zinc-400 hover:border-indigo-400 hover:text-indigo-500">
                  +
                  <input type="file" accept="image/*" onChange={onKeyframeFile} className="hidden" />
                </label>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700">提示词</label>
            <button
              onClick={enhance}
              disabled={enhancing}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
            >
              {enhancing ? "优化中…" : "✨ 优化提示词"}
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="例如：A young astronaut walking across a red desert planet, slow cinematic tracking shot, dramatic sunset lighting"
            className="resize-y rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">时长</label>
            <select
              value={durationIdx}
              onChange={(e) => setDurationIdx(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
            >
              {VIDEO_DURATIONS.map((d, i) => (
                <option key={d.numFrames} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-700">尺寸</label>
            <select
              value={sizeValue}
              onChange={(e) => setSizeValue(e.target.value)}
              className="rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
            >
              {VIDEO_SIZE_PRESETS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-600">高级选项</summary>
          <div className="mt-3 flex flex-col gap-3">
            <input
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="反向提示词（要避免的内容）"
              className="rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="随机种子（可选，固定后可复现）"
              className="rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </details>

        <button
          onClick={generate}
          disabled={busy}
          className="mt-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "提交任务中…" : polling ? "生成中…请勿关闭页面" : "生成视频"}
        </button>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {noApiKey && (
          <Link
            href="/settings"
            className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            前往设置页填入 API Key
          </Link>
        )}
      </div>

      {/* 结果区 */}
      <div className="flex min-h-[320px] flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-700">生成结果</h3>
        <div className="flex flex-1 items-center justify-center">
          {busy ? (
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
              <span className="text-sm text-zinc-500">{STATUS_TEXT[status] || "处理中…"}</span>
              {polling && (
                <div className="w-full">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full bg-indigo-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-xs text-zinc-400">{progress}%</div>
                </div>
              )}
              {videoId && (
                <div className="text-xs text-zinc-400">任务 ID: {videoId}</div>
              )}
            </div>
          ) : resultUrl ? (
            <video
              src={resultUrl}
              controls
              autoPlay
              loop
              className="max-h-[60vh] w-auto max-w-full rounded-lg border border-zinc-200"
            />
          ) : (
            <div className="text-sm text-zinc-400">生成的视频将显示在这里</div>
          )}
        </div>
        {resultUrl && !busy && (
          <button
            onClick={download}
            className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            ⬇ 下载并保存
          </button>
        )}
        {resultUrl && !busy && (
          <p className="text-xs text-zinc-400">结果不会保存，请及时下载到本地</p>
        )}
      </div>
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
      className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm ${
        active ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
