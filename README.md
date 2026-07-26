# Agnes Studio · AI 图片与视频生成平台

基于 [Agnes AI](https://agnes-ai.com) API 的 AI 生图 + AI 生视频平台，使用 Next.js 16 (App Router) + TypeScript + Tailwind CSS 构建。

## 功能

- **AI 生图**（Agnes Image 2.1 Flash）：文生图、图生图，支持 1K–4K 尺寸与多种宽高比
- **AI 生视频**（Agnes Video V2.0）：文生视频、图生视频、关键帧动画，异步生成 + 进度轮询
- **提示词优化**（Agnes 2.0 Flash）：一键把简短描述扩写为结构化提示词，并保持输入语言（中文输入输出中文，英文输入输出英文）
- **浏览器下载**：生成结果先用 Agnes 返回的 URL 直接展示，点击「下载」时由后端代理抓取并以附件形式触发浏览器原生下载（不在服务端保存文件）

## 前置条件

- Node.js 18+（本项目使用 Node 22）
- 一个 Agnes AI API Key（在 https://agnes-ai.com 开发者后台生成）

## 配置

编辑项目根目录的 `.env.local`，把 `your_key_here` 替换为你的真实 API Key：

```env
AGNES_API_KEY=你的真实Key
AGNES_BASE_URL=https://apihub.agnes-ai.com
```

> API Key 仅在服务端 Route Handler 中使用，不会进入前端代码包。
> 注意：Next.js 只在启动时读取 `.env.local`，修改后需重启 `npm run dev` 才生效。

## 运行

```bash
npm install        # 首次安装依赖
npm run dev        # 开发模式，访问 http://localhost:3000
npm run build      # 生产构建
npm run start      # 生产模式运行
```

## 架构

```
前端 (React 客户端组件)
   │  fetch
   ▼
Route Handlers (src/app/api/*)  -- 服务端代理，持有 API Key
   │
   ▼
Agnes API (https://apihub.agnes-ai.com)
```

- **图片生成**：同步调用 `/v1/images/generations`，返回 URL 直接展示
- **视频生成**：异步--先 `POST /v1/videos` 创建任务拿到 `video_id`，再轮询 `GET /agnesapi?video_id=` 直到 `completed`，视频 URL 在**顶层 `url` 字段**（注意：Agnes 文档写的是 `metadata.url`，但实际接口返回在顶层）。`video_id` 存 localStorage，刷新页面可恢复轮询
- **下载**：`GET /api/download?url=...&type=...&name=...` 抓取 Agnes 媒体 URL，校验域名白名单（防 SSRF），加 `Content-Disposition: attachment` 流式返回给浏览器触发下载。用后端代理是因为 Agnes 媒体域名跨域，浏览器 `<a download>` 无法强制下载

## 目录结构

```
src/
  app/
    api/
      image/generate/route.ts    图片生成
      video/create/route.ts      创建视频任务
      video/status/route.ts      轮询视频状态
      prompt/enhance/route.ts    提示词优化
      download/route.ts          代理下载（触发浏览器下载）
    image/page.tsx               图片工作台
    video/page.tsx               视频工作台
    page.tsx                     首页
  components/
    Nav.tsx / ImageStudio.tsx / VideoStudio.tsx
  lib/
    agnes.ts        Agnes 客户端封装（chat/image/video + SSRF 白名单）
    constants.ts    尺寸/比例/帧数预设
    client-utils.ts 浏览器端工具（下载触发、文件转 dataURI）
```

## 接入要点（来自 Agnes 文档，已处理）

- 图片 `response_format` 必须放在 `extra_body` 内，不能放请求体顶层
- 图生图用 `extra_body.image` 数组传输入图，**不需要**传 `tags`
- 视频 `num_frames` 必须 `≤ 441` 且满足 `8n+1`（前端时长预设已自动满足）
- 视频结果 URL 在顶层 `url` 字段，不是文档写的 `metadata.url`
- 免费用户限流 RPM 20，高频需升级 Token Plan
- 图片尺寸须为 16 倍数、视频尺寸须为 64 倍数（用档位/预设自动满足，不匹配时 API 会自动映射到最近标准档位）

## 定价（当前）

Agnes 三个模型目前均为免费推广期：文本 $0/1M tokens、图片 $0/张、视频 $0/秒。
