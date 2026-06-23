import { prisma } from '../prisma'
import { AUTH_CONFIG } from './config'
import { generateNumericCode, generateToken, sha256 } from './token'
import { getCodeSender } from './codeSender'

export interface AuthUser {
  id: string
  phone: string | null
  nickname: string | null
  /** 访客(无手机号):数据只在本设备,登录后可并入正式账号 */
  isGuest: boolean
}

interface UserRow {
  id: string
  phone: string | null
  nickname: string | null
}

function toAuthUser(row: UserRow): AuthUser {
  return { id: row.id, phone: row.phone, nickname: row.nickname, isGuest: row.phone === null }
}

async function createSessionFor(userId: string): Promise<string> {
  const token = generateToken()
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + AUTH_CONFIG.sessionTtlMs),
    },
  })
  return token
}

/** 创建一个访客账号 + 会话(免登录使用)。 */
export async function createGuestSession(): Promise<{ user: AuthUser; token: string }> {
  const user = await prisma.user.create({ data: {} })
  const token = await createSessionFor(user.id)
  return { user: toAuthUser(user), token }
}

/**
 * 用客户端持有的令牌取/建访客会话。
 * 适用于 cookie 不可用的场景:如本地把 PinPin(localhost) 以 iframe 内嵌进 file:// 主站,
 * 浏览器会拦截三方 cookie,导致每次请求都新建空访客、"录入后不显示"。
 * 客户端把该令牌持久化在 localStorage 并随请求头 x-guest-token 携带,
 * 服务端据此把同一访客的读写绑定到同一身份。
 */
export async function getOrCreateUserByClientToken(token: string): Promise<AuthUser> {
  const existing = await getUserByToken(token)
  if (existing) {
    return existing
  }
  const user = await prisma.user.create({ data: {} })
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + AUTH_CONFIG.sessionTtlMs),
    },
  })
  return toAuthUser(user)
}

/** 生成并(演示)下发验证码。演示模式下返回 demoCode 供前端展示。 */
export async function requestLoginCode(phone: string): Promise<{ demoCode?: string }> {
  const code = generateNumericCode(AUTH_CONFIG.codeLength)
  await prisma.loginCode.create({
    data: {
      phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + AUTH_CONFIG.codeTtlMs),
    },
  })
  await getCodeSender().send(phone, code)
  return AUTH_CONFIG.demo ? { demoCode: code } : {}
}

/** 把访客的数据并入目标正式账号(条目、报告;设置不覆盖目标已有)。 */
async function mergeGuestInto(guestUserId: string, targetUserId: string): Promise<void> {
  await prisma.entry.updateMany({
    where: { userId: guestUserId },
    data: { userId: targetUserId },
  })
  const guestReports = await prisma.pdfReport.findMany({ where: { userId: guestUserId } })
  for (const r of guestReports) {
    const clash = await prisma.pdfReport.findUnique({
      where: {
        userId_cycleStart_cycleEnd: {
          userId: targetUserId,
          cycleStart: r.cycleStart,
          cycleEnd: r.cycleEnd,
        },
      },
    })
    if (!clash) {
      await prisma.pdfReport.update({ where: { id: r.id }, data: { userId: targetUserId } })
    }
  }
  // 删除访客(级联清掉其会话/剩余设置/报告)
  await prisma.user.delete({ where: { id: guestUserId } })
}

/**
 * 校验验证码登录。
 * - guestUserId:当前访客身份(若有),用于把访客数据并入登录账号。
 * 返回正式账号用户 + 新会话 token。
 */
export async function verifyLoginCode(
  phone: string,
  code: string,
  guestUserId?: string,
): Promise<{ user: AuthUser; token: string } | null> {
  const record = await prisma.loginCode.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!record || record.codeHash !== sha256(code)) {
    return null
  }
  await prisma.loginCode.update({ where: { id: record.id }, data: { consumed: true } })

  const existing = await prisma.user.findUnique({ where: { phone } })

  let user: UserRow
  if (existing) {
    // 已有该手机号账号:把访客数据并入,再用该账号登录
    if (guestUserId && guestUserId !== existing.id) {
      const guest = await prisma.user.findUnique({ where: { id: guestUserId } })
      if (guest && guest.phone === null) {
        await mergeGuestInto(guestUserId, existing.id)
      }
    }
    user = existing
  } else if (guestUserId) {
    // 当前是访客且手机号未注册:直接把访客升级为该手机号账号(数据天然保留)
    const guest = await prisma.user.findUnique({ where: { id: guestUserId } })
    if (guest && guest.phone === null) {
      user = await prisma.user.update({ where: { id: guestUserId }, data: { phone } })
    } else {
      user = await prisma.user.create({ data: { phone } })
    }
  } else {
    user = await prisma.user.create({ data: { phone } })
  }

  const token = await createSessionFor(user.id)
  return { user: toAuthUser(user), token }
}

/** 由会话 token 解析当前用户(无效/过期返回 null)。 */
export async function getUserByToken(token: string | null): Promise<AuthUser | null> {
  if (!token) {
    return null
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date()) {
    return null
  }
  return toAuthUser(session.user)
}

export async function destroySessionByToken(token: string | null): Promise<void> {
  if (!token) {
    return
  }
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
}
