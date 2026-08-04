/**
 * Next.js 启动 hook。
 * 按 runtime 分流:只在 Node.js runtime 加载隧道逻辑（Edge 不支持 node:fs 等）。
 * 隧道实现在 instrumentation-node.ts。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
