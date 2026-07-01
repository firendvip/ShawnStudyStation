'use client'

import { useState } from 'react'
import { parseWords } from '@/lib/parseWords'
import { InfoModal } from '@/components/common/InfoModal'
import { ChineseDatePicker } from '@/components/common/ChineseDatePicker'
import { todayLocalDate } from '@/lib/date'
import type { AddResult } from '@/lib/api'
import styles from './RecordPanel.module.css'

type Props = {
  dateEntryEnabled: boolean
  onSubmit: (texts: string[], recordDate?: string) => Promise<AddResult>
}

const PLACEHOLDER = '可一次输入多个(换行 / 空格 / 标点分隔)。'

const HELP_LINES = [
  '1️⃣ 录入小朋友写错的字词。',
  '2️⃣ 建议使用语音转文字的输入法。',
  '3️⃣ 可一次输入多个(换行 / 空格 / 标点分隔)。',
  '4️⃣ 点「添加」存入。',
  '5️⃣ 如果个别字词录入有误,可在下方进行删除后重录。',
  '6️⃣ 可随时在「全部拼拼」处进行增删改查。',
  '7️⃣ 系统会自动去重,同一字词在同一天内只会被录入一次。',
]

/** 录入区:文本域 + 右下角「添加」按钮。可选「日期录入」选择任意日期。 */
export function RecordPanel({ dateEntryEnabled, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const [recordDate, setRecordDate] = useState(todayLocalDate())
  const [message, setMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleSubmit = async () => {
    const words = parseWords(value)
    if (words.length === 0 || isBusy) {
      return
    }
    setIsBusy(true)
    setMessage(null)
    try {
      const result = await onSubmit(words, dateEntryEnabled ? recordDate : undefined)
      const parts: string[] = []
      if (result.added.length > 0) {
        parts.push(`已添加 ${result.added.length} 条`)
      }
      if (result.duplicates.length > 0) {
        parts.push(`已重复:${result.duplicates.join('、')}`)
      }
      setMessage(parts.join(' · ') || '没有新增内容')
      setValue('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '添加失败')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>录入写错的字词</h2>
        <button
          type="button"
          className={styles.help}
          onClick={() => setShowHelp(true)}
          aria-label="说明"
        >
          ?
        </button>
      </div>

      {dateEntryEnabled && (
        <label className={styles.dateRow}>
          <span className={styles.dateLabel}>录入日期</span>
          <ChineseDatePicker
            value={recordDate}
            onChange={(next) => next && setRecordDate(next)}
            aria-label="录入日期"
          />
        </label>
      )}

      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={7}
        aria-label="录入字词"
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.add}
          onClick={handleSubmit}
          disabled={isBusy}
        >
          添加
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {showHelp && (
        <InfoModal title="录入说明" lines={HELP_LINES} onClose={() => setShowHelp(false)} />
      )}
    </section>
  )
}
