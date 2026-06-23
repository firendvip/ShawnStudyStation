import { cookies, headers } from 'next/headers'
import type { NextResponse } from 'next/server'
import { AUTH_CONFIG } from './config'
import {
  createGuestSession,
  destroySessionByToken,
  getOrCreateUserByClientToken,
  getUserByToken,
  type AuthUser,
} from './service'

/** 会话 cookie 的统一属性(httpOnly,30 天)。 */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(AUTH_CONFIG.sessionTtlMs / 1000),
  }
}

/** 读取当前请求的登录用户(Next 路由处理器 / RSC 中调用)。 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(AUTH_CONFIG.cookieName)?.value ?? null
  return getUserByToken(token)
}

/**
 * 取当前用户;若没有会话(免登录访客首次访问),即时创建访客身份并种 cookie。
 * 永不返回 null —— 数据接口以此访客作为隐式数据归属者,无需登录。
 * 必须在路由处理器中调用(set cookie 依赖可写的请求 cookie 存储)。
 */
export async function getOrCreateUser(): Promise<AuthUser> {
  // 跨站 iframe(localhost 子站内嵌进 file:// 主站)下三方 cookie 不可用,
  // 优先用客户端通过 x-guest-token 头携带的访客令牌,保证读写身份一致。
  const headerToken = (await headers()).get('x-guest-token')
  if (headerToken && headerToken.length >= 16) {
    return getOrCreateUserByClientToken(headerToken)
  }
  const existing = await getCurrentUser()
  if (existing) {
    return existing
  }
  const guest = await createGuestSession()
  ;(await cookies()).set(AUTH_CONFIG.cookieName, guest.token, sessionCookieOptions())
  return guest.user
}

/** 把会话 token 写入响应 cookie(httpOnly)。 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_CONFIG.cookieName, token, sessionCookieOptions())
}

/** 销毁会话并清除 cookie。 */
export async function clearSessionCookie(res: NextResponse): Promise<void> {
  const token = (await cookies()).get(AUTH_CONFIG.cookieName)?.value ?? null
  await destroySessionByToken(token)
  res.cookies.delete(AUTH_CONFIG.cookieName)
}
