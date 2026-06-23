import { prisma } from './prisma'
import { todayLocalDate } from './date'
import {
  DEFAULT_ANSWER_FONT_SIZE,
  DEFAULT_PINYIN_FONT_SIZE,
  DEFAULT_PRINT_SETTINGS,
  type AppSettings,
} from './types'

const CYCLE_START_KEY = 'cycleStartDate'
const PINYIN_FS_KEY = 'pinyinFontSize'
const ANSWER_FS_KEY = 'answerFontSize'
const DATE_ENTRY_KEY = 'dateEntryEnabled'
const PRINT_DAYS_KEY = 'printDays'
const PRINT_COLUMNS_KEY = 'printColumns'
const PRINT_FS_KEY = 'printFontSize'
const PRINT_ROWGAP_KEY = 'printRowGap'
const PRINT_MARGIN_KEY = 'printMargin'
const PRINT_INDEX_KEY = 'printShowIndex'
const PRINT_WRITE_KEY = 'printShowWriteSpace'
const PRINT_TITLE_KEY = 'printTitle'
const PRINT_SHOW_TITLE_KEY = 'printShowTitle'
const PRINT_APPEND_DATE_KEY = 'printAppendDate'
const PRINT_SHOW_SUBTITLE_KEY = 'printShowSubtitle'
const PRINT_EVEN_KEY = 'printEvenDistribute'

async function getSetting(userId: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { userId_key: { userId, key } } })
  return row?.value ?? null
}

async function setSetting(userId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  })
}

function toNumber(value: string | null, fallback: number): number {
  if (value === null || value === '') {
    return fallback
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toBool(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback
  }
  return value === 'true'
}

/** 周期起始日:未设置时默认今天并持久化(供分摊计算)。 */
export async function getCycleStartDate(userId: string): Promise<string> {
  const existing = await getSetting(userId, CYCLE_START_KEY)
  if (existing) {
    return existing
  }
  const today = todayLocalDate()
  await setSetting(userId, CYCLE_START_KEY, today)
  return today
}

export async function getSettings(userId: string): Promise<AppSettings> {
  const d = DEFAULT_PRINT_SETTINGS
  return {
    cycleStartDate: await getCycleStartDate(userId),
    pinyinFontSize: toNumber(await getSetting(userId, PINYIN_FS_KEY), DEFAULT_PINYIN_FONT_SIZE),
    answerFontSize: toNumber(await getSetting(userId, ANSWER_FS_KEY), DEFAULT_ANSWER_FONT_SIZE),
    dateEntryEnabled: toBool(await getSetting(userId, DATE_ENTRY_KEY), true),
    printDays: toNumber(await getSetting(userId, PRINT_DAYS_KEY), d.printDays),
    printColumns: toNumber(await getSetting(userId, PRINT_COLUMNS_KEY), d.printColumns),
    printFontSize: toNumber(await getSetting(userId, PRINT_FS_KEY), d.printFontSize),
    printRowGap: toNumber(await getSetting(userId, PRINT_ROWGAP_KEY), d.printRowGap),
    printMargin: toNumber(await getSetting(userId, PRINT_MARGIN_KEY), d.printMargin),
    printShowIndex: toBool(await getSetting(userId, PRINT_INDEX_KEY), d.printShowIndex),
    printShowWriteSpace: toBool(await getSetting(userId, PRINT_WRITE_KEY), d.printShowWriteSpace),
    printTitle: (await getSetting(userId, PRINT_TITLE_KEY)) ?? d.printTitle,
    printShowTitle: toBool(await getSetting(userId, PRINT_SHOW_TITLE_KEY), d.printShowTitle),
    printAppendDate: toBool(await getSetting(userId, PRINT_APPEND_DATE_KEY), d.printAppendDate),
    printShowSubtitle: toBool(await getSetting(userId, PRINT_SHOW_SUBTITLE_KEY), d.printShowSubtitle),
    printEvenDistribute: toBool(await getSetting(userId, PRINT_EVEN_KEY), d.printEvenDistribute),
  }
}

export async function saveSettings(userId: string, settings: AppSettings): Promise<void> {
  const entries: [string, string][] = [
    [CYCLE_START_KEY, settings.cycleStartDate],
    [PINYIN_FS_KEY, String(settings.pinyinFontSize)],
    [ANSWER_FS_KEY, String(settings.answerFontSize)],
    [DATE_ENTRY_KEY, String(settings.dateEntryEnabled)],
    [PRINT_DAYS_KEY, String(settings.printDays)],
    [PRINT_COLUMNS_KEY, String(settings.printColumns)],
    [PRINT_FS_KEY, String(settings.printFontSize)],
    [PRINT_ROWGAP_KEY, String(settings.printRowGap)],
    [PRINT_MARGIN_KEY, String(settings.printMargin)],
    [PRINT_INDEX_KEY, String(settings.printShowIndex)],
    [PRINT_WRITE_KEY, String(settings.printShowWriteSpace)],
    [PRINT_TITLE_KEY, settings.printTitle],
    [PRINT_SHOW_TITLE_KEY, String(settings.printShowTitle)],
    [PRINT_APPEND_DATE_KEY, String(settings.printAppendDate)],
    [PRINT_SHOW_SUBTITLE_KEY, String(settings.printShowSubtitle)],
    [PRINT_EVEN_KEY, String(settings.printEvenDistribute)],
  ]
  for (const [key, value] of entries) {
    await setSetting(userId, key, value)
  }
}
