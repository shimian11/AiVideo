/**
 * @file 徽标组件
 * @description 状态/标签徽标，pill 圆角，多色调。
 */

import type { ReactNode } from "react";

type Tone = "default" | "accent" | "success" | "danger" | "warning";

const toneCls: Record<Tone, string> = {
  default: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-green-50 text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-amber-50 text-amber-600",
};

export function Badge({
  tone = "default",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneCls[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
