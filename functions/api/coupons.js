// GET /api/coupons — 쿠폰 조회
// POST /api/coupons — 쿠폰 생성
// DELETE /api/coupons — 쿠폰 삭제
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const code = url.searchParams.get('code');

  try {
    if (code && class_id) {
      // 낱개 조회 (검증용)
      const coupon = await env.DB.prepare(
        'SELECT * FROM coupons WHERE coupon_code = ? AND class_id = ?'
      ).bind(code, class_id).first();

      if (!coupon) {
        return new Response(JSON.stringify({ success: false, error: '존재하지 않는 쿠폰입니다.' }), { status: 404, headers: cors });
      }

      return new Response(JSON.stringify({ success: true, data: coupon }), { headers: cors });
    }

    if (class_id) {
      // 목록 조회
      const { results } = await env.DB.prepare(
        'SELECT * FROM coupons WHERE class_id = ? ORDER BY coupon_code ASC'
      ).bind(class_id).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: '파라미터가 필요합니다.' }), { status: 400, headers: cors });
  } catch (err) {
    console.error("Coupon GET Error:", err);
    return new Response(JSON.stringify({ success: false, error: '쿠폰 조회 오류: ' + err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  try {
    const body = await request.json();
    const { class_id, code, type, value, max_limit } = body;

    if (!class_id || !code) {
      return new Response(JSON.stringify({ success: false, error: '필수 데이터가 누락되었습니다.' }), { status: 400, headers: cors });
    }

    await env.DB.prepare(
      'INSERT INTO coupons (class_id, coupon_code, type, value, limit_count, used_count) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(class_id, code, type, value, max_limit || 0).run();

    return new Response(JSON.stringify({ success: true, message: '쿠폰이 발급되었습니다.' }), { headers: cors });
  } catch (err) {
    console.error("Coupon POST Error:", err);
    return new Response(JSON.stringify({ success: false, error: '쿠폰 생성 오류: ' + err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Content-Type': 'application/json'
  };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const code = url.searchParams.get('code');

  try {
    if (!class_id || !code) {
      return new Response(JSON.stringify({ success: false, error: '파라미터가 누락되었습니다.' }), { status: 400, headers: cors });
    }

    await env.DB.prepare(
      'DELETE FROM coupons WHERE class_id = ? AND coupon_code = ?'
    ).bind(class_id, code).run();

    return new Response(JSON.stringify({ success: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '삭제 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
