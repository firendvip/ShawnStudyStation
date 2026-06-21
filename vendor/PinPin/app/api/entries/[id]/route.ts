import { deleteEntry, updateEntry } from '@/lib/entries'
import { updateEntrySchema } from '@/lib/validation'
import { ok, fail, getClientIp } from '@/lib/http'
import { rateLimit } from '@/lib/rateLimit'
import { getOrCreateUser } from '@/lib/auth'

const WINDOW_MS = 60_000

/** 修改字词(自动重算拼音)。 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getOrCreateUser()
  if (!rateLimit(`entries-patch:${getClientIp(request)}`, 120, WINDOW_MS)) {
    return fail('操作过于频繁,请稍后再试', 429)
  }

  const { id } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }

  const parsed = updateEntrySchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数校验失败', 400)
  }

  try {
    const updated = await updateEntry(user.id, id, parsed.data.text)
    if (!updated) {
      return fail('记录不存在', 404)
    }
    return ok(updated)
  } catch (error) {
    console.error('[entries:PATCH] 修改失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}

/** 删除一条记录。 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }
  if (!rateLimit(`entries-delete:${getClientIp(request)}`, 120, WINDOW_MS)) {
    return fail('操作过于频繁,请稍后再试', 429)
  }

  const { id } = await context.params
  try {
    const deleted = await deleteEntry(user.id, id)
    if (!deleted) {
      return fail('记录不存在', 404)
    }
    return ok({ deleted: true })
  } catch (error) {
    console.error('[entries:DELETE] 删除失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
