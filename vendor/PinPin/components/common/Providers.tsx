'use client'

import { DialogProvider } from './DialogProvider'

/** 全局客户端 Provider 包装器,在根 layout 中包裹 children(layout 保持 Server Component)。 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <DialogProvider>{children}</DialogProvider>
}
