import { createSessionCookie, createSessionRecord, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const identifier = String(body?.email || body?.username || body?.identifier || '').trim();
    const password = body?.password || '';

    if (!identifier || !password) {
      return json(request, env, { success: false, error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    let user;
    if (identifier.includes('@')) {
      user = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(identifier.toLowerCase()).first();
    } else {
      user = await env.DB.prepare(`
        SELECT *
        FROM users
        WHERE username = ?
           OR LOWER(email) = LOWER(?)
        LIMIT 1
      `).bind(identifier, identifier).first();
    }

    if (!user) {
      return json(request, env, { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const inputHash = await hashPassword(password);
    const storedHash = String(user.password_hash || '').trim();
    if (!storedHash || inputHash !== storedHash) {
      return json(request, env, { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
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
