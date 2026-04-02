import { createSessionCookie, createSessionRecord, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = body?.password || '';

    if (!email || !password) {
      return json(request, env, { success: false, error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
    }
    if (!email.includes('@')) {
      return json(request, env, { success: false, error: '유효한 이메일 주소를 입력해 주세요.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    const user = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(email).first();

    if (!user) {
      return json(request, env, { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const inputHash = await hashPassword(password);
    const storedHash = String(user.password_hash || '').trim();
    if (!storedHash || inputHash !== storedHash) {
      return json(request, env, { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const marketingTouched = body?.marketing_sms_consent !== undefined || body?.marketing_email_consent !== undefined;
    if (marketingTouched) {
      const updates = [];
      const binds = [];

      if (body?.marketing_sms_consent !== undefined) {
        updates.push('marketing_sms_consent = ?');
        binds.push(normalizeBoolean(body.marketing_sms_consent) ? 1 : 0);
        user.marketing_sms_consent = binds[binds.length - 1];
      }
      if (body?.marketing_email_consent !== undefined) {
        updates.push('marketing_email_consent = ?');
        binds.push(normalizeBoolean(body.marketing_email_consent) ? 1 : 0);
        user.marketing_email_consent = binds[binds.length - 1];
      }

      const updatedAt = new Date().toISOString();
      updates.push('marketing_consent_updated_at = ?');
      binds.push(updatedAt);
      user.marketing_consent_updated_at = updatedAt;

      updates.push('updated_at = datetime("now")');

      await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds, user.id).run();
    }

    const session = await createSessionRecord(env.DB, user.id);
    const { password_hash, ...safeUser } = user;

    return json(request, env, {
      success: true,
      data: { user: safeUser },
      token: session.token,
    }, {
      headers: { 'Set-Cookie': createSessionCookie(session.token, request, env) },
    });
  } catch (err) {
    console.error('Login error:', err);
    return json(request, env, { success: false, error: '로그인 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
