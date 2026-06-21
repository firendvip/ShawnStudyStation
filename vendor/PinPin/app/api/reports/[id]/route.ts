import { getReportFile } from '@/lib/reports'
import { getOrCreateUser } from '@/lib/auth'

/** 下载/查看某个周期 PDF(仅限本人)。 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return new Response('未登录', { status: 401 })
  }
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
