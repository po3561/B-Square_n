import { createSessionCookie, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email = (body?.email || '').trim().toLowerCase();
    const password = body?.password || '';
    const name = body?.name || null;
    const phone = body?.phone || null;
    const username = (body?.username || '').trim() || null;
    const birth_year = body?.birth_year || null;
    const birth_month = body?.birth_month || null;
    const birth_day = body?.birth_day || null;
    const gender = body?.gender || null;
    const nationality = body?.nationality || 'local';
    const signup_path = body?.signup_path || null;
    const referrer_code = body?.referrer_code || null;
    const preferred_language = body?.preferred_language || null;
    const preferred_theme = body?.preferred_theme || null;

    if (!email || !password) {
      return json(request, env, { success: false, error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return json(request, env, { success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return json(request, env, { success: false, error: 'Email already exists.' }, { status: 409 });
    }

    if (username) {
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existingUser) {
        return json(request, env, { success: false, error: 'Username is already in use.' }, { status: 409 });
      }
    }

    const password_hash = await hashPassword(password);
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

    await env.DB.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, phone, username,
        birth_year, birth_month, birth_day, gender, nationality, signup_path,
        referrer_code, preferred_language, preferred_theme, role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    `).bind(
      userId, email, password_hash, name, phone, username,
      birth_year, birth_month, birth_day,
      gender, nationality, signup_path,
      referrer_code, preferred_language, preferred_theme
    ).run();

    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, userId, token, expiresAt).run();

    return json(request, env, {
      success: true,
      data: { userId, email, name, username },
      token,
    }, {
      status: 201,
      headers: { 'Set-Cookie': createSessionCookie(token, request) },
    });
  } catch (err) {
    console.error('Register error:', err);
    return json(request, env, { success: false, error: 'Registration failed.', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
