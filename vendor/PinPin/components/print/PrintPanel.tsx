'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchReports, fetchPracticeForRange, generateManualReport, reportUrl } from '@/lib/api'
import { addDays, formatCN, todayLocalDate } from '@/lib/date'
import { evenlyDistribute } from '@/lib/distribute'
import { FitText } from '@/components/common/FitText'
import type { AppSettings, PdfReportItem, PracticeDay } from '@/lib/types'
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

/** 打印:选开始/结束时间(书写日期)+ 生成 PDF;排版来自「设置」。 */
export function PrintPanel({ settings }: Props) {
  const today = todayLocalDate()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, Math.max(1, settings.printDays) - 1))
  const [natural, setNatural] = useState<PracticeDay[]>([])
  const [reports, setReports] = useState<PdfReportItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = settings.printShowTitle
    ? settings.printTitle + (settings.printAppendDate ? ` ${formatCN(from)}-${formatCN(to)}` : '')
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
    fetchPracticeForRange(from, to).then(setNatural).catch(() => setNatural([]))
  }, [from, to])

  const distributed = settings.printEvenDistribute
    ? evenlyDistribute(natural.flatMap((d) => d.entries), from, to)
    : natural
  const withContent = distributed.filter((d) => d.entries.length > 0)
  const total = withContent.reduce((sum, d) => sum + d.entries.length, 0)
  const counts = withContent.map((d) => d.entries.length)
  const perDay = counts.length === 0
    ? '0'
    : Math.min(...counts) === Math.max(...counts)
      ? `${Math.min(...counts)}`
      : `${Math.min(...counts)}-${Math.max(...counts)}`

  const handleGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await generateManualReport(from, to, {
        title,
        columns: settings.printColumns,
        fontSize: settings.printFontSize,
        margin: settings.printMargin,
        rowGap: settings.printRowGap,
        showIndex: settings.printShowIndex,
        showWriteSpace: settings.printShowWriteSpace,
        showSubtitle: settings.printShowSubtitle,
        evenDistribute: settings.printEvenDistribute,
      })
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
            <span className={styles.label}>开始时间</span>
            <input
              type="date"
              className={styles.input}
              value={from}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>结束时间</span>
            <input
              type="date"
              className={styles.input}
              value={to}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
          <button type="button" className={styles.generate} onClick={handleGenerate} disabled={busy}>
            {busy ? '生成中…' : '生成 PDF'}
          </button>
        </div>
        <p className={styles.note}>
          打印的排版、标题、是否平均分配等,可在右上角 ⚙ 设置 中调整。
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
          <p className={styles.previewEmpty}>所选日期内没有需要书写的内容。</p>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
