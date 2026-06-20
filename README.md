# 小善学习站 (ShawnStudyStation)

一个面向少儿的学习门户站点,包含一个静态主站、一个带账号体系的后端,以及两个嵌入式学习应用。

## 项目组成

- **静态主站** (`index.html` + `assets/`):门户首页,聚合各学习模块入口。
- **账号后端** (`server/`):基于 Node.js 的 API 服务,使用 **PostgreSQL** 存储账号与学习数据,
  通过 **邮箱验证码(SMTP)** 实现邮箱注册 / 登录,JWT 鉴权,并提供 `/api/health` 健康检查与学习数据存取接口。
- **嵌入式应用** (`vendor/`):
  - `vendor/PinPin/`:错字练习应用(Next.js)。
  - `vendor/phonics-flashcards/`:自然拼读卡片应用。

## 部署

生产部署采用 Docker Compose,编排 **四个服务**:`postgres`、`backend`、`pinpin`、`web`,
由 Nginx 统一对外提供 HTTPS(80/443)。

- 部署栈与本地说明见 **[`deploy/README.md`](deploy/README.md)**。
- 在云服务器(腾讯云 CVM)上的完整上线步骤见 **[`docs/服务器部署指引.md`](docs/服务器部署指引.md)**。

## 文档 (`docs/`)

- **[`docs/邮箱验证码配置指引.md`](docs/邮箱验证码配置指引.md)**:个人开发者获取 SMTP 邮箱验证码配置(QQ / 163 / Gmail 授权码)的指引。
- **[`docs/腾讯云短信开通指引.md`](docs/腾讯云短信开通指引.md)**:_(已弃用)_ 旧的腾讯云短信开通指引,仅作存档参考(个人认证用户已无法使用)。
- **[`docs/服务器部署指引.md`](docs/服务器部署指引.md)**:可直接交给浏览器内 Claude 扩展、驱动腾讯云网页终端完成部署的指引。

## 安全提醒

- `.env` 与 `deploy/certs/*.pem` 已被 `.gitignore` 忽略,**切勿提交进 git**。
- 邮箱验证码使用通用 SMTP 发信;个人邮箱有每日发信上限,用户量大时可改用事务邮件服务(见 `docs/邮箱验证码配置指引.md`)。
