import { createSessionCookie, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { email, password, name, phone, username, birth_year, birth_month, birth_day, gender, nationality, signup_path } = body;

    if (!email || !password) {
      return json(request, env, { success: false, error: '이메일과 비밀번호는 필수입니다.' }, { status: 400 });
    }
    if (password.length < 8) {
      return json(request, env, { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }

    // 이메일 중복 체크
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return json(request, env, { success: false, error: '이미 가입된 이메일 주소입니다.' }, { status: 409 });
    }

    // 아이디 중복 체크
    if (username) {
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existingUser) {
        return json(request, env, { success: false, error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
      }
    }

    const password_hash = await hashPassword(password);

    // 유저 ID 생성
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, name, phone, username, birth_year, birth_month, birth_day, gender, nationality, signup_path, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    `).bind(
      userId, email, password_hash, name || null, phone || null, username || null,
      birth_year || null, birth_month || null, birth_day || null,
      gender || null, nationality || 'local', signup_path || null
    ).run();

    // 세션 자동 생성
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, userId, token, expiresAt).run();

    return json(request, env, {
      success: true,
      data: { userId, email, name, username },
      token
    }, {
      status: 201,
      headers: { 'Set-Cookie': createSessionCookie(token, request) }
    });

  } catch (err) {
    console.error('Register error:', err);
    return json(request, env, { success: false, error: '회원가입 처리 중 오류가 발생했습니다.', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
