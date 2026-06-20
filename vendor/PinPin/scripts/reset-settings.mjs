import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 删除所有设置项 → getSettings 全部回落到代码里的默认值(含 cycleStartDate=今天)
const { count } = await prisma.setting.deleteMany({})

console.log(`reset ${count} setting(s) to defaults (all)`)
await prisma.$disconnect()
