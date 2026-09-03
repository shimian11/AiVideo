import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 项目通过 proxy.ts 代理请求，上传图片以 base64 data URI 形式走 JSON 体。
  // 默认 proxy 请求体缓冲上限 10MB，图片较大时会被截断导致接口返回空 body，
  // 故按需提高上限以支持较大的图生图/图生视频输入。
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
