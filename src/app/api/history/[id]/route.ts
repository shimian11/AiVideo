import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** 获取单条历史详情（含标签、结果 URL） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const item = await prisma.generationHistory.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!item || item.userId !== session.user.id) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }
  return Response.json(item);
}

/** 更新历史（视频生成完成后回填 resultUrl 等） */
export async function PATCH(
  req: Request,
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
  const body = (await req.json().catch(() => ({}))) as { resultUrl?: string };
  const data: Record<string, unknown> = {};
  if (typeof body.resultUrl === "string") {
    data.resultUrl = body.resultUrl.trim() || null;
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "无更新字段" }, { status: 400 });
  }
  const updated = await prisma.generationHistory.update({
    where: { id },
    data,
  });
  return Response.json(updated);
}

/** 删除一条历史（级联解除标签关联） */
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
