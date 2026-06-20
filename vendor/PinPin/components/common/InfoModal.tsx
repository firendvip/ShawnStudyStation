'use client'

import styles from './Modal.module.css'

type Props = {
  title: string
  lines: string[]
  onClose: () => void
}

/** 通用信息弹窗(逐行展示)。 */
export function InfoModal({ title, lines, onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.lines}>
          {lines.map((line, i) => (
            <p key={i} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
