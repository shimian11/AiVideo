import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "./crypto";

beforeAll(() => {
  // 测试用 32 字节 key（base64）
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
});

describe("crypto", () => {
  it("encrypt/decrypt 往返", () => {
    const enc = encrypt("sk-test-key-123");
    expect(decrypt(enc)).toBe("sk-test-key-123");
  });

  it("每次加密 IV 不同，密文不同", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("篡改密文解密失败", () => {
    const enc = encrypt("secret");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("错误 key 解密失败", () => {
    const enc = encrypt("secret");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    expect(() => decrypt(enc)).toThrow();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  });
});
