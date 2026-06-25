import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/common/Providers'

export const metadata: Metadata = {
  title: 'PinPin · 汉字转拼音练习表',
  description: '输入字词,转成带声调拼音,排成整齐网格,一键打印成练习表。',
}

// xss-track-loader: 埋点 tracker 加载器。PinPin 在 localhost:3000，base 检测会指到
// 后端 localhost:4000；生产同域时为空串走相对 /api。data-app='pinpin'。
const XSS_TRACK_LOADER =
  "(function(){try{var B=(location.protocol==='file:'||/^(localhost|127\\.|192\\.168\\.|10\\.|172\\.)/.test(location.hostname))?'http://localhost:4000':'';var s=document.createElement('script');s.src=B+'/api/analytics/track.js';s.async=true;s.dataset.app='pinpin';document.head.appendChild(s);}catch(e){}})();"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
        <Script id="xss-track-loader" strategy="afterInteractive">
          {XSS_TRACK_LOADER}
        </Script>
      </body>
    </html>
  )
}
