import { getReportFile, deleteReport } from '@/lib/reports'
import { getOrCreateUser, getOrCreateUserByClientToken } from '@/lib/auth'
import { ok, fail } from '@/lib/http'

/** 普通 URL 访问无法带请求头,改从查询参数 gt 识别访客;否则回退到头/cookie。 */
async function resolveUser(request: Request) {
  const gt = new URL(request.url).searchParams.get('gt')
  if (gt && gt.length >= 16) {
    return getOrCreateUserByClientToken(gt)
  }
  return getOrCreateUser()
}

/** 下载/查看某个周期 PDF(仅限本人)。 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await resolveUser(request)
  const { id } = await context.params
  const file = await getReportFile(user.id, id)
  if (!file) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.filename}"`,
    },
  })
}

/** 删除某个已生成的 PDF(仅限本人)。 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await resolveUser(request)
  const { id } = await context.params
  try {
    const removed = await deleteReport(user.id, id)
    if (!removed) {
      return fail('未找到该 PDF', 404)
    }
    return ok({ deleted: true })
  } catch (error) {
    console.error('[reports:DELETE] 失败', error)
    return fail('服务器繁忙,请稍后再试', 500)
  }
}
