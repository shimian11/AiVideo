import crypto from "crypto";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY 未配置");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY 必须为 32 字节（base64 编码）");
  return buf;
}

/** AES-256-GCM 加密，输出 iv.ciphertext.authTag（各段 base64） */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, ciphertext, authTag].map((b) => b.toString("base64")).join(".");
}

/** 解密 encrypt() 的输出 */
export function decrypt(packed: string): string {
  const parts = packed.split(".");
  if (parts.length !== 3) throw new Error("密文格式错误");
  const [ivB64, ctB64, tagB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const ct = Buffer.from(ctB64, "base64");
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}
