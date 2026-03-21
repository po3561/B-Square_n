// functions/api/admin/orders.js — 주문 관리 API
// GET  /api/admin/orders?search=&status=&from=&to=&limit=100&offset=0
// POST /api/admin/orders — 새 주문 생성 (주문번호 자동 발급)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `BSQ${y}${m}${d}${h}${mi}-${rand}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  // GET: 주문 목록 조회
  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const search = url.searchParams.get('search') || '';
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 500);
      const offset = parseInt(url.searchParams.get('offset')) || 0;

      let sql = 'SELECT * FROM orders WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (order_id LIKE ? OR user_name LIKE ? OR class_title LIKE ? OR user_email LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s, s);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (from) {
        sql += ' AND date(created_at) >= ?';
        params.push(from);
      }
      if (to) {
        sql += ' AND date(created_at) <= ?';
        params.push(to);
      }

      // 총 건수
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as cnt');
      const countResult = await db.prepare(countSql).bind(...params).first();

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const { results } = await db.prepare(sql).bind(...params).all();

      return new Response(JSON.stringify({
        success: true,
        data: results || [],
        total: countResult?.cnt || 0
      }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // POST: 새 주문 생성
  if (method === 'POST') {
    try {
      const body = await request.json();
      const orderId = generateOrderId();
      const finalAmount = (body.amount || 0) - (body.discount_amount || 0);

      await db.prepare(`
        INSERT INTO orders (order_id, user_id, user_name, user_email, class_id, class_title, order_type, amount, discount_amount, final_amount, coupon_code, pay_method, card_name, status, merchant_uid, receipt_url, memo, created_at, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).bind(
        orderId, body.user_id, body.user_name || '', body.user_email || '',
        body.class_id || null, body.class_title || '', body.order_type || 'class_pass',
        body.amount || 0, body.discount_amount || 0, finalAmount,
        body.coupon_code || null, body.pay_method || '', body.card_name || '',
        body.status || 'paid', body.merchant_uid || '', body.receipt_url || '',
        body.memo || '', body.status === 'paid' ? new Date().toISOString() : null
      ).run();

      // 입금 기록
      if (body.status === 'paid' && finalAmount > 0) {
        const fId = 'FR' + Date.now() + Math.random().toString(36).substr(2, 4);
        await db.prepare(`
          INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
          VALUES (?, 'income', ?, ?, ?, datetime('now'))
        `).bind(fId, finalAmount, `주문 ${orderId} 입금`, orderId).run();
      }

      return new Response(JSON.stringify({ success: true, order_id: orderId }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // PUT: 주문 상태 변경 (환불 등)
  if (method === 'PUT') {
    try {
      const body = await request.json();
      if (!body.order_id) throw new Error('order_id required');

      const updates = [];
      const params = [];
      if (body.status) { updates.push('status = ?'); params.push(body.status); }
      if (body.status === 'refunded') { updates.push("refunded_at = datetime('now')"); }
      if (body.memo) { updates.push('memo = ?'); params.push(body.memo); }

      if (updates.length === 0) throw new Error('No updates');

      params.push(body.order_id);
      await db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`).bind(...params).run();

      // 환불 시 출금 기록
      if (body.status === 'refunded') {
        const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?').bind(body.order_id).first();
        if (order) {
          const fId = 'FR' + Date.now() + Math.random().toString(36).substr(2, 4);
          await db.prepare(`
            INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
            VALUES (?, 'refund', ?, ?, ?, datetime('now'))
          `).bind(fId, order.final_amount, `주문 ${body.order_id} 환불`, body.order_id).run();
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
}
