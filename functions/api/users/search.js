// functions/api/users/search.js - 실시간 유저 검색 (서브 강사 등록용)
// GET /api/users/search?q=...

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (query.length < 2) {
    return new Response(JSON.stringify({ success: true, data: [] }), { headers: cors });
  }

  try {
    // 이름 또는 이메일로 검색 (대소문자 구분 없이)
    const sql = `
      SELECT id, name, nickname, email, profile_image_url 
      FROM users 
      WHERE (name LIKE ? OR nickname LIKE ? OR email LIKE ?)
      LIMIT 20
    `;
    const searchTerm = `%${query}%`;
    const { results } = await db.prepare(sql).bind(searchTerm, searchTerm, searchTerm).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (error) {
    console.error('[API /users/search GET] Error:', error);
    return new Response(JSON.stringify({ success: false, error: '검색 중 오류가 발생했습니다.' }), { status: 500, headers: cors });
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
