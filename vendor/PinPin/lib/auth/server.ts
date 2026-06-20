import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { AUTH_CONFIG } from './config'
import { destroySessionByToken, getUserByToken, type AuthUser } from './service'

/** 读取当前请求的登录用户(Next 路由处理器 / RSC 中调用)。 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(AUTH_CONFIG.cookieName)?.value ?? null
  return getUserByToken(token)
}

/** 把会话 token 写入响应 cookie(httpOnly)。 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_CONFIG.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(AUTH_CONFIG.sessionTtlMs / 1000),
  })
}

/** 销毁会话并清除 cookie。 */
export async function clearSessionCookie(res: NextResponse): Promise<void> {
  const token = (await cookies()).get(AUTH_CONFIG.cookieName)?.value ?? null
  await destroySessionByToken(token)
  res.cookies.delete(AUTH_CONFIG.cookieName)
}
