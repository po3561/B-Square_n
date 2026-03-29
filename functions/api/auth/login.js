import { createSessionCookie, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const username = (body?.username || '').trim();
    const password = body?.password || '';

    if (!username || !password) {
      return json(request, env, { success: false, error: 'Username and password are required.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    let user;
    if (username.includes('@')) {
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(username).first();
    } else {
      user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    }

    if (!user) {
      return json(request, env, { success: false, error: 'Invalid account credentials.' }, { status: 401 });
    }

    const inputHash = await hashPassword(password);
    if (inputHash !== user.password_hash) {
      return json(request, env, { success: false, error: 'Invalid account credentials.' }, { status: 401 });
    }

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime("now")').bind(user.id).run();

    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, user.id, token, expiresAt).run();

    const { password_hash, ...safeUser } = user;

    return json(request, env, {
      success: true,
      data: { user: safeUser },
      token,
    }, {
      headers: { 'Set-Cookie': createSessionCookie(token, request) },
    });
  } catch (err) {
    console.error('Login error:', err);
    return json(request, env, { success: false, error: 'Login failed.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
