import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 列出我的标签
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const tags = await prisma.tag.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });
  return Response.json({ tags });
}

// 建标签
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "请输入标签名" }, { status: 400 });
  }
  try {
    const tag = await prisma.tag.create({
      data: { userId: session.user.id, name: name.trim() },
    });
    return Response.json({ tag });
  } catch {
    return Response.json({ error: "标签已存在或创建失败" }, { status: 409 });
  }
}
