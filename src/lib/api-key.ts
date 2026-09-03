import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * 取并解密用户当前可用的 API Key。
 *
 * 容错策略：依次尝试用户的所有 Key（isDefault 优先，其余按创建时间），
 * 单条解密失败（如该密文是用旧 ENCRYPTION_KEY 加密的）时跳过继续尝试下一条，
 * 全部失败时回退系统默认（环境变量 AGNES_DEFAULT_API_KEY）。
 *
 * 本函数保证不抛异常：调用方（各 AI 路由）依赖返回 null 走 NO_API_KEY 分支，
 * 若在这里抛错会导致路由 500 且响应体为空，前端表现为
 * "Unexpected end of JSON input"。
 */
export async function getDecryptedApiKey(
  userId: string,
): Promise<string | null> {
  const records = await prisma.userApiKey.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  for (const rec of records) {
    try {
      return decrypt(rec.encryptedKey);
    } catch {
      // 密文与当前 ENCRYPTION_KEY 不匹配，跳过该条尝试下一条
    }
  }
  return process.env.AGNES_DEFAULT_API_KEY || null;
}

/** 用户是否已添加自己的 API Key（不计系统默认） */
export async function hasApiKey(userId: string): Promise<boolean> {
  const count = await prisma.userApiKey.count({ where: { userId } });
  return count > 0;
}
