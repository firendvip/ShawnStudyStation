#!/usr/bin/env bash
# ===========================================================================
# 小善学习站 — 便捷部署脚本
# 用法: cd deploy && ./deploy.sh
# 作用: 拉取基础镜像(失败不致命)→ 构建并后台启动 → 显示状态
# ===========================================================================
set -euo pipefail

# 切换到脚本所在目录(即 deploy/),保证相对路径与 compose 上下文正确
cd "$(dirname "$0")"

# 前置检查:必须存在 .env
if [ ! -f .env ]; then
  echo "[deploy] 缺少 .env,请先执行: cp .env.example .env 并填写配置" >&2
  exit 1
fi

# 前置检查:必须存在证书
if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
  echo "[deploy] 缺少 TLS 证书 certs/fullchain.pem 或 certs/privkey.pem(见 certs/README.md)" >&2
  exit 1
fi

echo "[deploy] 拉取基础镜像(postgres / nginx,失败不影响后续构建)..."
docker compose pull || true

echo "[deploy] 构建并启动所有服务..."
docker compose up -d --build

echo "[deploy] 当前服务状态:"
docker compose ps
