import VideoStudio from "@/components/VideoStudio";

export const metadata = {
  title: "AI 生视频 · Agnes",
};

export default function VideoPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">AI 生成视频</h1>
        <p className="mt-1 text-sm text-zinc-500">
          基于 Agnes Video V2.0，支持文生视频、图生视频与关键帧动画。视频为异步生成，提交后请耐心等待轮询完成。
        </p>
      </header>
      <VideoStudio />
    </div>
  );
}
