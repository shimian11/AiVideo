/**
 * Node.js runtime 专用:本地开发时自动建 SSH 隧道连服务器数据库。
 * Prisma 连 127.0.0.1:15432(见 .env 的 DATABASE_URL)即等于连服务器 db。
 *
 * 生产环境(NODE_ENV=production)跳过--生产容器通过 docker 网络直连 db:5432。
 * 机制类似 wheretogo 的 SshConfig.java(Spring @PostConstruct 建 SSH 隧道)。
 */
import { createTunnel } from "tunnel-ssh";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (
  process.env.NODE_ENV !== "production" &&
  process.env.AIVIDEO_DEV_TUNNEL !== "false"
) {
  createTunnel(
    { autoClose: false, reconnectOnError: false },
    { host: "127.0.0.1", port: 15432 },
    {
      host: "20.222.19.189",
      port: 22,
      username: "azureuser",
      privateKey: fs.readFileSync(path.join(os.homedir(), ".ssh", "banma_Azure")),
    },
    { srcAddr: "127.0.0.1", srcPort: 15432, dstAddr: "127.0.0.1", dstPort: 5432 },
  )
    .then(() =>
      console.log("[dev 隧道] 已建立: 127.0.0.1:15432 -> 20.222.19.189:5432"),
    )
    .catch((e) =>
      console.error("[dev 隧道] 建立失败:", e instanceof Error ? e.message : e),
    );
}
