// functions/api/admin/coupons.js — 글로벌 이벤트 쿠폰 API
// GET    /api/admin/coupons — 쿠폰 목록
// POST   /api/admin/coupons — 쿠폰 발급
// DELETE /api/admin/coupons?code=XXX — 쿠폰 삭제
// POST   /api/admin/coupons (action: validate) — 쿠폰 검증

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

function generateCouponCode() {
  return 'BSQ' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  // GET: 쿠폰 목록
  if (method === 'GET') {
    try {
      const { results } = await db.prepare('SELECT * FROM global_coupons ORDER BY created_at DESC').all();

      // 사용 내역 수 포함
      const enhanced = await Promise.all((results || []).map(async (c) => {
        const usage = await db.prepare('SELECT COUNT(*) as cnt FROM coupon_usage WHERE coupon_code = ?').bind(c.code).first().catch(() => ({ cnt: 0 }));
        return { ...c, actual_used: usage?.cnt || 0 };
      }));

      return new Response(JSON.stringify({ success: true, data: enhanced }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // POST: 쿠폰 발급 또는 검증
  if (method === 'POST') {
    try {
      const body = await request.json();

      // 쿠폰 검증 (결제 시 사용)
      if (body.action === 'validate') {
        const coupon = await db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(body.code).first();
        if (!coupon) return new Response(JSON.stringify({ success: false, error: '유효하지 않은 쿠폰입니다.' }), { headers: CORS });
        if (!coupon.is_active) return new Response(JSON.stringify({ success: false, error: '비활성화된 쿠폰입니다.' }), { headers: CORS });
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          return new Response(JSON.stringify({ success: false, error: '만료된 쿠폰입니다.' }), { headers: CORS });
        }
        if (coupon.max_issue_count > 0 && coupon.used_count >= coupon.max_issue_count) {
          return new Response(JSON.stringify({ success: false, error: '소진된 쿠폰입니다.' }), { headers: CORS });
        }

        // 이미 사용한 유저인지 확인
        if (body.user_id) {
          const already = await db.prepare('SELECT * FROM coupon_usage WHERE coupon_code = ? AND user_id = ?').bind(body.code, body.user_id).first();
          if (already) return new Response(JSON.stringify({ success: false, error: '이미 사용한 쿠폰입니다.' }), { headers: CORS });
        }

        return new Response(JSON.stringify({
          success: true,
          coupon: {
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            amount: coupon.amount,
            min_order_amount: coupon.min_order_amount
          }
        }), { headers: CORS });
      }

      // 쿠폰 사용 처리
      if (body.action === 'use') {
        const uId = 'CU' + Date.now() + Math.random().toString(36).substr(2, 4);
        await db.prepare(`
          INSERT INTO coupon_usage (id, coupon_code, user_id, user_name, order_id, used_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(uId, body.code, body.user_id, body.user_name || '', body.order_id || '').run();

        await db.prepare('UPDATE global_coupons SET used_count = used_count + 1 WHERE code = ?').bind(body.code).run();
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // 쿠폰 생성
      const code = body.code || generateCouponCode();
      if (!body.name || !body.amount) throw new Error('name, amount 필수');

      await db.prepare(`
        INSERT INTO global_coupons (code, name, description, type, amount, min_order_amount, max_issue_count, is_active, starts_at, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))
      `).bind(
        code, body.name, body.description || '', body.type || 'percent',
        parseInt(body.amount), body.min_order_amount || 0,
        body.max_issue_count || 0, body.starts_at || null, body.expires_at || null
      ).run();

      return new Response(JSON.stringify({ success: true, code }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // DELETE: 쿠폰 삭제
  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get('code');
      if (!code) throw new Error('code required');

      await db.prepare('DELETE FROM global_coupons WHERE code = ?').bind(code).run();
      await db.prepare('DELETE FROM coupon_usage WHERE coupon_code = ?').bind(code).run();
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
}
