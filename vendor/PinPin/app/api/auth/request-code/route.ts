import { requestLoginCode } from '@/lib/auth'
import { requestCodeSchema } from '@/lib/validation'
import { ok, fail, getClientIp } from '@/lib/http'
import { rateLimit } from '@/lib/rateLimit'

/** 请求短信验证码(演示模式下直接返回 demoCode)。 */
export async function POST(request: Request) {
  if (!rateLimit(`auth-code:${getClientIp(request)}`, 5, 60_000)) {
    return fail('请求过于频繁,请稍后再试', 429)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }
  const parsed = requestCodeSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数错误', 400)
  }
  try {
    return ok(await requestLoginCode(parsed.data.phone))
  } catch (error) {
    console.error('[auth:request-code] 失败', error)
    return fail('发送失败,请稍后再试', 500)
  }
}
