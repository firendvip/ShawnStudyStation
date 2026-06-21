import {
  getPracticeForDate,
  getFirstWriteForDate,
  getSecondWriteForDate,
  getPracticeForRange,
} from '@/lib/practice'
import { dateSchema } from '@/lib/validation'
import { todayLocalDate } from '@/lib/date'
import { ok, fail } from '@/lib/http'
import { getOrCreateUser } from '@/lib/auth'
import type { EntryItem } from '@/lib/types'

/**
 * 取书写批次:
 * - ?from&to:区间逐日(第一次+第二次合并,用于打印)。
 * - ?date(或不传=今天)+?pass=first|second|both(默认 both):单日。
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return fail('未登录', 401)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  try {
    if (from && to) {
      if (!dateSchema.safeParse(from).success || !dateSchema.safeParse(to).success) {
        return fail('日期格式不正确', 400)
      }
      return ok({ days: await getPracticeForRange(user.id, from, to) })
    }

    const date = url.searchParams.get('date') ?? todayLocalDate()
    if (!dateSchema.safeParse(date).success) {
      return fail('日期格式不正确', 400)
    }
    const pass = url.searchParams.get('pass')
    let entries: EntryItem[]
    if (pass === 'first') {
      entries = await getFirstWriteForDate(user.id, date)
    } else if (pass === 'second') {
      entries = await getSecondWriteForDate(user.id, date)
    } else {
      entries = await getPracticeForDate(user.id, date)
    }
    return ok({ days: [{ date, entries }] })
  } catch (error) {
    console.error('[practice:GET] 失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
