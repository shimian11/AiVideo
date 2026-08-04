/**
 * @file 卡片组件
 * @description 细边框 + 微阴影的浅色卡片。CardLink 用于可点击的卡片入口，
 * hover 时边框转 accent 色并浮起一丝阴影。
 */

import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface transition-all duration-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-xl border border-line bg-surface transition-all duration-200 hover:border-accent/40 hover:shadow-[0_4px_20px_-6px_rgba(99,102,241,0.18)] ${className}`}
    >
      {children}
    </Link>
  );
}
