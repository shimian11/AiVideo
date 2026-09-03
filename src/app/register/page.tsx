"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "注册失败");
      setLoading(false);
      return;
    }
    const sign = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (sign?.error) {
      setError("注册成功，但自动登录失败，请手动登录");
      return;
    }
    // 整页跳转，避免路由缓存中未登录时的预取重定向把用户拉回登录页
    window.location.assign("/");
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="relative w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">注册</h1>
          <p className="mt-1.5 text-sm text-muted">创建账号，开始创作</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)]">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="邮箱" required>
              <Input
                type="email"
                required
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="密码" required hint="至少 8 位">
              <Input
                type="password"
                required
                minLength={8}
                placeholder="密码（至少 8 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "注册中…" : "注册"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          已有账号？
          <Link
            href="/login"
            className="font-medium text-accent transition hover:text-accent-strong"
          >
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
