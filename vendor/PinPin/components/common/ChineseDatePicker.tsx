'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { todayLocalDate, formatCNFull, formatCN } from '@/lib/date'
import styles from './ChineseDatePicker.module.css'

type Props = {
  /** 当前值，YYYY-MM-DD */
  value: string
  /** 选择新日期后回调，next 为 YYYY-MM-DD */
  onChange: (next: string) => void
  /** 可选下限，YYYY-MM-DD（含） */
  min?: string
  /** 可选上限，YYYY-MM-DD（含） */
  max?: string
  /** pill 是否只显示「年月日」而不带星期（范围端点用） */
  compact?: boolean
  className?: string
  'aria-label'?: string
}

const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD → 「2026年7月1日 星期三」（compact 时去掉星期）。 */
function pillLabel(dateStr: string, compact: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '选择日期'
  const [y] = dateStr.split('-').map(Number)
  // formatCN → 「M月D日」，formatCNFull → 「M月D日 星期X」；前面补年份
  return compact ? `${y}年${formatCN(dateStr)}` : `${y}年${formatCNFull(dateStr)}`
}

/**
 * 中文日期选择器：圆角 pill 触发按钮 + 自绘中文日历弹层。
 * 对外仍以 YYYY-MM-DD 字符串交互，可直接替换原生 <input type="date">。
 */
export function ChineseDatePicker({
  value,
  onChange,
  min,
  max,
  compact = false,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = todayLocalDate()
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today
  const [vy0, vm0] = safeValue.split('-').map(Number)

  // 当前查看的年月（0-based month）
  const [viewYear, setViewYear] = useState(vy0)
  const [viewMonth, setViewMonth] = useState(vm0 - 1)

  // 打开时把视图对齐到当前值所在月
  useEffect(() => {
    if (open) {
      const [y, m] = safeValue.split('-').map(Number)
      setViewYear(y)
      setViewMonth(m - 1)
    }
  }, [open, safeValue])

  // 点击外部 / ESC 关闭
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const list: Array<{ date: string; day: number } | null> = []
    for (let i = 0; i < firstDay; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ date: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`, day: d })
    }
    return list
  }, [viewYear, viewMonth])

  const isDisabled = (date: string): boolean =>
    (min !== undefined && date < min) || (max !== undefined && date > max)

  const shiftMonth = (delta: number) => {
    let y = viewYear
    let m = viewMonth + delta
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewYear(y)
    setViewMonth(m)
  }

  const pick = (date: string) => {
    if (isDisabled(date)) return
    onChange(date)
    setOpen(false)
  }

  const goToday = () => {
    const [y, m] = today.split('-').map(Number)
    setViewYear(y)
    setViewMonth(m - 1)
    if (!isDisabled(today)) {
      onChange(today)
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ''}`}>
      <button
        type="button"
        className={`${styles.pill} ${open ? styles.open : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? '选择日期'}
      >
        <span>{pillLabel(safeValue, compact)}</span>
        <span className={styles.chev} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="日历">
          <div className={styles.head}>
            <button
              type="button"
              className={styles.nav}
              onClick={() => shiftMonth(-1)}
              aria-label="上个月"
            >
              ‹
            </button>
            <span className={styles.title}>
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              type="button"
              className={styles.nav}
              onClick={() => shiftMonth(1)}
              aria-label="下个月"
            >
              ›
            </button>
          </div>

          <div className={styles.grid}>
            {WEEK_HEADERS.map((w) => (
              <div key={w} className={styles.wk}>
                {w}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (!cell) return <div key={`e${i}`} className={styles.cell} />
              const disabled = isDisabled(cell.date)
              const classes = [styles.day]
              if (cell.date === safeValue) classes.push(styles.selected)
              if (cell.date === today) classes.push(styles.today)
              return (
                <div key={cell.date} className={styles.cell}>
                  <button
                    type="button"
                    className={classes.join(' ')}
                    onClick={() => pick(cell.date)}
                    disabled={disabled}
                    aria-label={pillLabel(cell.date, false)}
                    aria-current={cell.date === safeValue ? 'date' : undefined}
                  >
                    {cell.day}
                  </button>
                </div>
              )
            })}
          </div>

          <div className={styles.foot}>
            <button type="button" className={styles.todayBtn} onClick={goToday}>
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
