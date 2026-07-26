import { describe, it, expect } from "vitest";
import { registerSchema } from "./validations";

describe("registerSchema", () => {
  it("接受合法邮箱与 ≥8 位密码", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "12345678" });
    expect(r.success).toBe(true);
  });

  it("拒绝非法邮箱", () => {
    const r = registerSchema.safeParse({ email: "not-email", password: "12345678" });
    expect(r.success).toBe(false);
  });

  it("拒绝短于 8 位的密码", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "123" });
    expect(r.success).toBe(false);
  });

  it("name 为可选", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "12345678" });
    expect(r.success).toBe(true);
  });
});
