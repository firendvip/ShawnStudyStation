/**
 * 账号系统配置(产品无关)。
 * 接入真实短信后,把环境变量 AUTH_SMS_PROVIDER 设为 'real' 即可关闭演示模式。
 */
export const AUTH_CONFIG = {
  /** 会话 cookie 名称 */
  cookieName: 'pinpin_session',
  /** 会话有效期(毫秒):30 天 */
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** 验证码有效期(毫秒):5 分钟 */
  codeTtlMs: 5 * 60 * 1000,
  /** 验证码位数 */
  codeLength: 6,
  /**
   * 演示模式:请求验证码时把验证码直接返回前端(无需真实短信)。
   * 生产接入云短信后设 AUTH_SMS_PROVIDER=real 关闭。
   */
  demo: process.env.AUTH_SMS_PROVIDER !== 'real',
} as const
