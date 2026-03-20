// GET /api/users — 유저 전체 목록 조회 (관리자 전용)
export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    // 보안: 실제 운영환경에서는 여기서 Admin 권한 체크 필수 (bsq_server.js 와 연동 권장)
    const { results } = await db.prepare('SELECT id, email, name, username, phone, role, membership_level, created_at FROM users ORDER BY created_at DESC').all();

    return Response.json({ success: true, data: results }, { headers: cors });
  } catch (error) {
    console.error('[API /users GET] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
