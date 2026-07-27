import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/** 取并解密用户的 Agnes API Key；未设置返回 null */
export async function getDecryptedApiKey(userId: string): Promise<string | null> {
  const rec = await prisma.userApiKey.findUnique({ where: { userId } });
  if (!rec) return null;
  return decrypt(rec.encryptedKey);
}

/** 是否已设置 Key */
export async function hasApiKey(userId: string): Promise<boolean> {
  const rec = await prisma.userApiKey.findUnique({ where: { userId } });
  return !!rec;
}
