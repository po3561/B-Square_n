import { createSessionCookie, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return json(request, env, { success: false, error: '아이디/이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    // username 또는 email로 유저 조회
    let user;
    if (username.includes('@')) {
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(username).first();
    } else {
      user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    }

    if (!user) {
      return json(request, env, { success: false, error: '존재하지 않는 사용자 정보입니다.' }, { status: 401 });
    }

    const inputHash = await hashPassword(password);

    if (inputHash !== user.password_hash) {
      return json(request, env, { success: false, error: '아이디 또는 비밀번호를 다시 확인해주세요.' }, { status: 401 });
    }

    // 기존 만료된 세션 정리 후 새 세션 생성
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime("now")').bind(user.id).run();

    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, user.id, token, expiresAt).run();

    // 비밀번호 해시 제외한 유저 데이터 반환
    const { password_hash, ...safeUser } = user;

    return json(request, env, {
      success: true,
      data: { user: safeUser },
      token
    }, {
      headers: { 'Set-Cookie': createSessionCookie(token, request) }
    });

  } catch (err) {
    console.error('Login error:', err);
    return json(request, env, { success: false, error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
