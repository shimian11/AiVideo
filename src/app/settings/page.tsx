/**
 * @file 设置页 - API Key 管理
 * @description
 * 管理多个 Agnes API Key：添加、选用、删除。未选用时使用系统默认 Key。
 * 提供前往 platform.agnes-ai.com 申请 Key 的入口。
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Field } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface KeyItem {
  id: string;
  name: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  masked: string;
}

export default function SettingsPage() {
  const [items, setItems] = useState<KeyItem[]>([]);
  const [hasSystemDefault, setHasSystemDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/apikey");
      const d = await res.json();
      setItems(d.items || []);
      setHasSystemDefault(!!d.hasSystemDefault);
    } finally {
      setLoading(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings/apikey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, apiKey }),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) {
      setName("");
      setApiKey("");
      setMsg({ ok: true, text: "已添加" });
      await load();
    } else {
      setMsg({ ok: false, text: d.error || "添加失败" });
    }
  }

  async function select(id: string) {
    setMsg(null);
    const res = await fetch("/api/settings/apikey", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await load();
  }

  async function remove(id: string) {
    if (!confirm("确认删除这个 API Key？")) return;
    setMsg(null);
    const res = await fetch(`/api/settings/apikey?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMsg({ ok: true, text: "已删除" });
      await load();
    } else {
      setMsg({ ok: false, text: "删除失败" });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">设置</h1>
      <p className="mt-1 text-sm text-muted">管理你的 Agnes API Key</p>

      {/* 申请入口 */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">还没有 API Key？</h2>
            <p className="mt-0.5 text-xs text-muted">
              前往 Agnes 开放平台申请，填入下方即可使用
            </p>
          </div>
          <Link
            href="https://platform.agnes-ai.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg accent-gradient px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            申请 API Key
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H9M17 7v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </Card>

      {/* Key 列表 */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">我的 API Key</h2>
          {hasSystemDefault && (
            <span className="text-xs text-faint">
              未选用时使用系统默认 Key
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {loading ? (
            <div className="rounded-xl border border-line bg-surface py-10 text-center text-sm text-faint">
              加载中…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="🔑"
              title="还没有添加 API Key"
              hint={
                hasSystemDefault
                  ? "当前使用系统默认 Key，添加自己的 Key 后可选用"
                  : "请在上方申请并添加一个 API Key"
              }
            />
          ) : (
            items.map((k) => (
              <Card
                key={k.id}
                className={`flex items-center justify-between p-3.5 ${
                  k.isDefault ? "border-accent/40 bg-accent-soft/40" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {k.name}
                    </span>
                    {k.isDefault && <Badge tone="accent">使用中</Badge>}
                    {k.isSystem && (
                      <Badge tone="warning">系统默认，较慢</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <code className="font-mono text-xs text-faint">
                      {k.masked}
                    </code>
                    <span className="text-xs text-faint">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!k.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => select(k.id)}
                    >
                      选用
                    </Button>
                  )}
                  {!k.isSystem && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(k.id)}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* 添加表单 */}
      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-ink">添加新 Key</h2>
        <form onSubmit={add} className="mt-4 flex flex-col gap-3">
          <Field label="名称（可选）" hint="便于区分多个 Key，如「主力」「备用」">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主力 Key"
            />
          </Field>
          <Field label="API Key" required>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="粘贴你的 Agnes API Key"
              required
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? "添加中…" : "添加"}
            </Button>
            {msg && (
              <span
                className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
