import { AUTH_CONFIG } from './config'

/** 验证码发送器接口。接入真实短信时实现一个新的并在 getCodeSender 里返回。 */
export interface CodeSender {
  send(phone: string, code: string): Promise<void>
}

/** 演示发送器:不真正发短信,只在服务端日志打印(验证码也会随接口返回前端)。 */
class DemoCodeSender implements CodeSender {
  async send(phone: string, code: string): Promise<void> {
    console.log(`[auth:demo] 验证码 ${code} -> ${phone}`)
  }
}

/** 真实短信发送器占位:接入阿里云/腾讯云短信后在此实现。 */
class SmsCodeSender implements CodeSender {
  async send(): Promise<void> {
    throw new Error('短信服务未配置,请先接入云短信(阿里云/腾讯云)')
  }
}

export function getCodeSender(): CodeSender {
  return AUTH_CONFIG.demo ? new DemoCodeSender() : new SmsCodeSender()
}
