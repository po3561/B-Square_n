import { createSessionCookie, createSessionRecord, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';
import { normalizeLanguagePreference, normalizeThemePreference } from '../_lib/preferences.js';

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
    const preferred_language = normalizeLanguagePreference(body?.preferred_language || null, 'ko');
    const preferred_theme = normalizeThemePreference(body?.preferred_theme || null, 'dark');

    if (!email || !password) {
      return json(request, env, { success: false, error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return json(request, env, { success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
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

    try {
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
    } catch (insertError) {
      const message = String(insertError?.message || '');
      const isUnique = /unique constraint failed/i.test(message);
      if (isUnique) {
        if (/users\.email/i.test(message)) {
          return json(request, env, { success: false, error: 'Email already exists.' }, { status: 409 });
        }
        if (/users\.username/i.test(message)) {
          return json(request, env, { success: false, error: 'Username is already in use.' }, { status: 409 });
        }
        return json(request, env, { success: false, error: 'Account already exists.' }, { status: 409 });
      }
      throw insertError;
    }

    const session = await createSessionRecord(env.DB, userId);

    return json(request, env, {
      success: true,
      data: { userId, email, name, username },
      token: session.token,
    }, {
      status: 201,
      headers: { 'Set-Cookie': createSessionCookie(session.token, request, env) },
    });
  } catch (err) {
    console.error('Register error:', err);
    return json(request, env, { success: false, error: 'Registration failed.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
