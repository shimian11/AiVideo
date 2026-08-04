import { NextResponse } from "next/server";
import { hash } from "@node-rs/argon2";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { registerSchema } from "@/lib/validations";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const passwordHash = await hash(password);
  const defaultKey = process.env.AGNES_DEFAULT_API_KEY;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, name } });
    // 新用户自动配备系统默认 API Key（值来自环境变量 AGNES_DEFAULT_API_KEY），
    // 标记 isSystem，前端提示「系统默认，较慢」，用户可添加自己的 Key 选用替代。
    if (defaultKey) {
      await tx.userApiKey.create({
        data: {
          userId: user.id,
          name: "系统默认",
          encryptedKey: encrypt(defaultKey),
          isDefault: true,
          isSystem: true,
        },
      });
    }
  });
  return NextResponse.json({ ok: true });
}
