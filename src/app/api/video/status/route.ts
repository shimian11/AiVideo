import { auth } from "@/lib/auth";
import { getDecryptedApiKey } from "@/lib/api-key";
import { getVideoResult, AgnesError } from "@/lib/agnes";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const apiKey = await getDecryptedApiKey(session.user.id);
  if (!apiKey) {
    return Response.json(
      { error: "请先在设置页填入 Agnes API Key", code: "NO_API_KEY" },
      { status: 409 },
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");
    if (!videoId) return Response.json({ error: "缺少 video_id 参数" }, { status: 400 });
    const result = await getVideoResult(videoId, apiKey);
    return Response.json(result);
  } catch (err) {
    if (err instanceof AgnesError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "查询失败" },
      { status: 500 },
    );
  }
}
