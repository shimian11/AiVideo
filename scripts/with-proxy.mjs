/**
 * 本地开发代理启动器：让被包裹命令里的服务端 fetch 走本地代理访问 Agnes API。
 *
 * 为什么需要：
 *   Node.js 原生 fetch（undici）不读系统代理，且 NODE_USE_ENV_PROXY 必须在
 *   进程启动前就在 OS 环境里（--env-file / 运行时 process.env 赋值都太晚）。
 *   所以本地 `next dev` 直连 apihub.agnes-ai.com 会超时 -> "fetch failed"。
 *
 * 本脚本 spawn 子进程并把代理变量作为 OS env 传入，子进程启动时即生效。
 * 生产环境（Azure 海外）能直连 Agnes，不需要本脚本，Docker 也不跑 dev 脚本。
 *
 * 用法：
 *   npm run dev:proxy            # next dev 走代理
 *   npm run worker:proxy         # 视频轮询 worker 走代理
 *   DEV_PROXY_URL=http://127.0.0.1:7890 npm run dev:proxy   # 改代理端口
 */
import { spawn } from "node:child_process";

const proxy = process.env.DEV_PROXY_URL || "http://127.0.0.1:7897";
const cmd = process.argv.slice(2);
if (cmd.length === 0) {
  console.error("用法: node scripts/with-proxy.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(cmd[0], cmd.slice(1), {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_USE_ENV_PROXY: "1",
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
