// PM2 进程配置:在服务器上用 `pm2 start ecosystem.config.js` 常驻运行。
module.exports = {
  apps: [
    {
      name: 'pinpin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        // SQLite 数据库文件(相对 cwd)。数据量大后可换 PostgreSQL。
        DATABASE_URL: 'file:./prisma/prod.db',
        // Linux 中文字体(需先 apt 安装 fonts-noto-cjk)。
        PDF_FONT_PATH: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        // 接入真实短信后取消注释,关闭演示模式(演示模式会把验证码返回前端,生产务必关闭):
        // AUTH_SMS_PROVIDER: 'real',
      },
    },
  ],
}
