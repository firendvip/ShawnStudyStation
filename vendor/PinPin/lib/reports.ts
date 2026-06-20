import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from './prisma'
import { generatePinyinPdf, type PdfSection } from './pdf'
import { getPracticeForRange } from './practice'
import { evenlyDistribute } from './distribute'
import { formatCN } from './date'
import { DEFAULT_GRID_OPTIONS, type PdfReportItem } from './types'

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

/** 为某个书写日期区间生成练习 PDF(按天分组,仅拼音)。无数据返回 { empty: true }。 */
export async function buildReportForRange(
  userId: string,
  from: string,
  to: string,
  options: PrintOptions = {},
): Promise<BuildResult> {
  const natural = await getPracticeForRange(userId, from, to)
  const distributed = options.evenDistribute
    ? evenlyDistribute(
        natural.flatMap((d) => d.entries),
        from,
        to,
      )
    : natural
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
  const filename = `report-${userId}-${from}_${to}.pdf`
  await fs.writeFile(path.join(STORAGE_DIR, filename), buffer)

  const where = {
    userId_cycleStart_cycleEnd: { userId, cycleStart: from, cycleEnd: to },
  }
  const row = await prisma.pdfReport.upsert({
    where,
    update: { filename, entryCount: total },
    create: { userId, cycleStart: from, cycleEnd: to, filename, entryCount: total },
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
