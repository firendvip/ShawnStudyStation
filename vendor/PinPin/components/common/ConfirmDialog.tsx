'use client'

import { useRef } from 'react'
import styles from './Modal.module.css'
import dialog from './ConfirmDialog.module.css'

export type DialogTone = 'default' | 'danger'

export type ConfirmDialogProps = {
  /** 标题(可选)。 */
  title?: string
  /** 正文。支持用 \n 换行,逐行显示。 */
  message: string
  /** 确认按钮文案,默认「确定」。 */
  confirmText?: string
  /** 取消按钮文案,默认「取消」。仅 confirm 模式下显示。 */
  cancelText?: string
  /** 危险操作时确认按钮用红色。 */
  tone?: DialogTone
  /** 是否为 alert 模式(仅一个确认按钮,无取消、不可点遮罩关闭)。 */
  alertMode?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 站点风格的确认 / 提示弹窗(遮罩 + 圆角卡片 + 主题色按钮)。 */
export function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'default',
  alertMode = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const downOnOverlay = useRef(false)
  const lines = message.split('\n')
  const confirmClass = tone === 'danger' ? `${styles.primary} ${dialog.danger}` : styles.primary

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // alert 模式不允许点遮罩关闭,避免误触当作「确认」。
        if (!alertMode && e.target === e.currentTarget && downOnOverlay.current) onCancel()
      }}
    >
      <div className={styles.modal} role="alertdialog" aria-modal="true">
        {title && <h3 className={styles.title}>{title}</h3>}
        <div className={styles.lines}>
          {lines.map((line, i) => (
            <p key={i} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
        <div className={styles.actions}>
          {!alertMode && (
            <button type="button" className={styles.cancel} onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button type="button" className={confirmClass} onClick={onConfirm} autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
