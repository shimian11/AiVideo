import { getVideoResult, AgnesError } from "@/lib/agnes";

// 轮询视频任务状态: GET /api/video/status?video_id=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");
    if (!videoId) {
      return Response.json({ error: "缺少 video_id 参数" }, { status: 400 });
    }
    const result = await getVideoResult(videoId);
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
