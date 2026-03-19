// GET /api/coupons — 쿠폰 조회
// POST /api/coupons/validate — 쿠폰 유효성 검증
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const code = url.searchParams.get('code');

  try {
    if (code && class_id) {
      const coupon = await env.DB.prepare(
        'SELECT * FROM coupons WHERE code = ? AND class_id = ? AND is_used = 0'
      ).bind(code, class_id).first();

      if (!coupon) {
        return new Response(JSON.stringify({ success: false, error: '유효하지 않거나 이미 사용된 쿠폰입니다.' }), { status: 404, headers: cors });
      }

      return new Response(JSON.stringify({ success: true, data: coupon }), { headers: cors });
    }

    if (class_id) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM coupons WHERE class_id = ? ORDER BY created_at DESC'
      ).bind(class_id).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: '파라미터가 필요합니다.' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '쿠폰 조회 오류' }), { status: 500, headers: cors });
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
