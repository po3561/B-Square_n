// GET /api/user-passes — 사용자의 수강권 목록 조회
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');

  if (!user_id) {
    return new Response(JSON.stringify({ success: false, error: 'user_id가 필요합니다.' }), { status: 400, headers: cors });
  }

  try {
    // D1에서 해당 유저의 모든 수강권 조회
    const { results } = await env.DB.prepare(`
      SELECT * FROM user_passes WHERE user_id = ? AND status = 'active'
    `).bind(user_id).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '수강권 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
