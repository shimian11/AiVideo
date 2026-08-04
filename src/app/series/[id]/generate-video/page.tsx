/**
 * @file 剧集 AI 生视频页
 * @description
 * 基于剧集角色/场景/风格档案生成视频，自动拼装提示词保证跨集一致性。
 * 三种模式（文生视频 / 图生视频 / 关键帧），输入图可取自选中角色定妆照或场景参考图，
 * 也可上传。轮询任务状态，完成后回填历史 resultUrl 并提供预览/下载。
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { VIDEO_DURATIONS, VIDEO_SIZE_PRESETS } from "@/lib/constants";
import { fileToDataUri, triggerDownload } from "@/lib/client-utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type Mode = "text2vid" | "img2vid" | "keyframes";

/** 角色档案（含参考图） */
interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  personality: string | null;
  outfit: string | null;
  features: string | null;
  referenceUrl: string | null;
}

/** 场景档案（含参考图） */
interface Location {
  id: string;
  name: string;
  description: string;
  mood: string | null;
  lightingNotes: string | null;
  referenceUrl: string | null;
}

/** 风格设定（含参考图与反向提示词） */
interface StyleProfile {
  id: string;
  name: string;
  artStyle: string;
  colorPalette: string | null;
  cameraStyle: string | null;
  negativePrompt: string | null;
  referenceUrl: string | null;
}

/** 剧集详情（仅声明本页用到的字段） */
interface SeriesDetail {
  id: string;
  title: string;
  characters: Character[];
  locations: Location[];
  styles: StyleProfile[];
}

/** 可选参考图项：来自选中角色 / 场景 */
interface RefImage {
  url: string;
  label: string;
}

const STATUS_TEXT: Record<string, string> = {
  queued: "排队中…",
  in_progress: "生成中…",
  completed: "已完成",
  failed: "生成失败",
  unknown: "查询中…",
};

const ROLE_LABEL: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  extra: "龙套",
};

/**
 * 剧集 AI 生视频页组件。
 *
 * 通过路由参数 id 取剧集，加载角色/场景/风格后让用户勾选，自动拼装一致性提示词，
 * 调用 /api/video/create 创建任务并轮询 /api/video/status，完成后回填历史。
 */
export default function SeriesGenerateVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // ---- 剧集数据 ----
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- 资源选择 ----
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");

  // ---- 模式与提示词 ----
  const [mode, setMode] = useState<Mode>("text2vid");
  const [actionPrompt, setActionPrompt] = useState("");
  const [assembledPrompt, setAssembledPrompt] = useState("");
  const [dirty, setDirty] = useState(false); // 用户是否手动编辑过拼装预览
  const [enhancing, setEnhancing] = useState(false);

  // ---- 输入图 ----
  const [img2vidImage, setImg2vidImage] = useState<string>("");
  const [keyframes, setKeyframes] = useState<string[]>([]);

  // ---- 参数 ----
  const [durationIdx, setDurationIdx] = useState(1);
  const [sizeValue, setSizeValue] = useState<string>("1280x720");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");

  // ---- 生成状态 ----
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
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

  // ---- 加载剧集 ----
  useEffect(() => {
    loadSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadSeries() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/series/${id}`);
      if (!res.ok) {
        setLoadError("剧集不存在或加载失败");
        return;
      }
      const data = (await res.json()) as SeriesDetail;
      setSeries(data);
    } catch {
      setLoadError("剧集加载失败");
    } finally {
      setLoading(false);
    }
  }

  // ---- 可用参考图：选中角色 + 选中场景的 referenceUrl ----
  const availableRefs = useMemo<RefImage[]>(() => {
    const refs: RefImage[] = [];
    if (!series) return refs;
    for (const cid of selectedCharIds) {
      const c = series.characters.find((x) => x.id === cid);
      if (c?.referenceUrl) refs.push({ url: c.referenceUrl, label: `角色 · ${c.name}` });
    }
    if (locationId) {
      const l = series.locations.find((x) => x.id === locationId);
      if (l?.referenceUrl) refs.push({ url: l.referenceUrl, label: `场景 · ${l.name}` });
    }
    return refs;
  }, [series, selectedCharIds, locationId]);

  // ---- 拼装提示词：[角色 desc+outfit+features] + [场景 desc+mood+lighting] + [风格 art+color+camera] + [动作] ----
  function computeAssembled(): string {
    if (!series) return actionPrompt.trim();
    const parts: string[] = [];
    for (const cid of selectedCharIds) {
      const c = series.characters.find((x) => x.id === cid);
      if (!c) continue;
      const charParts = [c.description, c.outfit, c.features].filter(Boolean);
      if (charParts.length) parts.push(charParts.join("，"));
    }
    if (locationId) {
      const l = series.locations.find((x) => x.id === locationId);
      if (l) {
        const locParts = [l.description, l.mood, l.lightingNotes].filter(Boolean);
        if (locParts.length) parts.push(locParts.join("，"));
      }
    }
    if (styleId) {
      const s = series.styles.find((x) => x.id === styleId);
      if (s) {
        const styleParts = [s.artStyle, s.colorPalette, s.cameraStyle].filter(Boolean);
        if (styleParts.length) parts.push(styleParts.join("，"));
      }
    }
    if (actionPrompt.trim()) parts.push(actionPrompt.trim());
    return parts.join("，");
  }

  // 资源/动作变化时自动重拼（用户手动编辑后以编辑为准）
  useEffect(() => {
    if (!dirty) setAssembledPrompt(computeAssembled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharIds, locationId, styleId, actionPrompt, series, dirty]);

  // 选中风格时把风格的 negativePrompt 预填到高级选项（保证一致性）
  useEffect(() => {
    if (!series) return;
    const s = series.styles.find((x) => x.id === styleId);
    setNegativePrompt(s?.negativePrompt || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, series]);

  // ---- 资源 chips 切换 ----
  function toggleChar(cid: string) {
    setSelectedCharIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid],
    );
  }

  // ---- 文件上传 ----
  async function onImg2vidFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uri = await fileToDataUri(file);
      setImg2vidImage(uri);
    } catch {
      setError("图片读取失败");
    }
    e.target.value = "";
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

  function toggleKeyframeRef(url: string) {
    setKeyframes((prev) =>
      prev.includes(url) ? prev.filter((x) => x !== url) : prev.length >= 4 ? prev : [...prev, url],
    );
  }

  // ---- AI 扩写：优化用户动作描述并填回 ----
  async function enhance() {
    if (!actionPrompt.trim()) {
      setError("请先输入动作 / 镜头描述");
      return;
    }
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: actionPrompt, target: "video" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "优化失败");
      setActionPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "优化失败");
    } finally {
      setEnhancing(false);
    }
  }

  // ---- 轮询任务状态 ----
  async function pollStatus(vid: string, hid: string) {
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
            const url = (data.url as string) || null;
            setResultUrl(url);
            // 回填历史 resultUrl
            if (url) {
              try {
                await fetch(`/api/history/${hid}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ resultUrl: url }),
                });
              } catch {
                // 回填失败不阻塞用户下载
              }
            }
            done = true;
          } else if (data.status === "failed") {
            setError(data.error || "视频生成失败");
            done = true;
          }
        } else {
          let code: string | undefined;
          try {
            const data = await res.json();
            code = data?.code;
          } catch {
            // 非 JSON 响应
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
        setError("生成超时（超过 10 分钟），请稍后在历史记录查看或重试");
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    setPolling(false);
  }

  // ---- 创建生成任务 ----
  async function generate() {
    if (selectedCharIds.length === 0 && !locationId && !styleId) {
      setError("至少选一个角色 / 场景 / 风格");
      return;
    }
    if (!assembledPrompt.trim()) {
      setError("请输入动作 / 镜头描述");
      return;
    }
    if (mode === "img2vid" && !img2vidImage) {
      setError("图生视频需要一张图片");
      return;
    }
    if (mode === "keyframes" && keyframes.length < 2) {
      setError("关键帧动画至少需要 2 张图片");
      return;
    }

    const dur = VIDEO_DURATIONS[durationIdx];
    const sizePreset =
      VIDEO_SIZE_PRESETS.find((s) => s.value === sizeValue) || VIDEO_SIZE_PRESETS[0];

    const body: Record<string, unknown> = {
      prompt: assembledPrompt,
      mode,
      seriesId: id,
      numFrames: dur.numFrames,
      frameRate: dur.frameRate,
      width: sizePreset.width,
      height: sizePreset.height,
    };
    if (negativePrompt.trim()) body.negativePrompt = negativePrompt.trim();
    if (seed.trim() && !Number.isNaN(Number(seed))) body.seed = Number(seed);
    if (mode === "img2vid") body.image = img2vidImage;
    else if (mode === "keyframes") body.keyframes = keyframes;

    setCreating(true);
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
          setCreating(false);
          return;
        }
        throw new Error(data.error || "创建任务失败");
      }
      setVideoId(data.videoId);
      setStatus(data.status || "queued");
      setCreating(false);
      await pollStatus(data.videoId, data.historyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建任务失败");
      setCreating(false);
    }
  }

  function download() {
    if (!resultUrl) return;
    const name = (series?.title || "series").replace(/[\\/:*?"<>|]/g, "_");
    triggerDownload(resultUrl, "video", `${name}-video`);
  }

  const busy = creating || polling;
  const hasAnyResource =
    selectedCharIds.length > 0 || !!locationId || !!styleId;

  // ---- 渲染 ----
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-faint animate-fade-in">
        加载中…
      </div>
    );
  }
  if (loadError || !series) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-danger animate-fade-in">
        {loadError || "剧集不存在"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 animate-fade-in">
      {/* 面包屑 */}
      <Link
        href={`/series/${id}`}
        className="text-sm text-faint transition hover:text-accent"
      >
        ← 返回剧集
      </Link>

      {/* 标题 */}
      <h1 className="mt-4 text-2xl font-bold text-ink">
        AI 生视频 - {series.title}
      </h1>
      <p className="mt-1 text-sm text-muted">
        勾选角色 / 场景 / 风格，自动拼装提示词，保证跨集一致性
      </p>

      {/* 顶部资源选择区 */}
      <Card className="mt-6 flex flex-col gap-5 p-5 shadow-sm">
        {/* 角色（多选） */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              角色 <span className="text-xs font-normal text-faint">（多选，可选）</span>
            </label>
            <span className="text-xs text-faint">
              已选 {selectedCharIds.length}
            </span>
          </div>
          {series.characters.length === 0 ? (
            <p className="mt-2 text-xs text-faint">该剧集还没有角色档案</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {series.characters.map((c) => (
                <Chip
                  key={c.id}
                  active={selectedCharIds.includes(c.id)}
                  onClick={() => toggleChar(c.id)}
                >
                  {c.name}
                  {c.role && (
                    <span className="ml-1 opacity-70">
                      · {ROLE_LABEL[c.role] || c.role}
                    </span>
                  )}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {/* 场景（单选） */}
        <div>
          <label className="text-sm font-medium text-ink">
            场景 <span className="text-xs font-normal text-faint">（单选，可选）</span>
          </label>
          {series.locations.length === 0 ? (
            <p className="mt-2 text-xs text-faint">该剧集还没有场景档案</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {series.locations.map((l) => (
                <Chip
                  key={l.id}
                  active={locationId === l.id}
                  onClick={() =>
                    setLocationId((prev) => (prev === l.id ? "" : l.id))
                  }
                >
                  {l.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {/* 风格（单选） */}
        <div>
          <label className="text-sm font-medium text-ink">
            风格 <span className="text-xs font-normal text-faint">（单选，可选）</span>
          </label>
          {series.styles.length === 0 ? (
            <p className="mt-2 text-xs text-faint">该剧集还没有风格设定</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {series.styles.map((s) => (
                <Chip
                  key={s.id}
                  active={styleId === s.id}
                  onClick={() =>
                    setStyleId((prev) => (prev === s.id ? "" : s.id))
                  }
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {!hasAnyResource && (
          <div className="rounded-lg bg-accent-soft/60 px-3 py-2 text-xs text-accent-strong">
            至少选一个角色 / 场景 / 风格后再生成
          </div>
        )}
      </Card>

      {/* 控制面板 + 结果区 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 控制面板 */}
        <Card className="flex flex-col gap-4 p-5 shadow-sm">
          {/* 模式切换 */}
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

          {/* 图生视频输入图 */}
          {mode === "img2vid" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink">输入图片</label>
              {availableRefs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableRefs.map((r) => (
                    <button
                      key={r.url}
                      type="button"
                      title={r.label}
                      onClick={() => setImg2vidImage(r.url)}
                      className={`relative h-16 w-16 overflow-hidden rounded-lg border transition ${
                        img2vidImage === r.url
                          ? "border-accent ring-2 ring-accent/30"
                          : "border-line hover:border-accent/40"
                      }`}
                    >
                      <img src={r.url} alt={r.label} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={onImg2vidFile}
                className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent-strong transition hover:file:bg-accent-soft/70"
              />
              {img2vidImage && (
                <div className="relative mt-1 inline-block">
                  <img
                    src={img2vidImage}
                    alt="输入图"
                    className="max-h-32 w-auto rounded-lg border border-line object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setImg2vidImage("")}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger/90 text-xs text-white transition hover:bg-danger"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 关键帧图片 */}
          {mode === "keyframes" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink">
                关键帧图片（2-4 张，{keyframes.length}/4）
              </label>
              {availableRefs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableRefs.map((r) => {
                    const selected = keyframes.includes(r.url);
                    return (
                      <button
                        key={r.url}
                        type="button"
                        title={r.label}
                        onClick={() => toggleKeyframeRef(r.url)}
                        className={`relative h-16 w-16 overflow-hidden rounded-lg border transition ${
                          selected
                            ? "border-accent ring-2 ring-accent/30"
                            : "border-line hover:border-accent/40"
                        }`}
                      >
                        <img src={r.url} alt={r.label} className="h-full w-full object-cover" />
                        {selected && (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-accent px-1 text-[10px] text-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {keyframes.map((src, i) => (
                  <div key={i} className="relative">
                    <img
                      src={src}
                      alt={`关键帧 ${i + 1}`}
                      className="h-20 w-20 rounded-lg border border-line object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setKeyframes((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger/90 text-xs text-white transition hover:bg-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {keyframes.length < 4 && (
                  <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong text-2xl text-faint transition hover:border-accent/40 hover:text-accent">
                    +
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onKeyframeFile}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* 动作 / 镜头描述 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-ink">动作 / 镜头描述</label>
              <button
                type="button"
                onClick={enhance}
                disabled={enhancing}
                className="text-xs font-medium text-accent transition hover:text-accent-strong disabled:opacity-50"
              >
                {enhancing ? "扩写中…" : "✨ AI 扩写"}
              </button>
            </div>
            <Textarea
              value={actionPrompt}
              onChange={(e) => setActionPrompt(e.target.value)}
              rows={2}
              placeholder="例如：角色转身走向窗口，镜头缓慢推进，逆光剪影"
            />
          </div>

          {/* 拼装预览 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-ink">拼装预览</label>
              {dirty && (
                <button
                  type="button"
                  onClick={() => {
                    setDirty(false);
                    setAssembledPrompt(computeAssembled());
                  }}
                  className="text-xs font-medium text-faint transition hover:text-accent"
                >
                  ↻ 重新拼装
                </button>
              )}
            </div>
            <Textarea
              value={assembledPrompt}
              onChange={(e) => {
                setAssembledPrompt(e.target.value);
                setDirty(true);
              }}
              rows={5}
              placeholder="选中资源后自动拼装；也可手动编辑，编辑后以本框内容为准"
            />
            <p className="text-xs text-faint">
              最终提交的提示词以上框为准
            </p>
          </div>

          {/* 时长 / 尺寸 */}
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

          {/* 高级选项 */}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-muted transition hover:text-ink">
              高级选项
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="反向提示词" hint="选中风格会自动预填，可手动调整">
                <Input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="要避免的内容"
                />
              </Field>
              <Field label="随机种子" hint="固定后可复现同一画面">
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="留空则随机"
                />
              </Field>
            </div>
          </details>

          <Button size="lg" className="mt-1 w-full" onClick={generate} disabled={busy}>
            {creating
              ? "提交任务中…"
              : polling
                ? "生成中…请勿关闭页面"
                : "生成视频"}
          </Button>

          {error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
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
              <EmptyState
                icon="🎬"
                title="生成的视频将显示在这里"
                hint="勾选资源、描述动作后点击生成"
              />
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
            <p className="text-xs text-faint">结果已保存到历史记录，也可在此下载到本地</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * 资源选择 chip：选中高亮为 accent 色，未选为线框。
 */
function Chip({
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
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-line text-muted hover:border-accent/40 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 模式切换按钮（参考 VideoStudio）。
 */
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
      type="button"
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
