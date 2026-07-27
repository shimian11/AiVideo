"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        placeholder="邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-zinc-300 p-2.5 text-sm outline-none focus:border-indigo-500"
      />
      <input
        type="password"
        required
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-zinc-300 p-2.5 text-sm outline-none focus:border-indigo-500"
      />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">登录</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="text-sm text-zinc-500">
        没有账号？
        <Link href="/register" className="text-indigo-600">
          注册
        </Link>
      </p>
    </div>
  );
}
