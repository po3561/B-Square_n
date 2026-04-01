import { createSessionCookie, createSessionRecord, hashPassword } from '../_lib/auth.js';
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
      user = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').bind(username).first();
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
    return json(request, env, { success: false, error: 'Login failed.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
