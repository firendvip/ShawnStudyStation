import { clearSessionCookie } from '@/lib/auth'
import { ok } from '@/lib/http'

/** 退出登录:销毁会话并清除 cookie。 */
export async function POST() {
  const res = ok({ success: true })
  await clearSessionCookie(res)
  return res
}
