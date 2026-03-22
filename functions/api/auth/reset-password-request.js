import { hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

async function sendResetEmail(env, email, resetUrl) {
  if (!env.MAIL_FROM) return false;

  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: env.MAIL_FROM, name: 'B-Square' },
      reply_to: env.MAIL_REPLY_TO ? { email: env.MAIL_REPLY_TO } : undefined,
      subject: 'B-Square 비밀번호 재설정',
      content: [{
        type: 'text/html',
        value: `
          <p>B-Square 비밀번호 재설정 요청이 접수되었습니다.</p>
          <p>아래 링크를 눌러 새 비밀번호를 설정해 주세요.</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>이 링크는 30분 동안만 유효합니다.</p>
        `,
      }],
    }),
  });

  return response.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return json(request, env, { success: false, error: '이메일을 입력해 주세요.' }, { status: 400 });
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
        message: '재설정 안내가 발송되었습니다. 이메일을 확인해 주세요.',
      };

      if (!emailSent) {
        payload.message = '메일 설정이 없어 재설정 링크를 응답에 포함합니다.';
        payload.debug_reset_url = resetUrl;
      }

      return json(request, env, payload);
    }

    return json(request, env, {
      success: true,
      message: '가입된 이메일이면 재설정 안내가 발송됩니다.',
    });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: '비밀번호 재설정 요청 처리 중 오류가 발생했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
