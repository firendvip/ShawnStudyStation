# ---------------------------------------------------------------------------
# PinPin (错字练习) — Next.js 16 + React 19 + Prisma(SQLite)
# 在 Nginx 的 /pinpin/ 子路径下提供服务,因此构建时必须把 basePath 烤进产物。
#
# 说明:此 Next.js 未启用 output:'standalone',且 pdfkit 需在运行时读取
# node_modules 内的字体文件,故保留完整依赖并用 `next start` 启动,最稳妥。
# ---------------------------------------------------------------------------
FROM node:20-alpine

ENV NODE_ENV=production

# 子路径前缀必须在 `next build` 之前进入环境,才能被烤进静态资源路径。
# next.config.ts 读取 process.env.BASE_PATH;为空则不启用(保持本地开发原样)。
ARG BASE_PATH=/pinpin
ENV BASE_PATH=${BASE_PATH}

# 服务端 PDF 报告需要中文字体(pdfkit)。安装 Noto CJK 字体。
# 默认 PDF_FONT_PATH 指向该字体;如代码使用其他路径,可在 compose 覆盖。
RUN apk add --no-cache font-noto-cjk
ENV PDF_FONT_PATH=/usr/share/fonts/noto/NotoSansCJK-Regular.ttc

WORKDIR /app

# 利用层缓存:先装依赖。存在 package-lock.json → 用 npm ci。
# 这里需要 devDependencies(prisma CLI、typescript、eslint-config-next 等)
# 来执行 prisma generate 与 next build,故不加 --omit=dev。
COPY package.json package-lock.json ./
RUN npm ci

# 拷贝源码(.dockerignore 已排除 node_modules / .next / .env / 本地 db)
COPY . .

# 生成 Prisma Client(无 postinstall 脚本,需显式执行)。
RUN npx prisma generate

# 以 /pinpin 为 basePath 进行生产构建。
RUN npm run build

# 运行时 SQLite 数据库放在挂载卷 /data 上,需保证 node 用户可写。
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# 仅内部网络暴露;Nginx 通过 pinpin:3000 反向代理。
EXPOSE 3000

# 启动:先对挂载卷上的 SQLite 执行迁移(migrate deploy 仅应用已存在迁移,
# 会按需创建/更新数据库文件),再启动 Next。
# DATABASE_URL 由 compose 注入为 file:/data/pinpin.db。
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
