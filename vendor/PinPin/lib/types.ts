/** 登录用户(前端用) */
export interface AuthUser {
  id: string
  phone: string | null
  nickname: string | null
  /** 访客(无手机号) */
  isGuest: boolean
}

/** 一条错字记录(前端用) */
export interface EntryItem {
  id: string
  text: string
  pinyin: string
  recordDate: string
}

/** 某一天要书写的批次 */
export interface PracticeDay {
  date: string
  entries: EntryItem[]
}

/** 已生成的 PDF 报告 */
export interface PdfReportItem {
  id: string
  cycleStart: string
  cycleEnd: string
  entryCount: number
  createdAt: string
  displayName?: string
  withAnswer?: boolean
}

export interface AppSettings {
  cycleStartDate: string
  /** 屏幕上拼音字号(px) */
  pinyinFontSize: number
  /** 屏幕上答案(字词)字号(px) */
  answerFontSize: number
  /** 是否开启「日期录入」(录入页可选择任意日期) */
  dateEntryEnabled: boolean
  // ===== 打印设置 =====
  /** 打印覆盖的天数(从起始日起) */
  printDays: number
  printColumns: number
  printFontSize: number
  printRowGap: number
  printMargin: number
  printShowIndex: boolean
  printShowWriteSpace: boolean
  printTitle: string
  /** 是否打印标题 */
  printShowTitle: boolean
  /** 是否在标题尾部加上日期 */
  printAppendDate: boolean
  /** 是否打印副标题(共X词,每日Y词) */
  printShowSubtitle: boolean
  /** 打印时把所选范围内容平均分摊到每一天(先录先写) */
  printEvenDistribute: boolean
}

export const DEFAULT_PINYIN_FONT_SIZE = 20
export const DEFAULT_ANSWER_FONT_SIZE = 18
export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 48

export const DEFAULT_PRINT_SETTINGS = {
  printDays: 7,
  printColumns: 4,
  printFontSize: 16,
  printRowGap: 8,
  printMargin: 44,
  printShowIndex: true,
  printShowWriteSpace: true,
  printTitle: '小善周拼拼',
  printShowTitle: true,
  printAppendDate: true,
  printShowSubtitle: true,
  printEvenDistribute: true,
} as const

/**
 * 组合出一份完整的默认设置。
 * 周期起始日没有固定默认值(默认为今天),因此保留当前值。
 */
export function buildDefaultSettings(cycleStartDate: string): AppSettings {
  return {
    cycleStartDate,
    pinyinFontSize: DEFAULT_PINYIN_FONT_SIZE,
    answerFontSize: DEFAULT_ANSWER_FONT_SIZE,
    dateEntryEnabled: true,
    ...DEFAULT_PRINT_SETTINGS,
  }
}

/** 网格 / 打印排版选项(PDF 用) */
export interface GridOptions {
  columns: number
  showIndex: boolean
  showWriteSpace: boolean
}

export const MIN_COLUMNS = 1
export const MAX_COLUMNS = 10
export const DEFAULT_COLUMNS = 4

export const DEFAULT_GRID_OPTIONS: GridOptions = {
  columns: DEFAULT_COLUMNS,
  showIndex: true,
  showWriteSpace: true,
}
