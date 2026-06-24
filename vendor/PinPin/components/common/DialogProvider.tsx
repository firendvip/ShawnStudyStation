'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ConfirmDialog, type DialogTone } from './ConfirmDialog'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: DialogTone
}

export type AlertOptions = {
  title?: string
  message: string
  confirmText?: string
}

type DialogApi = {
  /** 确认框:确认 resolve(true),取消 / 点遮罩 resolve(false)。 */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** 提示框:仅一个「确定」,关闭后 resolve()。 */
  alert: (options: AlertOptions) => Promise<void>
}

type ActiveDialog = {
  kind: 'confirm' | 'alert'
  options: ConfirmOptions | AlertOptions
}

const DialogContext = createContext<DialogApi | null>(null)

/** 全局弹窗 Provider:单实例渲染当前弹窗,基于 Promise 暴露 confirm / alert。 */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null)
  // 保存当前弹窗的 resolver,关闭时调用并清空,避免「再次打开」泄漏旧 resolver。
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setActive(null)
    if (resolve) resolve(value)
  }, [])

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        // 若已有未结算的弹窗,先以 false 结算旧的,防止 resolver 泄漏。
        if (resolverRef.current) resolverRef.current(false)
        resolverRef.current = resolve
        setActive({ kind: 'confirm', options })
      }),
    [],
  )

  const alert = useCallback(
    (options: AlertOptions): Promise<void> =>
      new Promise<void>((resolve) => {
        if (resolverRef.current) resolverRef.current(false)
        resolverRef.current = () => resolve()
        setActive({ kind: 'alert', options })
      }),
    [],
  )

  const api = useMemo<DialogApi>(() => ({ confirm, alert }), [confirm, alert])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {active && (
        <ConfirmDialog
          title={active.options.title}
          message={active.options.message}
          confirmText={active.options.confirmText}
          cancelText={
            active.kind === 'confirm' ? (active.options as ConfirmOptions).cancelText : undefined
          }
          tone={active.kind === 'confirm' ? (active.options as ConfirmOptions).tone : 'default'}
          alertMode={active.kind === 'alert'}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </DialogContext.Provider>
  )
}

/** 取得全局弹窗 API:const { confirm, alert } = useDialog()。 */
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog 必须在 <DialogProvider> 内使用')
  return ctx
}
