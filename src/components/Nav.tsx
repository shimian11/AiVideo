/**
 * @file 顶部导航栏组件
 * @description
 * 全局玻璃毛玻璃导航栏（sticky）。包含站点 Logo、主导航链接、用户菜单。
 * Server Component，通过 auth() 获取登录态后渲染；用户气泡交互由 UserMenu（client）承担。
 */

import Link from "next/link";
import { auth } from "@/lib/auth";
import { UserMenu } from "./UserMenu";

/** 主导航链接配置 */
const links = [
  { href: "/dashboard", label: "我的剧集" },
  { href: "/jobs", label: "任务" },
  { href: "/image", label: "AI 生图" },
  { href: "/video", label: "AI 生视频" },
  { href: "/history", label: "历史" },
];

export default async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <nav className="sticky top-0 z-40 border-b border-line glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-bold text-ink"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg accent-gradient text-white shadow-sm shadow-accent/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2l2.4 5 5.6.8-4 4 1 5.6L12 14.8 7 17.4l1-5.6-4-4 5.6-.8L12 2z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-[15px]">短剧工坊</span>
        </Link>

        <div className="flex items-center gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
          <div className="mx-1 h-5 w-px bg-line" />
          {user ? (
            <UserMenu email={user.email ?? ""} name={user.name} />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-accent-strong"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
