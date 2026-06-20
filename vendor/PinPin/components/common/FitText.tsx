'use client'

import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  text: string
  maxFontSize: number
  className?: string
  minFontSize?: number
}

/** 单行显示文本;过宽时自动缩小字号以放进父容器,绝不换行。 */
export function FitText({ text, maxFontSize, className, minFontSize = 8 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(maxFontSize)

  // 每次渲染都重新测量,以适配列数/容器宽度变化(依赖数组会漏掉布局变化,故有意省略)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) {
      return
    }
    const available = parent.clientWidth
    let next = maxFontSize
    el.style.fontSize = `${next}px`
    while (next > minFontSize && el.scrollWidth > available) {
      next -= 1
      el.style.fontSize = `${next}px`
    }
    if (next !== size) {
      setSize(next)
    }
  })

  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontSize: `${size}px`,
        whiteSpace: 'nowrap',
        display: 'inline-block',
        maxWidth: '100%',
      }}
    >
      {text}
    </span>
  )
}
