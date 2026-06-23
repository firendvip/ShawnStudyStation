'use client'

import { useRef, type MouseEvent } from 'react'

/**
 * 遮罩层「点击空白处关闭」的安全实现。
 * 仅当 mousedown 与 click 都发生在遮罩本身时才关闭，
 * 避免用户在弹窗输入框内按住左键拖拽选词、mouseup 落在遮罩上时误关闭弹窗。
 * 将返回值展开到遮罩元素上：<div {...useOverlayClose(onClose)} />
 */
export function useOverlayClose(onClose: () => void) {
  const downOnOverlayRef = useRef(false)

  return {
    onMouseDown: (e: MouseEvent) => {
      downOnOverlayRef.current = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent) => {
      if (downOnOverlayRef.current && e.target === e.currentTarget) {
        onClose()
      }
      downOnOverlayRef.current = false
    },
  }
}
