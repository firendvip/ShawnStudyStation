'use strict';

// SMS delivery via Tencent Cloud, with a development-mode fallback that
// logs the code to the server console instead of sending a real message.

const { config, isSmsConfigured } = require('../config');

const CODE_VALID_MINUTES = '5';

/**
 * Send a verification code to a phone number.
 * In dev mode (or when SMS is not configured) the code is logged and no
 * real SMS is dispatched.
 * @param {string} phone — mainland China mobile number (no country code)
 * @param {string} code — six-digit verification code
 * @returns {Promise<{sent: boolean, dev?: boolean}>}
 */
async function sendSmsCode(phone, code) {
  if (config.smsDevMode || !isSmsConfigured()) {
    // eslint-disable-next-line no-console
    console.log(`[SMS DEV] 验证码 for ${phone}: ${code}`);
    return { sent: false, dev: true };
  }

  try {
    // Lazy-require the SDK so dev environments without it still boot.
    const tencentcloud = require('tencentcloud-sdk-nodejs-sms');
    const SmsClient = tencentcloud.sms.v20210111.Client;

    const client = new SmsClient({
      credential: {
        secretId: config.tencent.secretId,
        secretKey: config.tencent.secretKey,
      },
      region: config.tencent.region,
      profile: { httpProfile: { reqTimeout: 30 } },
    });

    await client.SendSms({
      SmsSdkAppId: config.tencent.sdkAppId,
      SignName: config.tencent.signName,
      TemplateId: config.tencent.templateId,
      PhoneNumberSet: [`+86${phone}`],
      TemplateParamSet: [String(code), CODE_VALID_MINUTES],
    });

    return { sent: true };
  } catch (err) {
    // Log the real error server-side, but expose a generic message.
    // eslint-disable-next-line no-console
    console.error('[SMS] Tencent SendSms failed:', err);
    throw new Error('短信发送失败');
  }
}

module.exports = { sendSmsCode };
