'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchAllEntries,
  addEntries,
  updateEntry,
  removeEntry,
} from '@/lib/api'
import { parseWords } from '@/lib/parseWords'
import { addDays, writeDateFor, todayLocalDate, formatCN } from '@/lib/date'
import type { EntryItem, PracticeDay } from '@/lib/types'
import { PracticeBoard } from '@/components/practice/PracticeBoard'
import { PasswordModal } from '@/components/common/PasswordModal'
import styles from './AllPanel.module.css'

type Props = {
  pinyinFontSize?: number
  answerFontSize?: number
}

/** 按录入日期分组(date=书写日期=录入+1),新→旧。 */
function groupByWriteDate(entries: EntryItem[]): PracticeDay[] {
  const map = new Map<string, EntryItem[]>()
  for (const entry of entries) {
    const list = map.get(entry.recordDate) ?? []
    list.push(entry)
    map.set(entry.recordDate, list)
  }
  return [...map.entries()].map(([recordDate, items]) => ({
    date: writeDateFor(recordDate),
    entries: items,
  }))
}

/** 全部拼拼:展示所有录入(按书写日期新→旧),编辑(密码)后可增删改。 */
export function AllPanel({ pinyinFontSize, answerFontSize }: Props) {
  const [entries, setEntries] = useState<EntryItem[]>([])
  const [editing, setEditing] = useState(false)
  const [answersRevealed, setAnswersRevealed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showViewPassword, setShowViewPassword] = useState(false)
  const [addText, setAddText] = useState('')
  const [writeDate, setWriteDate] = useState(writeDateFor(todayLocalDate()))

  const load = useCallback(async () => {
    setEntries(await fetchAllEntries())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await load()
      } catch {
        // 忽略加载失败
      }
    })()
  }, [load])

  const handleEditCommit = async (id: string, text: string) => {
    try {
      await updateEntry(id, text)
      await load()
    } catch (error) {
      alert(error instanceof Error ? error.message : '修改失败')
    }
  }

  const handleDelete = async (id: string) => {
    await removeEntry(id)
    await load()
  }

  const handleAdd = async () => {
    const words = parseWords(addText)
    if (words.length === 0) {
      return
    }
    try {
      // 录入书写日期 → 实际录入日期 = 书写日期 - 1
      await addEntries(words, addDays(writeDate, -1))
      setAddText('')
      await load()
    } catch (error) {
      alert(error instanceof Error ? error.message : '添加失败')
    }
  }

  const groups = groupByWriteDate(entries)

  const today = todayLocalDate()
  const tomorrow = addDays(today, 1)
  const dayLabel = (date: string): string => {
    if (date === today) return `今日  ${formatCN(date)}`
    if (date === tomorrow) return `明日  ${formatCN(date)}`
    return formatCN(date)
  }

  return (
    <section>
      <div className={styles.header}>
        <span className={styles.count}>共 {entries.length} 词</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.editBtn}
            onClick={() =>
              answersRevealed ? setAnswersRevealed(false) : setShowViewPassword(true)
            }
          >
            {answersRevealed ? '隐藏答案' : '查看答案'}
          </button>
          <button
            type="button"
            className={styles.editBtn}
            onClick={() => (editing ? setEditing(false) : setShowPassword(true))}
          >
            {editing ? '完成编辑' : '编辑'}
          </button>
        </div>
      </div>

      {editing && (
        <div className={styles.addBox}>
          <label className={styles.dateRow}>
            <span className={styles.dateLabel}>录入书写日期</span>
            <input
              type="date"
              className={styles.dateInput}
              value={writeDate}
              onChange={(e) => e.target.value && setWriteDate(e.target.value)}
            />
          </label>
          <div className={styles.addRow}>
            <input
              className={styles.addInput}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="输入字词(可用空格 / 标点分隔多个)"
              aria-label="添加字词"
            />
            <button type="button" className={styles.addBtn} onClick={handleAdd}>
              添加
            </button>
          </div>
        </div>
      )}

      <PracticeBoard
        days={groups}
        revealed={editing || answersRevealed}
        showDateHeaders
        editable={editing}
        onEditCommit={handleEditCommit}
        onDelete={handleDelete}
        emptyText="还没有任何录入。"
        pinyinFontSize={pinyinFontSize}
        answerFontSize={answerFontSize}
        formatDayLabel={dayLabel}
      />

      {showViewPassword && (
        <PasswordModal
          onClose={() => setShowViewPassword(false)}
          onSuccess={() => {
            setAnswersRevealed(true)
            setShowViewPassword(false)
          }}
        />
      )}
      {showPassword && (
        <PasswordModal
          onClose={() => setShowPassword(false)}
          onSuccess={() => {
            setEditing(true)
            setShowPassword(false)
          }}
        />
      )}
    </section>
  )
}
