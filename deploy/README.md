# 小善学习站 — 部署手册(腾讯云 CVM + 已备案域名 + HTTPS)

本目录提供一套完整的 Docker Compose 容器化部署方案。四个服务:

| 服务 | 容器名 | 说明 | 对外端口 |
|------|--------|------|----------|
| postgres | `xss-postgres` | 后端账号数据库 | 无(仅内网) |
| backend  | `xss-backend`  | Node + Express 账号后端,`/api` | 无(仅内网) |
| pinpin   | `xss-pinpin`   | 错字练习 Next.js,挂载在 `/pinpin/` | 无(仅内网) |
| web      | `xss-web`      | Nginx:TLS + 反代 + 静态托管 | 80 / 443 |

访问路径(经 Nginx):
- 主站:`https://你的域名/`
- 账号 API:`https://你的域名/api/...`(健康检查 `/api/health`)
- 错字练习:`https://你的域名/pinpin/`
- 自然拼读:`https://你的域名/apps/phonics/小善自拼闪卡_v10.html`

---

## 1. 前置条件

- 一台腾讯云 CVM,建议 **Ubuntu 22.04** 或 TencentOS Server。
- 域名**已完成 ICP 备案**,并把 **A 记录解析到 CVM 公网 IP**。
- 安全组放行入站 **80 / 443**(SSH 22 按需)。
- CVM 配置建议至少 2 核 4G(Next.js 构建较吃内存;若内存紧张可加 swap)。

---

## 2. 安装 Docker Engine + Compose 插件(Ubuntu 官方源)

```bash
# 卸载可能存在的旧版本
sudo apt-get remove -y docker docker-engine docker.io containerd runc || true

# 安装依赖并添加 Docker 官方 GPG / 源
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Engine + CLI + Compose 插件
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 验证
sudo docker --version
sudo docker compose version
```

> 国内 CVM 拉取 Docker Hub 较慢时,可在 `/etc/docker/daemon.json` 配置腾讯云镜像加速器后 `sudo systemctl restart docker`。

---

## 3. 上传 / 克隆项目到服务器

```bash
# 方式 A:git 克隆(若已托管到仓库)
git clone <你的仓库地址> ShawnStudyStation

# 方式 B:从本地用 scp 整目录上传
# scp -r "ShawnStudyStation" ubuntu@<CVM公网IP>:~/
```

确保上传后目录结构包含:`index.html`、`assets/`、`server/`、`vendor/PinPin/`、`vendor/phonics-flashcards/`、`deploy/`。

---

## 4. 准备环境变量

```bash
cd ShawnStudyStation/deploy
cp .env.example .env
```

编辑 `.env`,填写:

- `DOMAIN` —— 你的域名(不带协议,如 `study.example.com`)。
- `POSTGRES_PASSWORD` —— 强随机:`openssl rand -hex 32`
- `JWT_SECRET` —— 强随机:`openssl rand -hex 32`
- `SMTP_*` —— 按 `../docs/邮箱验证码配置指引.md` 收集:
  `SMTP_HOST` / `SMTP_PORT`(默认 465)/ `SMTP_SECURE`(默认 true)/
  `SMTP_USER` / `SMTP_PASS`(授权码 / 应用专用密码)/ `SMTP_FROM`(发件人,需与 `SMTP_USER` 同邮箱)。
- `EMAIL_DEV_MODE=false`(生产走真实邮箱验证码)。

---

## 5. 申请并放置 SSL 证书 + 改 Nginx 域名

1. 按 `deploy/certs/README.md` 申请证书,把 `fullchain.pem` 与 `privkey.pem` 放进 `deploy/certs/`。
2. **编辑 Nginx 域名**:打开 `deploy/nginx/conf.d/default.conf`,找到 443 server 块里标注
   `# TODO:` 的 `server_name _;`,改成 `server_name 你的域名;`(可选,但建议)。
   保持 `_` 也能工作(接受任意 Host,依赖证书匹配)。

---

## 6. 启动

```bash
# 在 deploy/ 目录下
docker compose up -d --build

# 或使用便捷脚本(会先检查 .env 与证书是否就位)
./deploy.sh
```

首次执行会:构建后端 / PinPin 镜像 → 起 Postgres 并等待健康 → 后端自动迁移建表 →
PinPin 自动 `prisma migrate deploy` 建/更 SQLite → 启动 Nginx。
(PinPin 镜像构建包含 `next build`,耗时较长属正常。)

---

## 7. 验证

```bash
# 健康检查应返回 {"ok":true}
curl https://你的域名/api/health
```

浏览器打开 `https://你的域名`,依次验证:
- 注册(会收到**真实短信**验证码)/ 登录 / 退出
- 错字练习(`/pinpin/`)可正常打开与作答
- 自然拼读(`/apps/phonics/...`)可发音(音频已内联)

---

## 8. 运维

```bash
# 查看日志
docker compose logs -f backend
docker compose logs -f pinpin
docker compose logs -f web

# 数据库备份(建议配 cron 定时)
docker exec xss-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
# 示例 cron(每天 03:00 备份;变量取自 deploy/.env):
#   0 3 * * * cd /home/ubuntu/ShawnStudyStation/deploy && \
#     set -a && . ./.env && set +a && \
#     docker exec xss-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
#       > backups/backup_$(date +\%F).sql

# 更新代码后重建并滚动重启
git pull   # 或重新上传
docker compose up -d --build

# PinPin 的 SQLite 数据在命名卷 pinpin-data;Postgres 在 pgdata。
# 删除卷会丢数据,务必先备份。
```

---

## 9. 体积优化提示

`vendor/phonics-flashcards/video/`(约 842MB)与 `video_trim/`(约 204MB)体积很大。
**音频已内联,发音正常**;视频缺失时拼读应用会自动回退到 TTS。
如需精简上传 / 镜像体积,可不部署这两个视频目录(不影响核心发音功能)。

---

## 10. 安全提示

- **不要**把 `deploy/.env` 和 `deploy/certs/*.pem` 提交到 git(已在 `.gitignore` 忽略)。
- 定期备份数据库(见运维章节)。
- 短信为**付费**服务,注意账户余额与频控配置,避免被刷。
- `JWT_SECRET` / `POSTGRES_PASSWORD` 务必使用强随机值;如疑似泄露应立即轮换。
