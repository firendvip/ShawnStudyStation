# 部署到腾讯云服务器(域名 pp.look3.cn)

> 适用:Ubuntu/Debian 系的腾讯云轻量/ECS。整套流程约 10–20 分钟。
> 前置:已有一台能 SSH 的服务器;域名 `pp.look3.cn` 已解析到服务器公网 IP;
> **国内服务器对外提供网站需完成 ICP 备案**(未备案会被拦截 80/443)。

## 0. 重要安全提醒
当前未接入真实短信,处于**演示模式**:请求验证码会把验证码直接返回前端,**任何人都能登录任意手机号**。
正式公开前必须:在 `lib/auth/codeSender.ts` 接入云短信,并设环境变量 `AUTH_SMS_PROVIDER=real`。
在此之前,「免登录访客模式」可正常公开使用(数据按设备隔离),登录功能仅供你自己测试。

## 1. 安装运行环境
```bash
# Node 20+(用 nodesource 或 nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo apt-get install -y fonts-noto-cjk          # 服务端 PDF 的中文字体
sudo npm i -g pm2
```
确认字体路径存在(供 `PDF_FONT_PATH`):
```bash
ls /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

## 2. 拉取代码并构建
```bash
cd /var/www && sudo chown -R $USER:$USER /var/www
git clone https://github.com/firendvip/PinPin.git
cd PinPin
cp .env.example .env                  # 如需可编辑 .env
npm ci
npx prisma migrate deploy             # 按迁移建好 SQLite 表(生成 prisma/prod.db)
npm run build
```

## 3. 用 PM2 常驻
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # 按提示执行返回的命令,实现开机自启
```
本机自测:`curl -I http://127.0.0.1:3000`

## 4. 配置 Nginx
```bash
sudo cp deploy/nginx-pp.look3.cn.conf /etc/nginx/conf.d/pp.look3.cn.conf
sudo nginx -t && sudo systemctl reload nginx
```
此时浏览器访问 `http://pp.look3.cn` 应能打开。

## 5. 开启 HTTPS(可选但推荐)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pp.look3.cn
```
certbot 会自动添加 443 配置并续期。

## 6. 放行端口
在腾讯云控制台「防火墙/安全组」放行 **80 / 443**。

## 更新部署(以后每次发版)
```bash
cd /var/www/PinPin
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 reload pinpin
```

## 备注
- 数据库为 SQLite 单文件(`prisma/prod.db`),已在 .gitignore 中;请定期备份该文件。数据量增大后可迁移到 PostgreSQL(改 `prisma/schema.prisma` 的 datasource 与 `DATABASE_URL`)。
- 生成的 PDF 存在 `storage/pdfs/`(已 gitignore)。
- 如需把验证码改为真实短信,见 `docs/账号系统设计.md` 第 6 节。
