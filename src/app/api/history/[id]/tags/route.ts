import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 设置某条历史的标签（整体替换）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const { tagIds } = (await req.json().catch(() => ({}))) as { tagIds?: string[] };
  if (!Array.isArray(tagIds)) {
    return Response.json({ error: "tagIds 必须为数组" }, { status: 400 });
  }

  const item = await prisma.generationHistory.findUnique({ where: { id } });
  if (!item || item.userId !== session.user.id) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }

  // 仅允许关联属于自己的标签
  const validTags = await prisma.tag.findMany({
    where: { id: { in: tagIds }, userId: session.user.id },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.tagOnHistory.deleteMany({ where: { historyId: id } }),
    prisma.tagOnHistory.createMany({
      data: validTags.map((t) => ({ historyId: id, tagId: t.id })),
      skipDuplicates: true,
    }),
  ]);

  return Response.json({ ok: true });
}
