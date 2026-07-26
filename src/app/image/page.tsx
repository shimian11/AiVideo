import ImageStudio from "@/components/ImageStudio";

export const metadata = {
  title: "AI 生图 · Agnes",
};

export default function ImagePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">AI 生成图片</h1>
        <p className="mt-1 text-sm text-zinc-500">
          基于 Agnes Image 2.1 Flash，支持文生图与图生图。可点击「优化提示词」自动扩写，优化结果会保持你输入的语言（中文输入→中文，英文输入→英文）。
        </p>
      </header>
      <ImageStudio />
    </div>
  );
}
