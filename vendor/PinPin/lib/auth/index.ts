/**
 * 可复用账号模块的公共入口。
 * - 框架无关核心:service / token / codeSender / config(仅依赖 Prisma)。
 * - Next 适配层:server(cookie + getCurrentUser)。
 * 迁移到其他 Next.js 项目时整目录复制,替换 Prisma schema 中的 User/Session/LoginCode 即可。
 */
export { AUTH_CONFIG } from './config'
export {
  createGuestSession,
  requestLoginCode,
  verifyLoginCode,
  getUserByToken,
  destroySessionByToken,
  type AuthUser,
} from './service'
export { getCurrentUser, getOrCreateUser, setSessionCookie, clearSessionCookie } from './server'
