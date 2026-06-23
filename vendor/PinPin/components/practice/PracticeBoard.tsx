'use client'

import { useState } from 'react'
import { formatCN } from '@/lib/date'
import { FitText } from '@/components/common/FitText'
import type { EntryItem, PracticeDay } from '@/lib/types'
import styles from './PracticeBoard.module.css'

type CellProps = {
  index: number
  pinyin: string
  text: string
  revealed: boolean
  pinyinFontSize?: number
  answerFontSize?: number
  onRecord?: (text: string) => void | Promise<void>
}

function PracticeCell({
  index,
  pinyin,
  text,
  revealed,
  pinyinFontSize,
  answerFontSize,
  onRecord,
}: CellProps) {
  const [recorded, setRecorded] = useState(false)

  const handleRecord = async () => {
    if (!onRecord) {
      return
    }
    if (!recorded) {
      await onRecord(text)
      setRecorded(true)
    } else {
      setRecorded(false)
    }
  }

  return (
    <div className={styles.cell}>
      <span className={styles.index}>{index}</span>
      <FitText className={styles.pinyin} text={pinyin} maxFontSize={pinyinFontSize ?? 20} />
      {revealed && (
        <span className={styles.answer}>
          <FitText text={text} maxFontSize={answerFontSize ?? 18} />
        </span>
      )}
      {revealed && onRecord && (
        <button
          type="button"
          className={recorded ? styles.recorded : styles.recordBtn}
          onClick={handleRecord}
        >
          {recorded ? '已再次录入' : '再次录入'}
        </button>
      )}
    </div>
  )
}

type EditCellProps = {
  index: number
  entry: EntryItem
  onCommit: (id: string, text: string) => void
  onDelete: (id: string) => void
}

function EditableCell({ index, entry, onCommit, onDelete }: EditCellProps) {
  const [text, setText] = useState(entry.text)

  const commit = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setText(entry.text)
      return
    }
    if (trimmed !== entry.text) {
      onCommit(entry.id, trimmed)
    }
  }

  return (
    <div className={styles.cell}>
      <span className={styles.index}>{index}</span>
      <button
        type="button"
        className={styles.del}
        onClick={() => onDelete(entry.id)}
        aria-label={`删除 ${entry.text}`}
      >
        ×
      </button>
      <FitText className={styles.pinyin} text={entry.pinyin} maxFontSize={20} />
      <input
        className={styles.editInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="修改字词"
      />
    </div>
  )
}

type Props = {
  days: PracticeDay[]
  revealed: boolean
  showDateHeaders: boolean
  emptyText: string
  editable?: boolean
  onEditCommit?: (id: string, text: string) => void
  onDelete?: (id: string) => void
  onDeleteDay?: (day: PracticeDay) => void
  pinyinFontSize?: number
  answerFontSize?: number
  onRecord?: (text: string) => void | Promise<void>
  formatDayLabel?: (date: string) => string
}

/** 拼音测验板:拼音在上,字词在下(默认隐藏)。编辑模式下字词可改可删。 */
export function PracticeBoard({
  days,
  revealed,
  showDateHeaders,
  emptyText,
  editable = false,
  onEditCommit,
  onDelete,
  onDeleteDay,
  pinyinFontSize,
  answerFontSize,
  onRecord,
  formatDayLabel,
}: Props) {
  const withContent = days.filter((day) => day.entries.length > 0)
  if (withContent.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>
  }

  return (
    <div className={styles.board}>
      {withContent.map((day) => (
        <div key={day.date} className={styles.day}>
          {showDateHeaders && (
            <h3
              className={styles.dayHeader}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
            >
              <span>{(formatDayLabel ?? formatCN)(day.date)}</span>
              {editable && onDeleteDay && (
                <button
                  type="button"
                  onClick={() => onDeleteDay(day)}
                  style={{
                    border: '1px solid #c0392b',
                    color: '#c0392b',
                    background: 'transparent',
                    borderRadius: '999px',
                    padding: '2px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flex: '0 0 auto',
                  }}
                >
                  删除整天
                </button>
              )}
            </h3>
          )}
          <div className={styles.grid}>
            {day.entries.map((entry, i) =>
              editable ? (
                <EditableCell
                  key={entry.id}
                  index={i + 1}
                  entry={entry}
                  onCommit={onEditCommit ?? (() => {})}
                  onDelete={onDelete ?? (() => {})}
                />
              ) : (
                <PracticeCell
                  key={entry.id}
                  index={i + 1}
                  pinyin={entry.pinyin}
                  text={entry.text}
                  revealed={revealed}
                  pinyinFontSize={pinyinFontSize}
                  answerFontSize={answerFontSize}
                  onRecord={onRecord}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
