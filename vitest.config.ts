import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * @file Vitest 配置
 * @description
 * 纯逻辑测试与组件测试共用 jsdom 环境：纯逻辑不依赖 DOM，在 jsdom 下同样可跑；
 * 组件测试需要 DOM 与 pointer 事件模拟。
 *
 * 单独配 `@` 别名是因为 Vitest 默认不读取 tsconfig 的 paths，
 * 而组件里大量使用 `@/lib/...` 形式的导入。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
