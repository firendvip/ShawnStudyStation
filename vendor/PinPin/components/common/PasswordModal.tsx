'use client'

import { useState } from 'react'
import styles from './Modal.module.css'

const PASSWORD = '1234'

type Props = {
  onClose: () => void
  onSuccess: () => void
}

/** 查看答案密码框,密码 1234。 */
export function PasswordModal({ onClose, onSuccess }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const submit = () => {
    if (value === PASSWORD) {
      onSuccess()
    } else {
      setError(true)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>请输入密码</h3>
        <input
          type="password"
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="密码"
          autoFocus
        />
        {error && <p className={styles.error}>密码不正确</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            取消
          </button>
          <button type="button" className={styles.primary} onClick={submit}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
