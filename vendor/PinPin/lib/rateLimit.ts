/**
 * 极简的内存固定窗口限流。
 * 注意:仅在单实例进程内有效;多实例部署时应换成 Redis 等共享存储。
 * 首期单台服务器足够,后期接入登录/短信时再升级。
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** 返回 true 表示允许;false 表示已超过限制。 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1
  return true
}
