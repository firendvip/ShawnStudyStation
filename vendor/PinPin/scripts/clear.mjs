import { PrismaClient } from '@prisma/client'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()

await prisma.entry.deleteMany({})
await prisma.pdfReport.deleteMany({})

const dir = path.join(process.cwd(), 'storage', 'pdfs')
try {
  const files = await fs.readdir(dir)
  await Promise.all(files.map((f) => fs.unlink(path.join(dir, f))))
} catch {
  // 目录不存在则忽略
}

console.log('cleared all entries, reports and generated PDFs')
await prisma.$disconnect()
