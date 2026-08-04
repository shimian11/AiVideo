/**
 * @file API Key 管理接口（多 Key）
 * @description
 * /api/settings/apikey：
 * - GET：列出当前用户所有 Key（脱敏）+ 是否存在系统默认 Key
 * - POST：添加新 Key { name, apiKey }；首个 Key 自动设为选用
 * - PATCH：选用某个 Key { id }（事务清其他 isDefault）
 * - DELETE：删除某个 Key ?id=xxx；删的是选用项时自动转移选用到最早的一条
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

/** 脱敏：保留前 4 与后 4，中间用 • 代替 */
function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(Math.max(key.length, 4));
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const items = await prisma.userApiKey.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    items: items.map((it) => {
      let masked = "••••";
      try {
        masked = maskKey(decrypt(it.encryptedKey));
      } catch {
        masked = "••••";
      }
      return {
        id: it.id,
        name: it.name,
        isDefault: it.isDefault,
        isSystem: it.isSystem,
        createdAt: it.createdAt,
        masked,
      };
    }),
    hasSystemDefault: !!process.env.AGNES_DEFAULT_API_KEY,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { name, apiKey } = (await req.json().catch(() => ({}))) as {
    name?: string;
    apiKey?: string;
  };
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ error: "请输入 API Key" }, { status: 400 });
  }
  const userId = session.user.id;
  const count = await prisma.userApiKey.count({ where: { userId } });
  const created = await prisma.userApiKey.create({
    data: {
      userId,
      name: name?.trim() || `Key ${count + 1}`,
      encryptedKey: encrypt(apiKey.trim()),
      isDefault: count === 0,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const userId = session.user.id;
  const rec = await prisma.userApiKey.findFirst({ where: { id, userId } });
  if (!rec) return NextResponse.json({ error: "Key 不存在" }, { status: 404 });
  await prisma.$transaction([
    prisma.userApiKey.updateMany({
      where: { userId },
      data: { isDefault: false },
    }),
    prisma.userApiKey.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const userId = session.user.id;
  const rec = await prisma.userApiKey.findFirst({ where: { id, userId } });
  if (!rec) return NextResponse.json({ error: "Key 不存在" }, { status: 404 });
  if (rec.isSystem) {
    return NextResponse.json({ error: "系统默认 Key 不可删除" }, { status: 400 });
  }
  const wasDefault = rec.isDefault;
  await prisma.userApiKey.delete({ where: { id } });
  // 删除的是选用项时，自动把最早的一条设为选用
  if (wasDefault) {
    const next = await prisma.userApiKey.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.userApiKey.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
