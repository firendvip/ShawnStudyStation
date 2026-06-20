import { getCycleStartDate } from './settings'
import { listEntriesInRange } from './entries'
import { addDays, diffDays, CYCLE_DAYS } from './date'
import type { EntryItem, PracticeDay } from './types'

/**
 * 每个词需要书写两次:
 * 1) 第一次:录入的次日(前一天录入的词,今天书写)。
 * 2) 第二次:按周 ÷7 分摊 —— 从起始日 S 起每 7 天为一个录入周期,
 *    该周期录入的词(先录先写)总数 ÷7,分摊到下一个 7 天每天书写,余数靠前。
 */

/** 把 n 个词在 7 天里的每日数量(余数靠前)。 */
export function dayCounts(n: number): number[] {
  const base = Math.floor(n / CYCLE_DAYS)
  const rem = n % CYCLE_DAYS
  return Array.from({ length: CYCLE_DAYS }, (_, i) => base + (i < rem ? 1 : 0))
}

/** 取第 dayOffset(0..6)天应书写的词。 */
export function sliceForDay(entries: EntryItem[], dayOffset: number): EntryItem[] {
  const counts = dayCounts(entries.length)
  let start = 0
  for (let i = 0; i < dayOffset; i++) {
    start += counts[i]
  }
  return entries.slice(start, start + counts[dayOffset])
}

async function weeklyDistributedForDate(userId: string, start: string, date: string): Promise<EntryItem[]> {
  const weeksFromStart = Math.floor(diffDays(start, date) / CYCLE_DAYS)
  const intakeIndex = weeksFromStart - 1
  if (intakeIndex < 0) {
    return []
  }
  const intakeStart = addDays(start, intakeIndex * CYCLE_DAYS)
  const intakeEnd = addDays(intakeStart, CYCLE_DAYS - 1)
  const entries = await listEntriesInRange(userId, intakeStart, intakeEnd)
  if (entries.length === 0) {
    return []
  }
  const dayOffset = ((diffDays(start, date) % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS
  return sliceForDay(entries, dayOffset)
}

/** 第一次书写:前一天录入的词(今天首写)。 */
export async function getFirstWriteForDate(userId: string, date: string): Promise<EntryItem[]> {
  const prevDay = addDays(date, -1)
  return listEntriesInRange(userId, prevDay, prevDay)
}

/** 第二次书写:按周 ÷7 分摊到当天的复写批次。 */
export async function getSecondWriteForDate(userId: string, date: string): Promise<EntryItem[]> {
  const start = await getCycleStartDate(userId)
  return weeklyDistributedForDate(userId, start, date)
}

/** 某个日期应书写的全部词(第一次 + 第二次,去重)。 */
export async function getPracticeForDate(userId: string, date: string): Promise<EntryItem[]> {
  const firstWrite = await getFirstWriteForDate(userId, date)
  const secondWrite = await getSecondWriteForDate(userId, date)
  const seen = new Set(firstWrite.map((e) => e.id))
  return [...firstWrite, ...secondWrite.filter((e) => !seen.has(e.id))]
}

/** 日期区间内逐日的书写批次(含空天)。 */
export async function getPracticeForRange(
  userId: string,
  from: string,
  to: string,
): Promise<PracticeDay[]> {
  const span = diffDays(from, to)
  if (span < 0) {
    return []
  }
  const days: PracticeDay[] = []
  for (let i = 0; i <= span && i < 366; i++) {
    const date = addDays(from, i)
    days.push({ date, entries: await getPracticeForDate(userId, date) })
  }
  return days
}
