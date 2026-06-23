import { addDays, diffDays } from './date'
import type { EntryItem, PracticeDay } from './types'

/**
 * 把一段日期区间内的所有词「平均分摊」到每一天(先录先写,余数靠前)。
 * 例:10 天、100 词 → 每天 10 词。
 */
export function evenlyDistribute(
  entries: EntryItem[],
  from: string,
  to: string,
): PracticeDay[] {
  const numDays = diffDays(from, to) + 1
  if (numDays <= 0) {
    return []
  }
  const base = Math.floor(entries.length / numDays)
  const rem = entries.length % numDays

  const days: PracticeDay[] = []
  let cursor = 0
  for (let i = 0; i < numDays; i++) {
    const count = base + (i < rem ? 1 : 0)
    days.push({
      date: addDays(from, i),
      entries: entries.slice(cursor, cursor + count),
    })
    cursor += count
  }
  return days
}

/**
 * 非平均(先录先写,顺序填充):保留「录入日期」原有的分批,按录入先后依次落到
 * 书写区间的每一天。录入组数多于书写天数时,多出的并入最后一天;少于则尾部留空。
 * entries 需已按 recordDate、createdAt 升序。
 */
export function sequentialByRecordDay(
  entries: EntryItem[],
  writeFrom: string,
  writeTo: string,
): PracticeDay[] {
  const numDays = diffDays(writeFrom, writeTo) + 1
  if (numDays <= 0) {
    return []
  }
  const groups: EntryItem[][] = []
  let curDate: string | null = null
  for (const e of entries) {
    if (e.recordDate !== curDate) {
      groups.push([])
      curDate = e.recordDate
    }
    groups[groups.length - 1].push(e)
  }
  const days: PracticeDay[] = []
  for (let i = 0; i < numDays; i++) {
    days.push({ date: addDays(writeFrom, i), entries: [] })
  }
  groups.forEach((group, k) => {
    const idx = Math.min(k, numDays - 1)
    days[idx].entries.push(...group)
  })
  return days
}
