import { getOrCreateUser } from '@/lib/auth'
import { ok, fail } from '@/lib/http'

/** 返回当前用户;未登录则自动创建访客身份并种 cookie(免登录可用)。 */
export async function GET() {
  try {
    const user = await getOrCreateUser()
    return ok({ user })
  } catch (error) {
    console.error('[auth:me] 失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
