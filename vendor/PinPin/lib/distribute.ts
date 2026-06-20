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
