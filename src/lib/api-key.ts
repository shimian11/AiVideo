import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * 取并解密用户当前选用的 API Key。
 * 优先取 isDefault=true 的 key；用户未选用或无 key 时 fallback 到系统默认
 * （环境变量 AGNES_DEFAULT_API_KEY）；都没有返回 null。
 */
export async function getDecryptedApiKey(
  userId: string,
): Promise<string | null> {
  const rec = await prisma.userApiKey.findFirst({
    where: { userId, isDefault: true },
  });
  if (rec) return decrypt(rec.encryptedKey);
  return process.env.AGNES_DEFAULT_API_KEY || null;
}

/** 用户是否已添加自己的 API Key（不计系统默认） */
export async function hasApiKey(userId: string): Promise<boolean> {
  const count = await prisma.userApiKey.count({ where: { userId } });
  return count > 0;
}
