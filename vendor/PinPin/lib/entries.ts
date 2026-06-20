import { prisma } from './prisma'
import { toPinyin } from './pinyin'
import { todayLocalDate } from './date'
import type { EntryItem } from './types'

interface EntryRow {
  id: string
  text: string
  pinyin: string
  recordDate: string
}

function toItem(row: EntryRow): EntryItem {
  return { id: row.id, text: row.text, pinyin: row.pinyin, recordDate: row.recordDate }
}

export interface AddResult {
  added: EntryItem[]
  duplicates: string[]
}

/** 录入若干字词到指定日期(默认今天),同一天内重复的进入 duplicates 不入库。 */
export async function addEntries(
  userId: string,
  texts: string[],
  date?: string,
): Promise<AddResult> {
  const recordDate = date ?? todayLocalDate()

  const existing = await prisma.entry.findMany({
    where: { userId, recordDate },
    select: { text: true },
  })
  const existingSet = new Set(existing.map((e) => e.text))

  const added: EntryItem[] = []
  const duplicates: string[] = []
  const seenThisBatch = new Set<string>()

  for (const text of texts) {
    if (existingSet.has(text) || seenThisBatch.has(text)) {
      duplicates.push(text)
      continue
    }
    seenThisBatch.add(text)
    const created = await prisma.entry.create({
      data: { userId, text, pinyin: toPinyin(text), recordDate },
    })
    added.push(toItem(created))
  }

  return { added, duplicates }
}

/** 全部录入记录(录入日期新→旧,同日先录先写)。 */
export async function listAll(userId: string): Promise<EntryItem[]> {
  const rows = await prisma.entry.findMany({
    where: { userId },
    orderBy: [{ recordDate: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(toItem)
}

/** 今天录入的记录(先录先写顺序)。 */
export async function listToday(userId: string): Promise<EntryItem[]> {
  const rows = await prisma.entry.findMany({
    where: { userId, recordDate: todayLocalDate() },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toItem)
}

/** 指定录入日期范围(含端点)内的记录,按先录先写排序(用于分摊引擎)。 */
export async function listEntriesInRange(
  userId: string,
  start: string,
  end: string,
): Promise<EntryItem[]> {
  const rows = await prisma.entry.findMany({
    where: { userId, recordDate: { gte: start, lte: end } },
    orderBy: [{ recordDate: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toItem)
}

/** 修改字词并自动重算拼音(仅限本人记录)。 */
export async function updateEntry(
  userId: string,
  id: string,
  text: string,
): Promise<EntryItem | null> {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  const owned = await prisma.entry.findFirst({ where: { id, userId } })
  if (!owned) {
    return null
  }
  const updated = await prisma.entry.update({
    where: { id },
    data: { text: trimmed, pinyin: toPinyin(trimmed) },
  })
  return toItem(updated)
}

export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const result = await prisma.entry.deleteMany({ where: { id, userId } })
  return result.count > 0
}
