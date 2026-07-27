import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// middleware 默认 Edge 运行时无法用 @node-rs/argon2 等原生模块，改用 Node.js 运行时
export const runtime = "nodejs";

const PROTECTED = ["/image", "/video", "/history", "/settings"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtected && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
