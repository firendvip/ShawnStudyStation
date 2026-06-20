'use client'

import { useState } from 'react'
import { requestCode, login } from '@/lib/api'
import styles from './LoginModal.module.css'

type Props = {
  onClose: () => void
  onSuccess: () => void
}

const PHONE_RE = /^1[3-9]\d{9}$/

/** 登录/同步弹窗:手机号 + 验证码(演示模式直接显示验证码)。 */
export function LoginModal({ onClose, onSuccess }: Props) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCooldown = () => {
    setCooldown(60)
    const id = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(id)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const handleRequestCode = async () => {
    if (!PHONE_RE.test(phone)) {
      setError('请输入有效的手机号')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { demoCode: dc } = await requestCode(phone)
      setDemoCode(dc ?? null)
      startCooldown()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async () => {
    if (!PHONE_RE.test(phone)) {
      setError('请输入有效的手机号')
      return
    }
    if (!code) {
      setError('请输入验证码')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(phone, code)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>登录 / 同步</h3>
        <p className={styles.subtitle}>登录后数据会保存到账号,换设备登录即可同步。</p>

        <input
          className={styles.input}
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="请输入手机号"
          aria-label="手机号"
        />

        <div className={styles.codeRow}>
          <input
            className={styles.input}
            type="tel"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="验证码"
            aria-label="验证码"
          />
          <button
            type="button"
            className={styles.codeBtn}
            onClick={handleRequestCode}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
          </button>
        </div>

        {demoCode && (
          <p className={styles.demo}>
            演示验证码:<b>{demoCode}</b>(未接入真实短信,自动显示)
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            取消
          </button>
          <button type="button" className={styles.loginBtn} onClick={handleLogin} disabled={busy}>
            {busy ? '请稍候…' : '登录 / 注册'}
          </button>
        </div>
        <p className={styles.hint}>未注册的手机号将自动创建账号,并把当前数据并入。</p>
      </div>
    </div>
  )
}
