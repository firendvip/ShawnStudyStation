import type { NextConfig } from 'next'

// 基础安全响应头。HSTS 与完整 CSP 建议在生产的 Nginx/HTTPS 层补充。
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

// 反向代理子路径前缀。本地开发不设置 BASE_PATH → 空字符串 → 无 basePath(行为不变);
// 容器构建时设置 BASE_PATH=/pinpin → 整个应用挂载在 /pinpin 下,供 Nginx 以 /pinpin/ 反代。
// 注意:basePath / assetPrefix 为空时必须传 undefined(而非 ''),否则 Next 会报无效配置。
const basePath = process.env.BASE_PATH || ''

const nextConfig: NextConfig = {
  // 隐藏开发模式左下角的 Next.js「N」指示器
  devIndicators: false,
  // 把构建时的 basePath 暴露给客户端代码(本地为空、容器为 /pinpin)。
  // 客户端 lib/api.ts 据此给所有打到自身后端的请求加前缀,
  // 否则云端 /api/... 会被解析成主站根路径 https://look3.cn/api/... 打到主站后端。
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // 子路径部署:为空时不启用,保持本地开发原样
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // 规范化为带尾斜杠的 /pinpin/，避免与 Nginx 之间 308↔301 重定向回环
  trailingSlash: true,
  // pdfkit 需要读取自带字体数据文件,作为外部包从 node_modules 原样加载,避免被打包后丢失
  serverExternalPackages: ['pdfkit'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
