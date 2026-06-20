# TLS 证书目录

Nginx 会以只读方式挂载本目录到容器内的 `/etc/nginx/certs`,并读取:

- `fullchain.pem` —— 完整证书链(站点证书 + 中间证书)
- `privkey.pem`  —— 证书私钥

**两个文件名必须完全一致。** 放好后即可 `docker compose up -d`。

> 安全:`*.pem` 已被 `deploy/.gitignore` 忽略,切勿提交私钥到 git。

---

## 方式一:腾讯云免费 DV 证书(推荐,域名已备案时最省事)

1. 登录腾讯云控制台 → 「SSL 证书」→「申请免费证书」(DV 单域名,有效期通常 1 年)。
2. 绑定域名为你的站点域名(需已解析到本 CVM 公网 IP),按引导完成 DNS / 文件验证。
3. 签发后,在证书列表点击「下载」,**证书类型选择 Nginx**。
4. 解压下载包,里面通常包含:
   - `你的域名_bundle.crt`(或 `fullchain.crt`)→ 重命名为 `fullchain.pem`
   - `你的域名.key`(私钥)→ 重命名为 `privkey.pem`
5. 把这两个文件放到本目录 `deploy/certs/`。

```bash
# 在服务器上,假设解压目录为 ~/cert/Nginx/
cp ~/cert/Nginx/*_bundle.crt  deploy/certs/fullchain.pem
cp ~/cert/Nginx/*.key         deploy/certs/privkey.pem
```

---

## 方式二:Let's Encrypt(certbot,可自动续期)

在 CVM 上安装 certbot 后,任选一种签发方式。

### standalone(签发时需临时占用 80 端口,先停掉 web 容器)

```bash
sudo apt-get update && sudo apt-get install -y certbot

cd deploy && docker compose stop web        # 释放 80 端口
sudo certbot certonly --standalone -d 你的域名 --agree-tos -m 你的邮箱 -n
docker compose start web
```

### webroot(无需停服;依赖 nginx 的 ACME 路由)

本仓库的 nginx 80 端口已配置 `/.well-known/acme-challenge/` 指向容器内 `/var/www/certbot`,
该目录已通过 compose 挂载到宿主机 `deploy/certbot/www`。直接对该目录签发即可:

```bash
# 在宿主机上,-w 指向被挂载的 webroot
sudo certbot certonly --webroot -w deploy/certbot/www -d 你的域名 --agree-tos -m 你的邮箱 -n
```

### 拷贝证书到本目录

certbot 默认把证书放在 `/etc/letsencrypt/live/你的域名/`:

```bash
sudo cp /etc/letsencrypt/live/你的域名/fullchain.pem deploy/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/你的域名/privkey.pem   deploy/certs/privkey.pem
sudo chmod 644 deploy/certs/*.pem
```

> 续期后需重新拷贝并 `docker compose restart web`(或写一个续期钩子自动完成)。
