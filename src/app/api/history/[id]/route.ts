import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 删除一条历史（级联解除标签关联）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const item = await prisma.generationHistory.findUnique({ where: { id } });
  if (!item || item.userId !== session.user.id) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }
  await prisma.generationHistory.delete({ where: { id } });
  return Response.json({ ok: true });
}
