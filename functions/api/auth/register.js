// POST /api/auth/register — 회원가입
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const { email, password, name, phone, username, birth_year, birth_month, birth_day, gender, nationality, signup_path } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: '이메일과 비밀번호는 필수입니다.' }), { status: 400, headers: cors });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' }), { status: 400, headers: cors });
    }

    // 이메일 중복 체크
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: '이미 가입된 이메일 주소입니다.' }), { status: 409, headers: cors });
    }

    // 아이디 중복 체크
    if (username) {
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existingUser) {
        return new Response(JSON.stringify({ success: false, error: '이미 사용 중인 아이디입니다.' }), { status: 409, headers: cors });
      }
    }

    // SHA-256 비밀번호 해시 (Web Crypto API)
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_bsq_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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

    return new Response(JSON.stringify({
      success: true,
      data: { userId, email, name, username },
      token
    }), {
      status: 201,
      headers: {
        ...cors,
        'Set-Cookie': `bsq_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
      }
    });

  } catch (err) {
    console.error('Register error:', err);
    return new Response(JSON.stringify({ success: false, error: '회원가입 처리 중 오류가 발생했습니다.', detail: err.message }), { status: 500, headers: cors });
  }
}

// CORS Preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
