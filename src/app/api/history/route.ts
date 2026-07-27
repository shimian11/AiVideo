import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 列出当前用户的历史（含标签）
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const items = await prisma.generationHistory.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } } },
  });
  return Response.json({ items });
}
