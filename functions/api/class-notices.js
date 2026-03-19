// GET /api/class-notices — 클래스 공지 목록
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  try {
    let results;
    if (class_id) {
      ({ results } = await env.DB.prepare('SELECT * FROM class_notices WHERE class_id = ? ORDER BY created_at DESC').bind(class_id).all());
    } else {
      ({ results } = await env.DB.prepare('SELECT * FROM class_notices ORDER BY created_at DESC LIMIT 50').all());
    }

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '클래스 공지 조회 오류' }), { status: 500, headers: cors });
  }
}

// POST /api/class-notices — 클래스 공지 작성 (강사/운영자)
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { class_id, title, content, author_name } = body;

    if (!class_id || !title) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목(class_id, title) 누락' }), { status: 400, headers: cors });
    }

    const push_key = 'noti_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    await env.DB.prepare(
      'INSERT INTO class_notices (push_key, class_id, title, content, author_name, views) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(push_key, class_id, title, content || '', author_name || '강사', 0).run();

    return new Response(JSON.stringify({ success: true, data: { id: push_key } }), { status: 201, headers: cors });
  } catch (err) {
    console.error('Notice create error:', err);
    return new Response(JSON.stringify({ success: false, error: '클래스 공지 작성 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
