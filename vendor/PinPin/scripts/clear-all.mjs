import { PrismaClient } from '@prisma/client'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()

// 删除所有用户(级联删除其会话/字词/设置/报告)及验证码 → 全新空库
await prisma.user.deleteMany({})
await prisma.loginCode.deleteMany({})

const dir = path.join(process.cwd(), 'storage', 'pdfs')
try {
  const files = await fs.readdir(dir)
  await Promise.all(files.map((f) => fs.unlink(path.join(dir, f))))
} catch {
  // 目录不存在则忽略
}

console.log('cleared all users / codes / generated PDFs')
await prisma.$disconnect()
