'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchAllEntries, addEntries, updateEntry, removeEntry } from '@/lib/api'
import { parseWords } from '@/lib/parseWords'
import { todayLocalDate, formatCN } from '@/lib/date'
import type { EntryItem, PracticeDay } from '@/lib/types'
import { PracticeBoard } from '@/components/practice/PracticeBoard'
import { PasswordModal } from '@/components/common/PasswordModal'
import { ChineseDatePicker } from '@/components/common/ChineseDatePicker'
import { useDialog } from '@/components/common/DialogProvider'
import styles from './AllPanel.module.css'

type Props = {
  pinyinFontSize?: number
  answerFontSize?: number
  /** 由「显示答案」全局开关控制是否显示字词答案。 */
  revealed?: boolean
}

/** 按录入日期分组(新→旧)。 */
function groupByRecordDate(entries: EntryItem[]): PracticeDay[] {
  const map = new Map<string, EntryItem[]>()
  for (const entry of entries) {
    const list = map.get(entry.recordDate) ?? []
    list.push(entry)
    map.set(entry.recordDate, list)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([recordDate, items]) => ({ date: recordDate, entries: items }))
}

/** 全部拼拼:展示所有录入(按录入日期新→旧),编辑(密码)后可增删改。 */
export function AllPanel({ pinyinFontSize, answerFontSize, revealed = false }: Props) {
  const [entries, setEntries] = useState<EntryItem[]>([])
  const [editing, setEditing] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [addText, setAddText] = useState('')
  const [recordDate, setRecordDate] = useState(todayLocalDate())
  const { confirm, alert } = useDialog()

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

  const today = todayLocalDate()
  const dayLabel = (date: string): string =>
    `录入日期 · ${formatCN(date)}${date === today ? ' (今日)' : ''}`

  const handleEditCommit = async (id: string, text: string) => {
    try {
      await updateEntry(id, text)
      await load()
    } catch (error) {
      await alert({ message: error instanceof Error ? error.message : '修改失败' })
    }
  }

  const handleDelete = async (id: string) => {
    await removeEntry(id)
    await load()
  }

  /** 删除某一天的全部字词(先弹确认框)。 */
  const handleDeleteDay = async (day: PracticeDay) => {
    if (day.entries.length === 0) return
    const ok = await confirm({
      message: `确定删除「${dayLabel(day.date)}」这一天的全部 ${day.entries.length} 个字词吗?\n删除后无法恢复。`,
      tone: 'danger',
    })
    if (!ok) return
    try {
      for (const entry of day.entries) {
        await removeEntry(entry.id)
      }
      await load()
    } catch (error) {
      await alert({ message: error instanceof Error ? error.message : '删除失败' })
    }
  }

  const handleAdd = async () => {
    const words = parseWords(addText)
    if (words.length === 0) {
      return
    }
    try {
      // 直接按所填「录入日期」保存
      await addEntries(words, recordDate)
      setAddText('')
      await load()
    } catch (error) {
      await alert({ message: error instanceof Error ? error.message : '添加失败' })
    }
  }

  const groups = groupByRecordDate(entries)

  return (
    <section>
      <div className={styles.header}>
        <span className={styles.count}>共 {entries.length} 词</span>
        <div className={styles.headerActions}>
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
            <span className={styles.dateLabel}>录入日期</span>
            <ChineseDatePicker
              value={recordDate}
              onChange={(next) => next && setRecordDate(next)}
              aria-label="录入日期"
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
        revealed={editing || revealed}
        showDateHeaders
        editable={editing}
        onEditCommit={handleEditCommit}
        onDelete={handleDelete}
        onDeleteDay={handleDeleteDay}
        emptyText="还没有任何录入。"
        pinyinFontSize={pinyinFontSize}
        answerFontSize={answerFontSize}
        formatDayLabel={dayLabel}
      />

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
