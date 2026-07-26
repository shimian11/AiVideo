import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-zinc-900">Agnes Studio</h1>
        <p className="mt-3 text-zinc-500">基于 Agnes AI 的图片与视频生成平台</p>
        <p className="mt-1 text-xs text-zinc-400">
          文生图 · 图生图 · 文生视频 · 图生视频 · 关键帧动画
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        <Card
          href="/image"
          icon="🖼"
          title="AI 生成图片"
          desc="文生图与图生图，支持 1K-4K 尺寸与多种宽高比"
        />
        <Card
          href="/video"
          icon="🎬"
          title="AI 生成视频"
          desc="文生视频、图生视频、关键帧动画，异步生成"
        />
      </div>
    </div>
  );
}

function Card({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-md"
    >
      <div className="text-3xl">{icon}</div>
      <h2 className="mt-3 text-lg font-semibold text-zinc-900 transition group-hover:text-indigo-600">
        {title}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">{desc}</p>
    </Link>
  );
}
