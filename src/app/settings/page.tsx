"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/apikey")
      .then((r) => r.json())
      .then((d) => setHasKey(!!d.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const res = await fetch("/api/settings/apikey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setHasKey(true);
      setApiKey("");
      setMsg("已保存");
    } else {
      setMsg(data.error || "保存失败");
    }
  }

  async function remove() {
    setLoading(true);
    setMsg("");
    const res = await fetch("/api/settings/apikey", { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      setHasKey(false);
      setMsg("已删除");
    } else {
      setMsg("删除失败");
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">设置</h1>
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold">Agnes API Key</h2>
        <p className="mt-1 text-sm text-zinc-500">
          到{" "}
          <Link href="https://agnes-ai.com" target="_blank" className="text-indigo-600">
            agnes-ai.com
          </Link>{" "}
          开发者后台生成 API Key 后填入此处。Key 会加密存储，仅用于调用 Agnes 接口。
        </p>

        {hasKey === null ? (
          <div className="mt-4 text-sm text-zinc-400">加载中…</div>
        ) : hasKey ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="text-sm text-green-600">✓ 已设置 API Key</div>
            <form onSubmit={save} className="flex flex-col gap-2">
              <label className="text-sm text-zinc-600">更新 Key（留空则不更新）</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入新 Key 替换"
                className="rounded-lg border border-zinc-300 p-2.5 text-sm outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !apiKey}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={loading}
                  className="rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </form>
          </div>
        ) : (
          <form onSubmit={save} className="mt-4 flex flex-col gap-2">
            <input
              type="password"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="粘贴你的 Agnes API Key"
              className="rounded-lg border border-zinc-300 p-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "保存中…" : "保存"}
            </button>
          </form>
        )}

        {msg && <div className="mt-3 text-sm text-zinc-600">{msg}</div>}
      </section>
    </div>
  );
}
