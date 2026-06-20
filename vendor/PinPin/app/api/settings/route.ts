import { getSettings, saveSettings } from '@/lib/settings'
import { settingsSchema } from '@/lib/validation'
import { ok, fail } from '@/lib/http'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }
  try {
    return ok(await getSettings(user.id))
  } catch (error) {
    console.error('[settings:GET] 读取失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数校验失败', 400)
  }
  try {
    await saveSettings(user.id, parsed.data)
    return ok(parsed.data)
  } catch (error) {
    console.error('[settings:PUT] 保存失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
