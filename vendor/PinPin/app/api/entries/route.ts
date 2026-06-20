import { addEntries, listToday, listAll } from '@/lib/entries'
import { addEntriesSchema } from '@/lib/validation'
import { ok, fail, getClientIp } from '@/lib/http'
import { rateLimit } from '@/lib/rateLimit'
import { getCurrentUser } from '@/lib/auth'

const WINDOW_MS = 60_000

/** 列出记录:?scope=all 全部,否则今天。 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }
  try {
    const scope = new URL(request.url).searchParams.get('scope')
    return ok(scope === 'all' ? await listAll(user.id) : await listToday(user.id))
  } catch (error) {
    console.error('[entries:GET] 查询失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}

/** 录入字词(同日去重)。 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }
  if (!rateLimit(`entries-post:${getClientIp(request)}`, 120, WINDOW_MS)) {
    return fail('操作过于频繁,请稍后再试', 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }

  const parsed = addEntriesSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数校验失败', 400)
  }

  try {
    return ok(await addEntries(user.id, parsed.data.texts, parsed.data.recordDate), 201)
  } catch (error) {
    console.error('[entries:POST] 录入失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
