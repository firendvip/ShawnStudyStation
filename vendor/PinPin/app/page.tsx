'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addEntries,
  fetchToday,
  removeEntry,
  fetchPracticeForDate,
  fetchSettings,
  saveSettings,
  fetchMe,
  type AddResult,
} from '@/lib/api'
import type { AppSettings, AuthUser, EntryItem, PracticeDay } from '@/lib/types'
import { RecordPanel } from '@/components/record/RecordPanel'
import { TodayList } from '@/components/record/TodayList'
import { PracticeBoard } from '@/components/practice/PracticeBoard'
import { AllPanel } from '@/components/all/AllPanel'
import { PrintPanel } from '@/components/print/PrintPanel'
import { PasswordModal } from '@/components/common/PasswordModal'
import { SettingsModal } from '@/components/settings/SettingsModal'
import styles from './page.module.css'

type Tab = 'record' | 'today' | 'week' | 'all' | 'print'

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['record', '录入'],
  ['today', '今日拼拼'],
  ['week', '周拼拼'],
  ['all', '全部拼拼'],
  ['print', '打印'],
]

function countWords(days: PracticeDay[]): number {
  return days.reduce((sum, day) => sum + day.entries.length, 0)
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function HomePage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('record')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [todayEntries, setTodayEntries] = useState<EntryItem[]>([])
  const [todayPractice, setTodayPractice] = useState<PracticeDay[]>([])
  const [weekPractice, setWeekPractice] = useState<PracticeDay[]>([])
  const [revealed, setRevealed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const loadToday = useCallback(async () => {
    try {
      setTodayEntries(await fetchToday())
    } catch {
      setTodayEntries([])
    }
  }, [])
  // 今日拼拼 = 第一次书写(前一天录入,今天首写)
  const loadTodayPractice = useCallback(async () => {
    try {
      setTodayPractice(await fetchPracticeForDate(undefined, 'first'))
    } catch {
      setTodayPractice([])
    }
  }, [])
  // 周拼拼 = 第二次书写(按周÷7 分摊到今天的复写)
  const loadWeekPractice = useCallback(async () => {
    try {
      setWeekPractice(await fetchPracticeForDate(undefined, 'second'))
    } catch {
      setWeekPractice([])
    }
  }, [])

  // 启动时获取访客身份(免登录:后端会自动创建访客并种 cookie)
  useEffect(() => {
    ;(async () => {
      try {
        setUser(await fetchMe())
      } catch {
        // 拿不到用户也不阻塞页面渲染
      } finally {
        setAuthLoading(false)
      }
    })()
  }, [])

  // 取到用户后加载其数据(各步骤独立兜底,任一失败不影响其余)
  useEffect(() => {
    if (!user) {
      return
    }
    ;(async () => {
      try {
        setSettings(await fetchSettings())
      } catch {
        // 设置加载失败时保持默认,不阻塞下方拼拼数据
      }
      await Promise.all([loadToday(), loadTodayPractice(), loadWeekPractice()])
    })().catch(() => {})
  }, [user, loadToday, loadTodayPractice, loadWeekPractice])

  const switchTab = (next: Tab) => {
    // 「显示答案」为全局开关:切换标签不重置,仅手动关闭或刷新才关闭
    setTab(next)
    if (next === 'today') {
      void loadTodayPractice()
    } else if (next === 'week') {
      void loadWeekPractice()
    }
  }

  const refreshPractice = async () => {
    await Promise.all([loadTodayPractice(), loadWeekPractice()])
  }

  const handleAdd = async (texts: string[], recordDate?: string): Promise<AddResult> => {
    const result = await addEntries(texts, recordDate)
    await loadToday()
    await refreshPractice()
    return result
  }

  const handleDelete = async (id: string) => {
    await removeEntry(id)
    await loadToday()
    await refreshPractice()
  }

  // 「再次录入」:与录入页一致,录入到今天(现实日期)
  const handleRecordAgain = async (text: string) => {
    await addEntries([text])
    await loadToday()
  }

  const handleSaveSettings = async (next: AppSettings) => {
    // 实时保存:只保存与刷新,不关闭弹窗(关闭由「关闭」按钮 / 点遮罩处理)
    await saveSettings(next)
    setSettings(next)
    await refreshPractice()
  }

  if (authLoading || !user) {
    return <div className={styles.page} />
  }

  return (
    <div className={styles.page}>
      <div className={styles.tabRow}>
        <nav className={styles.tabs} aria-label="页面切换">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? styles.tabActive : styles.tab}
              onClick={() => switchTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          role="switch"
          aria-checked={revealed}
          aria-label="显示答案"
          title="显示 / 隐藏所有标签页的答案"
          onClick={() => (revealed ? setRevealed(false) : setShowPassword(true))}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: revealed ? '#007c3a' : '#71675d', whiteSpace: 'nowrap' }}>
            显示答案
          </span>
          <span
            style={{
              position: 'relative',
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              background: revealed ? '#359658' : '#d2cdc5',
              transition: 'background .2s',
              flex: '0 0 auto',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: revealed ? '20px' : '2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,.25)',
                transition: 'left .2s',
              }}
            />
          </span>
        </button>
        <button
          type="button"
          className={styles.gear}
          onClick={() => setShowSettings(true)}
          aria-label="设置"
          title="设置"
        >
          <GearIcon />
        </button>
      </div>

      <main className={styles.card}>
        {tab === 'record' && (
          <section>
            <RecordPanel
              dateEntryEnabled={settings?.dateEntryEnabled ?? true}
              onSubmit={handleAdd}
            />
            <TodayList entries={todayEntries} onDelete={handleDelete} />
          </section>
        )}

        {tab === 'today' && (
          <section>
            <div className={styles.tabHeader}>
              <span className={styles.count}>今日 共 {countWords(todayPractice)} 词</span>
            </div>
            <PracticeBoard
              days={todayPractice}
              revealed={revealed}
              showDateHeaders={false}
              emptyText="今天没有需要书写的内容。"
              pinyinFontSize={settings?.pinyinFontSize}
              answerFontSize={settings?.answerFontSize}
              onRecord={handleRecordAgain}
            />
          </section>
        )}

        {tab === 'week' && (
          <section>
            <div className={styles.tabHeader}>
              <span className={styles.count}>今日 共 {countWords(weekPractice)} 词</span>
            </div>
            <PracticeBoard
              days={weekPractice}
              revealed={revealed}
              showDateHeaders={false}
              emptyText="今天没有需要复习的内容。"
              pinyinFontSize={settings?.pinyinFontSize}
              answerFontSize={settings?.answerFontSize}
              onRecord={handleRecordAgain}
            />
          </section>
        )}

        {tab === 'all' && (
          <AllPanel
            pinyinFontSize={settings?.pinyinFontSize}
            answerFontSize={settings?.answerFontSize}
            revealed={revealed}
          />
        )}

        {tab === 'print' && settings && <PrintPanel settings={settings} />}
      </main>

      {showPassword && (
        <PasswordModal
          onClose={() => setShowPassword(false)}
          onSuccess={() => {
            setRevealed(true)
            setShowPassword(false)
          }}
        />
      )}
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  )
}
