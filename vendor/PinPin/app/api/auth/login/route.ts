import { verifyLoginCode, setSessionCookie, getCurrentUser } from '@/lib/auth'
import { loginSchema } from '@/lib/validation'
import { ok, fail, getClientIp } from '@/lib/http'
import { rateLimit } from '@/lib/rateLimit'

/** 手机号 + 验证码登录;若当前是访客,会把访客数据并入登录账号。 */
export async function POST(request: Request) {
  if (!rateLimit(`auth-login:${getClientIp(request)}`, 10, 60_000)) {
    return fail('尝试过于频繁,请稍后再试', 429)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数错误', 400)
  }
  try {
    const current = await getCurrentUser()
    const guestUserId = current?.isGuest ? current.id : undefined
    const result = await verifyLoginCode(parsed.data.phone, parsed.data.code, guestUserId)
    if (!result) {
      return fail('验证码错误或已过期', 401)
    }
    const res = ok({ user: result.user })
    setSessionCookie(res, result.token)
    return res
  } catch (error) {
    console.error('[auth:login] 失败', error)
    return fail('登录失败,请稍后再试', 500)
  }
}
