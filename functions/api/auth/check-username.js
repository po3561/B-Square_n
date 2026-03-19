// GET /api/auth/check-username?username=xxx — 아이디 중복 확인
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');

    if (!username || username.trim().length < 2) {
      return new Response(JSON.stringify({ success: false, error: '아이디는 2자 이상이어야 합니다.' }), { status: 400, headers: cors });
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first();

    return new Response(JSON.stringify({
      success: true,
      data: {
        available: !existing,
        message: existing ? '이미 사용 중인 아이디입니다.' : '사용 가능한 아이디입니다.'
      }
    }), { headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '중복 확인 중 오류' }), { status: 500, headers: cors });
  }
}
