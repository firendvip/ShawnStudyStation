import { createHash, randomBytes, randomInt } from 'node:crypto'

/** 生成高熵会话 token(明文只发给客户端,库里存哈希)。 */
export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/** SHA-256 哈希(用于 token / 验证码的存储与比对)。 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** 生成纯数字验证码。 */
export function generateNumericCode(length: number): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += randomInt(10)
  }
  return code
}
