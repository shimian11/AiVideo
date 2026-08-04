/**
 * @file 顶部导航栏组件
 * @description
 * 全局导航栏，展示在所有页面顶部。包含：
 * - 站点 Logo（点击回首页）
 * - 主导航链接（我的剧集、AI 生图、AI 生视频、历史）
 * - 用户区：已登录显示邮箱 + 登出按钮；未登录显示登录入口
 *
 * 该组件为 Server Component，在服务端通过 auth() 获取登录态后渲染。
 */

import Link from "next/link";
import { auth } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

/** 主导航链接配置 */
const links = [
  { href: "/dashboard", label: "我的剧集" },
  { href: "/jobs", label: "任务" },
  { href: "/image", label: "AI 生图" },
  { href: "/video", label: "AI 生视频" },
  { href: "/history", label: "历史" },
];

/**
 * 顶部导航栏组件。
 *
 * 服务端组件，通过 auth() 读取当前会话，据此决定显示用户信息或登录入口。
 */
export default async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-zinc-900">
          <span className="text-indigo-600">🎬</span>
          <span>短剧工坊</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
          {/* 用户区：已登录显示邮箱与登出按钮，未登录显示登录入口 */}
          {user ? (
            <div className="flex items-center gap-2 pl-2">
              <span className="text-sm text-zinc-500">{user.email}</span>
              <LogoutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-200"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
