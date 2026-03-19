// GET /api/reviews — 리뷰 목록
// POST /api/reviews — 리뷰 작성 / 답변
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  if (!class_id) return new Response(JSON.stringify({ success: false, error: 'class_id 필요' }), { status: 400, headers: cors });

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM reviews WHERE class_id = ? ORDER BY created_at DESC'
    ).bind(class_id).all();

    const avg = results.length > 0 ? (results.reduce((sum, r) => sum + (r.rating || 5), 0) / results.length).toFixed(1) : null;

    return new Response(JSON.stringify({ success: true, data: results, summary: { count: results.length, avg_rating: avg } }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '리뷰 조회 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();

    // 강사 답변
    if (body.action === 'reply' && body.review_id && body.reply) {
      await env.DB.prepare('UPDATE reviews SET instructor_reply = ? WHERE push_key = ?').bind(body.reply, body.review_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    }

    // 리뷰 작성
    const { class_id, user_id, user_name, rating, content } = body;
    if (!class_id || !user_id || !content) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목 누락' }), { status: 400, headers: cors });
    }

    const push_key = 'rv_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    await env.DB.prepare(
      'INSERT INTO reviews (push_key, class_id, user_id, user_name, rating, content) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(push_key, class_id, user_id, user_name || '수강생', rating || 5, content).run();

    return new Response(JSON.stringify({ success: true, data: { id: push_key } }), { status: 201, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '리뷰 처리 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
