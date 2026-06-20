import { PrismaClient } from '@prisma/client'
import { pinyin } from 'pinyin-pro'

const prisma = new PrismaClient()

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const today = new Date()
const start = new Date(today)
start.setDate(start.getDate() - 7) // 录入周期起始 = 今天-7,使今天成为练习周第一天

const words = [
  '苹果', '香蕉', '葡萄', '橘子', '西瓜', '银行', '重复',
  '学校', '老师', '同学', '朋友', '桌子', '铅笔', '书包',
]

await prisma.entry.deleteMany({})
await prisma.pdfReport.deleteMany({})

await prisma.setting.upsert({
  where: { key: 'cycleStartDate' },
  update: { value: ymd(start) },
  create: { key: 'cycleStartDate', value: ymd(start) },
})
await prisma.setting.upsert({
  where: { key: 'mode' },
  update: { value: 'auto' },
  create: { key: 'mode', value: 'auto' },
})

const base = Date.now() - 1_000_000
let i = 0
for (let day = 0; day < 7; day++) {
  const rd = new Date(start)
  rd.setDate(rd.getDate() + day)
  for (let k = 0; k < 2; k++) {
    const text = words[i]
    await prisma.entry.create({
      data: {
        text,
        pinyin: pinyin(text, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' }),
        recordDate: ymd(rd),
        createdAt: new Date(base + i * 1000),
      },
    })
    i++
  }
}

console.log(`seeded ${i} entries; cycleStart=${ymd(start)}; today=${ymd(today)}`)
await prisma.$disconnect()
