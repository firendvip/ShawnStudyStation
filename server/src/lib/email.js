'use strict';

// Email delivery of verification codes via SMTP (nodemailer), with a
// development-mode fallback that logs the code to the server console instead of
// sending a real message.

const nodemailer = require('nodemailer');
const { config, isEmailConfigured } = require('../config');

const CODE_VALID_MINUTES = '5';

// Lazily-created transporter, reused across sends.
let transporter = null;

/**
 * Build (once) and return the nodemailer SMTP transport from config.
 * @returns {import('nodemailer').Transporter}
 */
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

/**
 * Send a six-digit verification code to an email address.
 * In dev mode (or when SMTP is not fully configured) the code is logged and no
 * real email is dispatched.
 * @param {string} email — destination address (already normalised/lowercased)
 * @param {string} code — six-digit verification code
 * @returns {Promise<{sent: boolean, dev?: boolean}>}
 */
async function sendEmailCode(email, code) {
  if (config.emailDevMode || !isEmailConfigured()) {
    // eslint-disable-next-line no-console
    console.log(`[EMAIL DEV] 验证码 for ${email}: ${code}`);
    return { sent: false, dev: true };
  }

  const subject = '【小善学习站】邮箱验证码';
  const text =
    `您的验证码是：${code}\n\n` +
    `验证码 ${CODE_VALID_MINUTES} 分钟内有效，请勿泄露。\n\n` +
    `如果这不是您本人的操作，请忽略此邮件。`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">` +
    `<h2 style="margin:0 0 16px">小善学习站 邮箱验证码</h2>` +
    `<p style="margin:0 0 12px">您的验证码是：</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${code}</p>` +
    `<p style="margin:0;color:#555">验证码 ${CODE_VALID_MINUTES} 分钟内有效，请勿泄露。</p>` +
    `<p style="margin:12px 0 0;color:#888;font-size:13px">如果这不是您本人的操作，请忽略此邮件。</p>` +
    `</div>`;

  try {
    await getTransporter().sendMail({
      from: config.smtpFrom,
      to: email,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    // Log the real error server-side, but expose a generic message.
    // eslint-disable-next-line no-console
    console.error('[EMAIL] SMTP sendMail failed:', err);
    throw new Error('邮件发送失败');
  }
}

module.exports = { sendEmailCode };
