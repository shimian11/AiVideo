"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("邮箱或密码错误");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
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
      <Field label="密码" required>
        <Input
          type="password"
          required
          placeholder="密码"
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
        {loading ? "登录中…" : "登录"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="relative w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">登录</h1>
          <p className="mt-1.5 text-sm text-muted">欢迎回来，登录以继续</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)]">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          没有账号？
          <Link
            href="/register"
            className="font-medium text-accent transition hover:text-accent-strong"
          >
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
