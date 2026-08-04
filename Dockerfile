# 依赖安装
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 构建
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# app 运行：Next.js standalone（已精简，自带最小依赖）
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# standalone 输出 + 静态资源
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma 原生引擎（standalone 已 bundle @prisma/client 的 js，但 .node 引擎需保留）
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

# Worker 编译：esbuild 把 worker.ts 及本地依赖 bundle 成单文件 js
# 这样运行时不再需要 tsx（省掉一大块 devDeps，也避开 tsx 扩展名解析问题）
FROM node:22-alpine AS worker-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .
# bundle 本地代码；@prisma/client 设为 external（其 .node 引擎不能 bundle，运行时从 node_modules 加载）
RUN npx esbuild src/worker.ts --bundle --platform=node --format=cjs --outfile=dist/worker.js --external:@prisma/client
# 去掉 devDeps（tsx/typescript/vitest/@types 等），只留生产依赖
RUN npm prune --production

# Worker 运行：编译产物 + 生产依赖（prisma CLI 仍在，供 db push 用）
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=worker-build --chown=nextjs:nodejs /app/dist/worker.js ./dist/worker.js
# worker.ts 只用到 @prisma/client；next/react/next-auth 等其他生产依赖不需要，不复制
COPY --from=worker-build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=worker-build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=worker-build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=worker-build --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
CMD ["node", "dist/worker.js"]
