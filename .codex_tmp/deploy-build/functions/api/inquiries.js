// GET /api/inquiries — 문의 목록 (관리자)
// POST /api/inquiries — 문의 접수
export async function onRequestGet(context) {
  const { env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const { results } = await env.DB.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '문의 조회 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { name, email, category, title, content } = body;

    if (!name || !email || !title || !content) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목을 모두 입력해주세요.' }), { status: 400, headers: cors });
    }

    const id = 'inq_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    await env.DB.prepare(
      'INSERT INTO inquiries (id, name, email, category, title, content, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, email, category || '일반', title, content, body.submitted_by || null).run();

    return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '문의 접수 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
