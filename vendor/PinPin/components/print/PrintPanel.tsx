'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchReports, fetchAllEntries, generateManualReport, reportUrl, deleteReport } from '@/lib/api'
import { addDays, formatCN, todayLocalDate } from '@/lib/date'
import { evenlyDistribute, sequentialByRecordDay } from '@/lib/distribute'
import { FitText } from '@/components/common/FitText'
import type { AppSettings, EntryItem, PdfReportItem } from '@/lib/types'
import styles from './PrintPanel.module.css'

type Props = {
  settings: AppSettings
}

function printPdf(url: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = url
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }
  document.body.appendChild(iframe)
}

/**
 * 打印:先选「录入时间」范围取词,再选「书写时间」范围分配 → 生成 PDF。
 * 分配方式由「设置」里的「平均分配」决定(勾选则均分到每天,否则先录先写顺序填充)。
 */
export function PrintPanel({ settings }: Props) {
  const today = todayLocalDate()
  const span = Math.max(1, settings.printDays) - 1
  // 录入时间范围(取词)
  const [recFrom, setRecFrom] = useState(addDays(today, -span))
  const [recTo, setRecTo] = useState(today)
  // 书写时间范围(分配)
  const [writeFrom, setWriteFrom] = useState(today)
  const [writeTo, setWriteTo] = useState(addDays(today, span))

  const [allEntries, setAllEntries] = useState<EntryItem[]>([])
  const [reports, setReports] = useState<PdfReportItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = settings.printShowTitle
    ? settings.printTitle + (settings.printAppendDate ? ` ${formatCN(writeFrom)}-${formatCN(writeTo)}` : '')
    : ''

  const loadReports = useCallback(async () => {
    setReports(await fetchReports())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await loadReports()
      } catch {
        // 忽略加载失败
      }
    })()
  }, [loadReports])

  useEffect(() => {
    fetchAllEntries().then(setAllEntries).catch(() => setAllEntries([]))
  }, [])

  // 1) 按录入时间范围取词(按录入日期、id 升序)
  const collected = allEntries
    .filter((e) => e.recordDate >= recFrom && e.recordDate <= recTo)
    .slice()
    .sort((a, b) =>
      a.recordDate < b.recordDate ? -1 : a.recordDate > b.recordDate ? 1 : a.id < b.id ? -1 : 1,
    )

  // 2) 按书写时间范围分配
  const distributed = settings.printEvenDistribute
    ? evenlyDistribute(collected, writeFrom, writeTo)
    : sequentialByRecordDay(collected, writeFrom, writeTo)
  const withContent = distributed.filter((d) => d.entries.length > 0)
  const total = withContent.reduce((sum, d) => sum + d.entries.length, 0)
  const counts = withContent.map((d) => d.entries.length)
  const perDay = counts.length === 0
    ? '0'
    : Math.min(...counts) === Math.max(...counts)
      ? `${Math.min(...counts)}`
      : `${Math.min(...counts)}-${Math.max(...counts)}`

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm('确定删除这个 PDF 吗?删除后无法恢复。')) return
    try {
      await deleteReport(id)
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await generateManualReport(
        { recFrom, recTo, writeFrom, writeTo },
        {
          title,
          columns: settings.printColumns,
          fontSize: settings.printFontSize,
          margin: settings.printMargin,
          rowGap: settings.printRowGap,
          showIndex: settings.printShowIndex,
          showWriteSpace: settings.printShowWriteSpace,
          showSubtitle: settings.printShowSubtitle,
          evenDistribute: settings.printEvenDistribute,
        },
      )
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.controls}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>录入开始时间</span>
            <input
              type="date"
              className={styles.input}
              value={recFrom}
              onChange={(e) => e.target.value && setRecFrom(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>录入结束时间</span>
            <input
              type="date"
              className={styles.input}
              value={recTo}
              onChange={(e) => e.target.value && setRecTo(e.target.value)}
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>书写开始时间</span>
            <input
              type="date"
              className={styles.input}
              value={writeFrom}
              onChange={(e) => e.target.value && setWriteFrom(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>书写结束时间</span>
            <input
              type="date"
              className={styles.input}
              value={writeTo}
              onChange={(e) => e.target.value && setWriteTo(e.target.value)}
            />
          </label>
          <button type="button" className={styles.generate} onClick={handleGenerate} disabled={busy}>
            {busy ? '生成中…' : '生成 PDF'}
          </button>
        </div>
        <p className={styles.note}>
          先按「录入时间」取词,再按「书写时间」分配。是否平均分配、排版、标题等可在右上角 ⚙ 设置 中调整。
        </p>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div
        className={styles.preview}
        style={{ padding: `${Math.round(settings.printMargin / 1.5)}px` }}
      >
        {title && <h2 className={styles.previewTitle}>{title}</h2>}
        {settings.printShowSubtitle && (
          <p className={styles.previewSub}>共 {total} 词,每日 {perDay} 词</p>
        )}
        {withContent.length === 0 ? (
          <p className={styles.previewEmpty}>所选录入时间内没有可分配的内容。</p>
        ) : (
          withContent.map((day) => (
            <div key={day.date} className={styles.previewDay}>
              <h3 className={styles.previewDayHeader}>书写日期 · {formatCN(day.date)}</h3>
              <div
                className={styles.previewGrid}
                style={{
                  gridTemplateColumns: `repeat(${settings.printColumns}, minmax(0, 1fr))`,
                  rowGap: `${settings.printRowGap}px`,
                }}
              >
                {day.entries.map((entry, i) => (
                  <div key={entry.id} className={styles.previewCell}>
                    {settings.printShowIndex && (
                      <span className={styles.previewIndex}>{i + 1}</span>
                    )}
                    <FitText
                      className={styles.previewPinyin}
                      text={entry.pinyin}
                      maxFontSize={settings.printFontSize}
                    />
                    {settings.printShowWriteSpace && <span className={styles.previewBox} />}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.reports}>
        <h3 className={styles.reportsTitle}>已生成的 PDF</h3>
        {reports.length === 0 ? (
          <p className={styles.empty}>还没有生成过。</p>
        ) : (
          <ul className={styles.list}>
            {reports.map((report) => (
              <li key={report.id} className={styles.report}>
                <span className={styles.reportRange}>
                  {formatCN(report.cycleStart)} ~ {formatCN(report.cycleEnd)} · {report.entryCount} 词
                </span>
                <a
                  className={styles.download}
                  href={reportUrl(report.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  下载
                </a>
                <button
                  type="button"
                  className={styles.printBtn}
                  onClick={() => printPdf(reportUrl(report.id))}
                >
                  打印
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteReport(report.id)}
                  style={{
                    border: '1px solid #c0392b',
                    color: '#c0392b',
                    background: 'transparent',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
