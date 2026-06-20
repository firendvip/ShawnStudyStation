/**
 * 日期与 7 天周期工具。
 * 日期统一用本地 YYYY-MM-DD 字符串,内部按 UTC 午夜计算避免 DST 误差。
 */

export const CYCLE_DAYS = 7

const MS_PER_DAY = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtcMs(ms: number): string {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** 当前本地日期(YYYY-MM-DD)。 */
export function todayLocalDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(dateStr: string, n: number): string {
  return fromUtcMs(toUtcMs(dateStr) + n * MS_PER_DAY)
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

/** 书写日期 = 录入日期 + 1 天。 */
export function writeDateFor(recordDate: string): string {
  return addDays(recordDate, 1)
}

/** 展示用:M月D日。 */
export function formatCN(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}月${d}日`
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 星期几,如「星期五」。 */
export function weekdayCN(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `星期${WEEKDAY_CN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`
}

/** 展示用:M月D日 星期X。 */
export function formatCNFull(dateStr: string): string {
  return `${formatCN(dateStr)} ${weekdayCN(dateStr)}`
}

export interface CycleRange {
  start: string
  end: string
}

export interface CycleInfo extends CycleRange {
  index: number
}

/** 第 index 个周期的起止日期(含端点,共 7 天)。 */
export function cycleRange(startDate: string, index: number): CycleRange {
  const start = addDays(startDate, index * CYCLE_DAYS)
  return { start, end: addDays(start, CYCLE_DAYS - 1) }
}

/** 给定日期落在第几个周期(可能为负:早于起始日)。 */
export function cycleIndexFor(startDate: string, date: string): number {
  return Math.floor(diffDays(startDate, date) / CYCLE_DAYS)
}

/** 包含 today 的当前周期。 */
export function currentCycle(startDate: string, today: string): CycleInfo {
  const index = Math.max(0, cycleIndexFor(startDate, today))
  return { index, ...cycleRange(startDate, index) }
}

/** 截至 today 已完整结束(end 早于 today)的所有周期。 */
export function completedCycleRanges(startDate: string, today: string): CycleInfo[] {
  const result: CycleInfo[] = []
  for (let index = 0; index < 10_000; index++) {
    const range = cycleRange(startDate, index)
    if (diffDays(range.end, today) >= 1) {
      result.push({ index, ...range })
    } else {
      break
    }
  }
  return result
}
