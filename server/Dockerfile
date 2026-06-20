# ---------------------------------------------------------------------------
# 小善学习站 — 账号后端 (Node + Express + PostgreSQL)
# 单阶段镜像即可:运行时需要完整依赖(pg / tencentcloud-sdk 等),
# 没有需要剥离的构建产物。
# ---------------------------------------------------------------------------
FROM node:20-alpine

# 生产环境默认值(compose 仍会注入 NODE_ENV=production)
ENV NODE_ENV=production

WORKDIR /app

# 先只拷贝依赖清单,利用 Docker 层缓存:源码变动时不必重装依赖。
# 存在 package-lock.json,使用 npm ci 保证可复现安装;--omit=dev 跳过开发依赖。
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 拷贝应用源码(.dockerignore 已排除 node_modules / .env / 本地数据 / 日志)
COPY . .

# 使用基础镜像自带的非 root 用户 node 运行,降低容器逃逸风险。
# 确保工作目录属主正确(便于写入日志等)。
RUN chown -R node:node /app
USER node

# 仅在内部网络暴露,Nginx 通过服务名 backend:4000 访问。
EXPOSE 4000

# 启动流程:先执行幂等迁移(应用 schema.sql),再启动服务。
# 任一步骤失败都会让容器退出,便于 compose 重启策略介入。
CMD ["sh", "-c", "node src/migrate.js && node src/index.js"]
