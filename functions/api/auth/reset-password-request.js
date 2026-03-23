import { hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

async function sendResetEmail(env, email, resetUrl) {
  if (!env.MAIL_FROM) return false;

  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: env.MAIL_FROM, name: 'B-Square' },
      reply_to: env.MAIL_REPLY_TO ? { email: env.MAIL_REPLY_TO } : undefined,
      subject: 'B-Square password reset',
      content: [{
        type: 'text/html',
        value: `
          <p>Your B-Square password reset request was received.</p>
          <p>Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link is valid for 30 minutes.</p>
        `,
      }],
    }),
  });

  return response.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const body = await request.json();
    const email = (body?.email || '').trim().toLowerCase();

    if (!email) {
      return json(request, env, { success: false, error: 'Email is required.' }, { status: 400 });
    }

    const user = await env.DB.prepare('SELECT id, email FROM users WHERE lower(email) = ?').bind(email).first();

    if (user) {
      const rawToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
      const tokenHash = await hashPassword(rawToken);
      const tokenId = 'prt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await env.DB.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).bind(tokenId, user.id, tokenHash, expiresAt).run();

      const appBaseUrl = env.APP_BASE_URL || new URL(request.url).origin;
      const resetUrl = `${appBaseUrl}/login/update_password.html?token=${encodeURIComponent(rawToken)}`;
      const emailSent = await sendResetEmail(env, user.email, resetUrl);

      const payload = {
        success: true,
        message: 'If the email exists, a reset link has been sent.',
      };

      if (!emailSent) {
        payload.message = 'Email is not configured. Use the reset link below.';
        payload.debug_reset_url = resetUrl;
      }

      return json(request, env, payload);
    }

    return json(request, env, {
      success: true,
      message: 'If the email exists, a reset link has been sent.',
    });
  } catch (error) {
    console.error('Reset request error:', error);
    return json(request, env, {
      success: false,
      error: 'Password reset request failed.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
