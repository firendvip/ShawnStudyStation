'use client'

import { useRef, useState } from 'react'
import { buildDefaultSettings, MAX_FONT_SIZE, MIN_FONT_SIZE, type AppSettings } from '@/lib/types'
import styles from './SettingsModal.module.css'

type Props = {
  settings: AppSettings
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

/** 设置:修改即实时保存(无「取消/保存」按钮)。 */
export function SettingsModal({ settings, onClose, onSave }: Props) {
  const [form, setForm] = useState<AppSettings>(settings)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downOnOverlay = useRef(false)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // 修改即自动保存(防抖,避免拖动滑块时频繁请求)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onSave(next), 350)
      return next
    })

  const handleRestoreDefaults = () => {
    if (!window.confirm('确定要恢复默认设置吗?当前设置将被覆盖。')) {
      return
    }
    const defaults = buildDefaultSettings(form.cycleStartDate)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setForm(defaults)
    onSave(defaults)
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnOverlay.current) onClose()
      }}
    >
      <div className={styles.modal}>
        <h3 className={styles.title}>设置</h3>

        {/* ===== 通用 ===== */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>通用</h4>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="startDate" className={styles.label}>
                周期起始日
              </label>
              <input
                id="startDate"
                type="date"
                className={styles.input}
                value={form.cycleStartDate}
                onChange={(e) => e.target.value && set('cycleStartDate', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>屏幕拼音字号:{form.pinyinFontSize}px</label>
              <input
                className={styles.range}
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={form.pinyinFontSize}
                onChange={(e) => set('pinyinFontSize', Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>屏幕答案字号:{form.answerFontSize}px</label>
              <input
                className={styles.range}
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={form.answerFontSize}
                onChange={(e) => set('answerFontSize', Number(e.target.value))}
              />
            </div>
          </div>
          <div className={styles.switchGroup}>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.dateEntryEnabled}
                onChange={(e) => set('dateEntryEnabled', e.target.checked)}
              />
              <span>开启日期录入(录入页可选择任意日期)</span>
            </label>
          </div>
        </div>

        {/* ===== 打印设置 ===== */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>打印设置</h4>
          <p className={styles.sectionHint}>以下设置仅用于「打印」页生成的 PDF。</p>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label}>默认打印天数:{form.printDays} 天</label>
              <input
                className={styles.range}
                type="range"
                min={1}
                max={31}
                value={form.printDays}
                onChange={(e) => set('printDays', Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>每行列数:{form.printColumns}</label>
              <input
                className={styles.range}
                type="range"
                min={1}
                max={10}
                value={form.printColumns}
                onChange={(e) => set('printColumns', Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>拼音字号:{form.printFontSize}</label>
              <input
                className={styles.range}
                type="range"
                min={8}
                max={40}
                value={form.printFontSize}
                onChange={(e) => set('printFontSize', Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>行间距:{form.printRowGap}</label>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={60}
                value={form.printRowGap}
                onChange={(e) => set('printRowGap', Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>页边距:{form.printMargin}</label>
              <input
                className={styles.range}
                type="range"
                min={10}
                max={80}
                value={form.printMargin}
                onChange={(e) => set('printMargin', Number(e.target.value))}
              />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="printTitle" className={styles.label}>
                打印标题
              </label>
              <input
                id="printTitle"
                type="text"
                className={styles.input}
                value={form.printTitle}
                onChange={(e) => set('printTitle', e.target.value)}
              />
            </div>
          </div>
          <div className={styles.switchGroup}>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printShowIndex}
                onChange={(e) => set('printShowIndex', e.target.checked)}
              />
              <span>显示序号</span>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printShowWriteSpace}
                onChange={(e) => set('printShowWriteSpace', e.target.checked)}
              />
              <span>写字空位</span>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printShowTitle}
                onChange={(e) => set('printShowTitle', e.target.checked)}
              />
              <span>打印时显示标题</span>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printAppendDate}
                onChange={(e) => set('printAppendDate', e.target.checked)}
              />
              <span>标题尾部加上日期</span>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printShowSubtitle}
                onChange={(e) => set('printShowSubtitle', e.target.checked)}
              />
              <span>打印时显示副标题(共 X 词,每日 Y 词)</span>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={form.printEvenDistribute}
                onChange={(e) => set('printEvenDistribute', e.target.checked)}
              />
              <span>所选范围内容平均分配到每一天(先录先写)</span>
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.restore} onClick={handleRestoreDefaults}>
            恢复默认设置
          </button>
          <button type="button" className={styles.primary} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
