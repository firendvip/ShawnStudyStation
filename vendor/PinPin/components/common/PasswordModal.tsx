'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './Modal.module.css'

type Props = {
  onClose: () => void
  onSuccess: () => void
}

/** 未登录(直接打开子页面)时的回退密码。登录后改用账号登录密码,由主站校验。 */
const FALLBACK_PASSWORD = '1234'

/**
 * 查看答案密码框:密码 = 账号登录密码(由主站通过 postMessage 校验)。
 * 输入正确即自动解锁(类 Windows 登录),无需点「确定」。
 */
export function PasswordModal({ onClose, onSuccess }: Props) {
  const [value, setValue] = useState('')
  const reqRef = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downOnOverlay = useRef(false)
  const embedded = typeof window !== 'undefined' && window.parent !== window

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; reqId?: number; ok?: boolean } | null
      if (!d || d.type !== 'pinpin-verify-pw-result' || d.reqId !== reqRef.current) return
      if (d.ok) onSuccess()
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onSuccess])

  function check(next: string) {
    if (!next) return
    if (embedded) {
      const id = ++reqRef.current
      window.parent.postMessage({ type: 'pinpin-verify-pw', value: next, reqId: id }, '*')
    } else if (next === FALLBACK_PASSWORD) {
      onSuccess()
    }
  }

  function handleChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    // 极短防抖,配合主站「登录密码预加载」做到正确即瞬间解锁
    timer.current = setTimeout(() => check(next), 60)
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
        <h3 className={styles.title}>请输入密码</h3>
        <input
          type="password"
          className={styles.input}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="账号登录密码"
          autoFocus
        />
      </div>
    </div>
  )
}
