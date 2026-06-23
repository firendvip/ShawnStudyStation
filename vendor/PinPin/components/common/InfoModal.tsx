'use client'

import styles from './Modal.module.css'
import { useOverlayClose } from './useOverlayClose'

type Props = {
  title: string
  lines: string[]
  onClose: () => void
}

/** 通用信息弹窗(逐行展示)。 */
export function InfoModal({ title, lines, onClose }: Props) {
  const overlayProps = useOverlayClose(onClose)

  return (
    <div className={styles.overlay} {...overlayProps}>
      <div className={styles.modal}>
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
