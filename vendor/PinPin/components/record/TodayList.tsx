'use client'

import type { EntryItem } from '@/lib/types'
import styles from './TodayList.module.css'

type Props = {
  entries: EntryItem[]
  onDelete: (id: string) => void
}

/** 今天已录入的字词(简单卡片,可删除)。 */
export function TodayList({ entries, onDelete }: Props) {
  if (entries.length === 0) {
    return null
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.item}>
          <span className={styles.text}>{entry.text}</span>
          <span className={styles.pinyin}>{entry.pinyin}</span>
          <button
            type="button"
            className={styles.del}
            onClick={() => onDelete(entry.id)}
            aria-label={`删除 ${entry.text}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
