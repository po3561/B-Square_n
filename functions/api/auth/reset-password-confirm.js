import { hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const body = await request.json();
    const token = (body?.token || '').trim();
    const password = body?.password || '';

    if (!token || password.length < 8) {
      return json(request, env, {
        success: false,
        error: 'A valid token and a password of at least 8 characters are required.',
      }, { status: 400 });
    }

    const tokenHash = await hashPassword(token);
    const resetRecord = await env.DB.prepare(`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ?
        AND used_at IS NULL
        AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(tokenHash).first();

    if (!resetRecord) {
      return json(request, env, { success: false, error: 'Reset link is invalid or expired.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(passwordHash, resetRecord.user_id),
      env.DB.prepare('UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE id = ?').bind(resetRecord.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetRecord.user_id),
    ]);

    return json(request, env, {
      success: true,
      message: 'Password updated. Please log in again.',
    });
  } catch (error) {
    console.error('Reset confirm error:', error);
    return json(request, env, {
      success: false,
      error: 'Password reset failed.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
