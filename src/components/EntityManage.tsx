/**
 * @file 通用实体管理组件
 * @description
 * 角色 / 场景 / 风格 共用的列表 + 编辑弹窗 + 删除 管理界面。
 * 通过 fields 配置驱动编辑表单，renderCard 驱动列表卡片展示。
 * 列表走 GET /api/series/[id]/{listPath}，编辑走 PATCH、删除走 DELETE /api/{entity}/[id]。
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";

export type FieldType = "text" | "textarea" | "select";

export interface EntityField {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  /** 主描述字段标记：为 true 时在标签旁渲染「AI 扩写」按钮 */
  aiAssist?: boolean;
}

export interface CardItem {
  id: string;
  title: string;
  subtitle?: string;
  desc?: string;
  imageUrl?: string | null;
}

export function EntityManage({
  seriesId,
  title,
  description,
  entityLabel,
  createHref,
  listPath,
  itemApiBase,
  fields,
  renderCard,
  type,
}: {
  seriesId: string;
  title: string;
  description: string;
  entityLabel: string;
  createHref: string;
  listPath: string;
  itemApiBase: string;
  fields: EntityField[];
  renderCard: (item: Record<string, unknown>) => CardItem;
  type: "character" | "location" | "style";
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI 扩写正在进行的字段 key（同时只扩写一个字段）
  const [describeLoading, setDescribeLoading] = useState<string | null>(null);
  // 参考图生成 loading
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/${listPath}`);
      const d = await res.json();
      setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(item: Record<string, unknown>) {
    setEditing(item);
    const f: Record<string, string> = {};
    for (const fld of fields) f[fld.key] = String(item[fld.key] ?? "");
    // referenceUrl 始终纳入 form（风格页未暴露该字段，但需用于参考图预览与生成）
    if (!("referenceUrl" in f)) f.referenceUrl = String(item.referenceUrl ?? "");
    setForm(f);
    setError(null);
  }

  /** AI 扩写：弹出输入框 -> 调 /api/assist/describe -> 回填指定字段 */
  async function aiDescribe(fieldKey: string) {
    const input = window.prompt("请输入简短描述，AI 将为你扩写：");
    if (!input?.trim()) return;
    setDescribeLoading(fieldKey);
    setError(null);
    try {
      const res = await fetch("/api/assist/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, input: input.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "扩写失败");
      setForm((s) => ({ ...s, [fieldKey]: d.text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "扩写失败");
    } finally {
      setDescribeLoading(null);
    }
  }

  /** 生成参考图：调 /api/entity/generate-image -> 更新 referenceUrl + 预览 */
  async function generateRefImage() {
    if (!editing) return;
    setImageLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entity/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: String(editing.id) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "生成失败");
      setForm((s) => ({ ...s, referenceUrl: d.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setImageLoading(false);
    }
  }

  async function save() {
    if (!editing) return;
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) {
        setError(`${f.label}为必填项`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${itemApiBase}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失败");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(`确认删除这个${entityLabel}？删除后不可恢复。`)) return;
    const res = await fetch(`${itemApiBase}/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href={`/series/${seriesId}`}
        className="text-sm text-faint transition hover:text-accent"
      >
        ← 返回剧集
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <Link
          href={createHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
        >
          + 新增{entityLabel}
        </Link>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-xl border border-line bg-surface py-12 text-center text-sm text-faint">
            加载中…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="📋"
            title={`还没有${entityLabel}`}
            hint={`先创建${entityLabel}档案`}
            action={
              <Link
                href={createHref}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
              >
                + 新增{entityLabel}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const c = renderCard(item);
              return (
                <Card key={c.id} className="flex flex-col p-4 hover:border-accent/30">
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt={c.title}
                      className="mb-3 h-32 w-full rounded-lg object-cover"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="truncate font-medium text-ink">{c.title}</h4>
                    {c.subtitle && (
                      <Badge tone="default" className="shrink-0">
                        {c.subtitle}
                      </Badge>
                    )}
                  </div>
                  {c.desc && (
                    <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted">
                      {c.desc}
                    </p>
                  )}
                  <div className="mt-3 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(item)}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(c.id)}
                    >
                      删除
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`编辑${entityLabel}`}
        maxWidth="max-w-xl"
      >
        <div className="flex flex-col gap-3">
          {fields.map((f) => {
            const val = form[f.key] ?? "";
            const set = (v: string) =>
              setForm((s) => ({ ...s, [f.key]: v }));
            const labelAddon = f.aiAssist ? (
              <button
                type="button"
                onClick={() => aiDescribe(f.key)}
                disabled={describeLoading === f.key}
                className="text-xs text-accent transition hover:text-accent-strong disabled:opacity-50"
              >
                {describeLoading === f.key ? "扩写中…" : "✨ AI 扩写"}
              </button>
            ) : undefined;
            if (f.type === "textarea") {
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  required={f.required}
                  hint={f.hint}
                  labelAddon={labelAddon}
                >
                  <Textarea
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    rows={3}
                  />
                </Field>
              );
            }
            if (f.type === "select") {
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  required={f.required}
                  hint={f.hint}
                  labelAddon={labelAddon}
                >
                  <Select value={val} onChange={(e) => set(e.target.value)}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            }
            return (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                hint={f.hint}
                labelAddon={labelAddon}
              >
                <Input value={val} onChange={(e) => set(e.target.value)} />
              </Field>
            );
          })}
          {editing && (
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">参考图</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateRefImage}
                  disabled={imageLoading}
                >
                  {imageLoading ? "生成中…" : "✨ 生成参考图"}
                </Button>
              </div>
              {form.referenceUrl ? (
                <img
                  src={form.referenceUrl}
                  alt="参考图"
                  className="mt-2 h-40 w-full rounded-lg object-cover"
                />
              ) : (
                <p className="mt-2 text-xs text-faint">
                  暂无参考图，点击上方按钮 AI 生成
                </p>
              )}
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
