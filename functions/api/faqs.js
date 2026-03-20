// GET /api/faqs — FAQ 목록
// POST /api/faqs — FAQ 작성/수정 (관리자)
// DELETE /api/faqs — FAQ 삭제 (관리자)

export async function onRequestGet(context) {
  const { env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM faqs ORDER BY created_at DESC'
    ).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'FAQ 조회 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { id, question, answer, is_hidden } = body;

    if (!question || !answer) {
      return new Response(JSON.stringify({ success: false, error: 'Question and answer are required' }), { status: 400, headers: cors });
    }

    if (id) {
      // 수정
      await env.DB.prepare('UPDATE faqs SET question = ?, answer = ?, is_hidden = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(question, answer, is_hidden ? 1 : 0, id)
        .run();
      return new Response(JSON.stringify({ success: true, message: 'Updated' }), { headers: cors });
    } else {
      // 생성
      const newId = 'faq_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare('INSERT INTO faqs (id, question, answer, is_hidden) VALUES (?, ?, ?, ?)')
        .bind(newId, question, answer, is_hidden ? 1 : 0)
        .run();
      return new Response(JSON.stringify({ success: true, data: { id: newId } }), { status: 201, headers: cors });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return new Response(JSON.stringify({ success: false, error: 'ID is required' }), { status: 400, headers: cors });

  try {
    await env.DB.prepare('DELETE FROM faqs WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true, message: 'Deleted' }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
