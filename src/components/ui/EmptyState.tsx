/**
 * @file 空态组件
 * @description 统一的空数据状态：图标 + 标题 + 提示 + 可选操作按钮。
 */

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-16 text-center">
      {icon && <div className="text-3xl opacity-50">{icon}</div>}
      <p className="mt-3 text-sm font-medium text-muted">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-faint">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
