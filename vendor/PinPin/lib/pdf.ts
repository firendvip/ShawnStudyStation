import PDFDocument from 'pdfkit'
import { MAX_COLUMNS, MIN_COLUMNS, type GridOptions } from './types'

// 演示用系统 CJK 字体(含拉丁声调字符)。生产 Linux 服务器请改为打包的 Noto Sans SC。
const FONT_PATH =
  process.env.PDF_FONT_PATH ?? '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'

const PAGE_MARGIN = 44
const TITLE_SIZE = 18
const SUBTITLE_SIZE = 11
const SECTION_SIZE = 12
const INDEX_SIZE = 7
const WRITE_BOX_HEIGHT = 38
const CELL_PADDING = 6
const CELL_GAP = 8
const SECTION_GAP = 16

const COLOR_INK = '#33302b'
const COLOR_INDEX = '#b8b3aa'
const COLOR_BORDER = '#d8d3c8'
const COLOR_ACCENT = '#3f7d52'
const COLOR_ANSWER = '#9a958c'
const ANSWER_GAP = 3

export interface PdfCellInput {
  pinyin: string
  /** 答案版:拼音下方显示的字词答案 */
  text?: string
}

export interface PdfSection {
  heading: string
  cells: PdfCellInput[]
}

export interface GeneratePdfOptions {
  title: string
  subtitle: string
  sections: PdfSection[]
  grid: GridOptions
  /** 页边距(pt),默认 44 */
  pageMargin?: number
  /** 拼音字号(pt),不传则按列数自动 */
  pinyinSize?: number
  /** 行间距(pt),不传则默认 */
  rowGap?: number
}

function clampColumns(columns: number): number {
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(columns)))
}

function pinyinFontSize(columns: number): number {
  if (columns <= 4) return 13
  if (columns <= 6) return 11
  if (columns <= 8) return 9
  return 8
}

/** 用 pdfkit 渲染一张拼音练习表 PDF(按书写日期分组),返回 Buffer。 */
export function generatePinyinPdf(options: GeneratePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const margin = options.pageMargin ?? PAGE_MARGIN
      const doc = new PDFDocument({ size: 'A4', margin })
      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      doc.registerFont('cjk', FONT_PATH)
      doc.font('cjk')

      const pageBottom = doc.page.height - margin
      const contentWidth = doc.page.width - margin * 2
      const columns = clampColumns(options.grid.columns)
      const cellWidth = contentWidth / columns
      const pinyinSize = options.pinyinSize ?? pinyinFontSize(columns)
      const rowGap = options.rowGap ?? CELL_GAP
      // 是否为答案版:任一格带有字词答案
      const hasAnswer = options.sections.some((s) => s.cells.some((c) => !!c.text))
      const answerSize = Math.max(9, Math.round(pinyinSize * 0.95))
      const answerBlock = hasAnswer ? ANSWER_GAP + answerSize : 0
      const rowHeight =
        CELL_PADDING * 2 +
        pinyinSize +
        4 +
        answerBlock +
        (options.grid.showWriteSpace ? CELL_GAP + WRITE_BOX_HEIGHT : 0)

      // 标题(可空)与副标题(可空)
      let y = margin
      if (options.title) {
        doc.fontSize(TITLE_SIZE).fillColor(COLOR_INK)
        doc.text(options.title, margin, y, { width: contentWidth, align: 'center' })
        y = doc.y
      }
      if (options.subtitle) {
        doc.fontSize(SUBTITLE_SIZE).fillColor(COLOR_INDEX)
        doc.text(options.subtitle, margin, y, { width: contentWidth, align: 'center' })
        y = doc.y
      }
      if (options.title || options.subtitle) {
        y += 18
      }

      const ensureSpace = (height: number) => {
        if (y + height > pageBottom) {
          doc.addPage()
          y = margin
        }
      }

      for (const section of options.sections) {
        // 避免分组标题成为页底孤行:确保标题 + 至少一行的空间
        ensureSpace(SECTION_SIZE + 8 + rowHeight)
        doc.fontSize(SECTION_SIZE).fillColor(COLOR_ACCENT)
        doc.text(section.heading, margin, y, { width: contentWidth })
        y = doc.y + 6

        for (let i = 0; i < section.cells.length; i += columns) {
          ensureSpace(rowHeight)
          const rowCells = section.cells.slice(i, i + columns)
          rowCells.forEach((cell, j) => {
            drawCell(doc, {
              x: margin + j * cellWidth,
              y,
              width: cellWidth - CELL_GAP,
              height: rowHeight,
              index: i + j + 1,
              pinyin: cell.pinyin,
              text: cell.text,
              pinyinSize,
              answerSize,
              grid: options.grid,
            })
          })
          y += rowHeight + rowGap
        }
        y += SECTION_GAP
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

interface CellDrawArgs {
  x: number
  y: number
  width: number
  height: number
  index: number
  pinyin: string
  text?: string
  pinyinSize: number
  answerSize: number
  grid: GridOptions
}

function drawCell(doc: PDFKit.PDFDocument, args: CellDrawArgs): void {
  doc
    .lineWidth(1)
    .strokeColor(COLOR_BORDER)
    .roundedRect(args.x, args.y, args.width, args.height, 6)
    .stroke()

  if (args.grid.showIndex) {
    doc.fontSize(INDEX_SIZE).fillColor(COLOR_INDEX)
    doc.text(String(args.index), args.x + 5, args.y + 4, { lineBreak: false })
  }

  // 拼音单行显示;过长则缩小字号以保证不换行、能放进一列
  const avail = args.width - CELL_PADDING * 2
  let size = args.pinyinSize
  doc.fontSize(size)
  while (size > 6 && doc.widthOfString(args.pinyin) > avail) {
    size -= 1
    doc.fontSize(size)
  }
  const pinyinY = args.y + CELL_PADDING + 4
  doc.fillColor(COLOR_INK)
  doc.text(args.pinyin, args.x + CELL_PADDING, pinyinY, {
    width: avail,
    align: 'center',
    lineBreak: false,
  })

  // 答案版:拼音正下方居中绘制字词答案(较小字号、较浅颜色,自动缩小避免溢出)
  if (args.text) {
    let aSize = args.answerSize
    doc.fontSize(aSize)
    while (aSize > 7 && doc.widthOfString(args.text) > avail) {
      aSize -= 1
      doc.fontSize(aSize)
    }
    doc.fillColor(COLOR_ANSWER)
    doc.text(args.text, args.x + CELL_PADDING, pinyinY + size + ANSWER_GAP, {
      width: avail,
      align: 'center',
      lineBreak: false,
    })
  }

  if (args.grid.showWriteSpace) {
    const boxX = args.x + CELL_PADDING
    const boxY = args.y + args.height - CELL_PADDING - WRITE_BOX_HEIGHT
    const boxW = args.width - CELL_PADDING * 2
    doc
      .lineWidth(1)
      .strokeColor(COLOR_BORDER)
      .roundedRect(boxX, boxY, boxW, WRITE_BOX_HEIGHT, 4)
      .stroke()
  }
}
