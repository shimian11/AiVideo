import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/crypto";

// 查询是否已设置（不返回 Key 本身）
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const rec = await prisma.userApiKey.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ hasKey: !!rec });
}

// 保存（加密后 upsert）
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { apiKey } = (await req.json().catch(() => ({}))) as { apiKey?: string };
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "请输入 API Key" }, { status: 400 });
  }
  const encryptedKey = encrypt(apiKey.trim());
  await prisma.userApiKey.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, encryptedKey },
    update: { encryptedKey },
  });
  return NextResponse.json({ ok: true });
}

// 删除
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  await prisma.userApiKey.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
