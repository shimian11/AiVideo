/**
 * @file 请求代理（Proxy，原 middleware）
 * @description
 * Next.js 16 把 middleware 改名为 proxy。本文件负责在请求到达页面之前做登录态校验：
 * 对受保护路径检查 req.auth，未登录则重定向到 /login 并带上 callbackUrl 以便登录后回跳。
 *
 * matcher 排除了静态资源与 auth 相关接口，避免拦截 NextAuth 的登录回调。
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Next.js 16 把 middleware 改名为 proxy。
/** 受保护路径前缀：这些路径及其子路径均需登录后才能访问 */
const PROTECTED = [
  "/dashboard",
  "/series",
  "/episodes",
  "/image",
  "/video",
  "/history",
  "/settings",
  "/jobs",
];

/**
 * 请求代理主函数。
 *
 * 判断当前请求路径是否属于受保护路径，若是且用户未登录，
 * 则重定向到登录页并附带原始路径作为 callbackUrl，以便登录成功后回跳。
 *
 * @param req - 当前请求对象（含已解析的 auth 信息）
 * @returns 重定向响应或放行响应
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  // 首页重定向到仪表盘。在 proxy 层用 req.url 构造，避免 standalone 部署下
  // next/navigation 的 redirect() 生成 localhost 绝对 URL 导致浏览器跳到本机。
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // 判断是否命中受保护路径（精确匹配或前缀匹配）
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtected && !req.auth) {
    // 未登录访问受保护路径：重定向到登录页，记录原始路径用于登录后回跳
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

/**
 * 匹配器配置：排除静态资源与 auth 接口，只对页面路径执行代理逻辑。
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
