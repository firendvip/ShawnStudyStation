import { listReports, buildReportForRange } from '@/lib/reports'
import { reportSchema } from '@/lib/validation'
import { ok, fail } from '@/lib/http'
import { getOrCreateUser } from '@/lib/auth'

/** 列出已生成的 PDF。 */
export async function GET() {
  const user = await getOrCreateUser()
  try {
    return ok({ reports: await listReports(user.id) })
  } catch (error) {
    console.error('[reports:GET] 失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}

/** 手动生成:按书写日期区间 + 排版选项生成 PDF。 */
export async function POST(request: Request) {
  const user = await getOrCreateUser()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '参数校验失败', 400)
  }

  const { from, to, ...print } = parsed.data
  try {
    const result = await buildReportForRange(user.id, from, to, print)
    if (result.empty) {
      return fail('所选日期内没有数据,无法生成 PDF', 400)
    }
    return ok({ report: result.report })
  } catch (error) {
    console.error('[reports:POST] 失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
