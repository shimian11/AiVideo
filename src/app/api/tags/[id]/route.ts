import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 删除标签（级联解除关联）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.tag.deleteMany({ where: { id, userId: session.user.id } });
  return Response.json({ ok: true });
}
