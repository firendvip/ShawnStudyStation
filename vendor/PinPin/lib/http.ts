import { NextResponse } from 'next/server'

/** 统一的 API 响应封装(见 patterns: success/data/error)。 */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

/** 从反向代理头里取客户端 IP,用于限流键。 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}
