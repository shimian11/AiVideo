/**
 * @file 按钮组件
 * @description 浅色科技风按钮，支持 primary/ghost/outline/danger 变体。
 * 微动效：hover 色变 + active 轻微缩放，模拟物理按压。
 */

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variantCls: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong shadow-sm shadow-accent/20",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  outline: "border border-line text-ink hover:border-line-strong hover:bg-surface-2",
  danger: "border border-danger/30 text-danger hover:bg-danger-soft",
};

const sizeCls: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1",
  md: "px-4 py-2 text-sm gap-1.5",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...props}
    />
  );
}
