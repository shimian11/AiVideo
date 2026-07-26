import Link from "next/link";

const links = [
  { href: "/image", label: "AI 生图" },
  { href: "/video", label: "AI 生视频" },
];

export default function Nav() {
  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900">
          <span className="text-indigo-600">◆</span>
          <span>Agnes Studio</span>
        </Link>
        <div className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
