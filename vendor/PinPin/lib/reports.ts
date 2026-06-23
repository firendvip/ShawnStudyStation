import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from './prisma'
import { generatePinyinPdf, type PdfSection } from './pdf'
import { evenlyDistribute, sequentialByRecordDay } from './distribute'
import { formatCN } from './date'
import { DEFAULT_GRID_OPTIONS, type PdfReportItem, type EntryItem } from './types'

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'pdfs')

interface ReportRow {
  id: string
  cycleStart: string
  cycleEnd: string
  entryCount: number
  createdAt: Date
}

function toReportItem(row: ReportRow): PdfReportItem {
  return {
    id: row.id,
    cycleStart: row.cycleStart,
    cycleEnd: row.cycleEnd,
    entryCount: row.entryCount,
    createdAt: row.createdAt.toISOString(),
  }
}

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

export async function listReports(userId: string): Promise<PdfReportItem[]> {
  const rows = await prisma.pdfReport.findMany({
    where: { userId },
    orderBy: { cycleStart: 'desc' },
  })
  return rows.map(toReportItem)
}

export interface PrintOptions {
  title?: string
  columns?: number
  fontSize?: number
  margin?: number
  rowGap?: number
  showIndex?: boolean
  showWriteSpace?: boolean
  showSubtitle?: boolean
  evenDistribute?: boolean
}

export interface BuildResult {
  report?: PdfReportItem
  empty?: boolean
}

/**
 * 生成练习 PDF:先按「录入日期」区间 [recFrom, recTo] 取词,
 * 再按「书写日期」区间 [writeFrom, writeTo] 分配(勾选平均分配则均分,否则先录先写顺序填充)。
 * 无数据返回 { empty: true }。
 */
export async function buildReportForRange(
  userId: string,
  recFrom: string,
  recTo: string,
  writeFrom: string,
  writeTo: string,
  options: PrintOptions = {},
): Promise<BuildResult> {
  const rows = await prisma.entry.findMany({
    where: { userId, recordDate: { gte: recFrom, lte: recTo } },
    orderBy: [{ recordDate: 'asc' }, { createdAt: 'asc' }],
  })
  const words: EntryItem[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    pinyin: r.pinyin,
    recordDate: r.recordDate,
  }))
  const distributed = options.evenDistribute
    ? evenlyDistribute(words, writeFrom, writeTo)
    : sequentialByRecordDay(words, writeFrom, writeTo)
  const days = distributed.filter((d) => d.entries.length > 0)
  const total = days.reduce((sum, d) => sum + d.entries.length, 0)
  if (total === 0) {
    return { empty: true }
  }

  const sections: PdfSection[] = days.map((d) => ({
    heading: `书写日期 · ${formatCN(d.date)}`,
    cells: d.entries.map((e) => ({ pinyin: e.pinyin })),
  }))

  const counts = days.map((d) => d.entries.length)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  const perDay = min === max ? `${min}` : `${min}-${max}`

  const buffer = await generatePinyinPdf({
    title: options.title ?? '',
    subtitle: options.showSubtitle === false ? '' : `共 ${total} 词,每日 ${perDay} 词`,
    sections,
    grid: {
      columns: options.columns ?? DEFAULT_GRID_OPTIONS.columns,
      showIndex: options.showIndex ?? DEFAULT_GRID_OPTIONS.showIndex,
      showWriteSpace: options.showWriteSpace ?? DEFAULT_GRID_OPTIONS.showWriteSpace,
    },
    pinyinSize: options.fontSize,
    pageMargin: options.margin,
    rowGap: options.rowGap,
  })

  await ensureStorageDir()
  const filename = `report-${userId}-${writeFrom}_${writeTo}.pdf`
  await fs.writeFile(path.join(STORAGE_DIR, filename), buffer)

  const where = {
    userId_cycleStart_cycleEnd: { userId, cycleStart: writeFrom, cycleEnd: writeTo },
  }
  const row = await prisma.pdfReport.upsert({
    where,
    update: { filename, entryCount: total },
    create: { userId, cycleStart: writeFrom, cycleEnd: writeTo, filename, entryCount: total },
  })
  return { report: toReportItem(row) }
}

export async function getReportFile(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const row = await prisma.pdfReport.findFirst({ where: { id, userId } })
  if (!row) {
    return null
  }
  try {
    const buffer = await fs.readFile(path.join(STORAGE_DIR, row.filename))
    return { buffer, filename: row.filename }
  } catch (error) {
    console.error('[reports] 读取 PDF 文件失败', error)
    return null
  }
}

/** 删除某个已生成的 PDF(仅限本人):删库 + 删文件。 */
export async function deleteReport(userId: string, id: string): Promise<boolean> {
  const row = await prisma.pdfReport.findFirst({ where: { id, userId } })
  if (!row) {
    return false
  }
  await prisma.pdfReport.delete({ where: { id: row.id } })
  try {
    await fs.unlink(path.join(STORAGE_DIR, row.filename))
  } catch {
    // 文件可能已不存在,忽略
  }
  return true
}
