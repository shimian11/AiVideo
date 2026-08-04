/**
 * @file 用户菜单（气泡弹窗）
 * @description
 * 右上角邮箱区域的下拉气泡。hover 或点击触发器显示，展示用户身份与功能入口
 * （我的剧集、API 管理、退出登录）。点击外部或 ESC 关闭。
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function UserMenu({
  email,
  name,
}: {
  email: string;
  name?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name?.[0] || email[0] || "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition hover:bg-surface-2"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full accent-gradient text-xs font-semibold text-white shadow-sm shadow-accent/30">
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate text-sm text-muted sm:inline">
          {email}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-line p-1.5 shadow-xl shadow-ink/10 animate-fade-in glass">
          {/* 身份区 */}
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full accent-gradient text-sm font-semibold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {name || "未设置昵称"}
              </p>
              <p className="truncate text-xs text-faint">{email}</p>
            </div>
          </div>

          <div className="my-1 border-t border-line" />

          <MenuItem href="/dashboard" label="我的剧集">
            <Icon path="M3 4.5h18M3 10h18M3 15.5h18M3 21h18" />
          </MenuItem>
          <MenuItem href="/settings" label="API 管理">
            <Icon path="M12 15a3 3 0 100-6 3 3 0 000 6zm7-3a7 7 0 00-.5-2.6l2-1.5-2-3.4-2.3 1a7 7 0 00-4.5-2.6L11 0H9l-.7 2.3a7 7 0 00-4.5 2.6l-2.3-1-2 3.4 2 1.5A7 7 0 003 12c0 .9.2 1.8.5 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 004.5 2.6L9 24h2l.7-2.3a7 7 0 004.5-2.6l2.3 1 2-3.4-2-1.5c.3-.8.5-1.7.5-2.6z" />
          </MenuItem>

          <div className="my-1 border-t border-line" />

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-danger-soft hover:text-danger"
          >
            <Icon path="M16 17l5-5-5-5M21 12H9M13 4H5a2 2 0 00-2 2v12a2 2 0 002 2h8" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      <span className="text-faint">{children}</span>
      {label}
    </Link>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}
