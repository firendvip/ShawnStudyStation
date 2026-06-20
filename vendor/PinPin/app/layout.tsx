import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PinPin · 汉字转拼音练习表',
  description: '输入字词,转成带声调拼音,排成整齐网格,一键打印成练习表。',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
