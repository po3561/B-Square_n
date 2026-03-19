// GET /api/faqs — FAQ 목록
export async function onRequestGet(context) {
  const { env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM faqs WHERE is_hidden = 0 ORDER BY created_at DESC'
    ).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'FAQ 조회 오류' }), { status: 500, headers: cors });
  }
}
