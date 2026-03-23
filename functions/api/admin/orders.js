// Admin orders API
// GET  /api/admin/orders?search=&status=&from=&to=&limit=100&offset=0
// POST /api/admin/orders
// PUT  /api/admin/orders  { order_id, status | action:'refund' }

import { json, options } from '../_lib/http.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BSQ${y}${m}${d}${h}${mi}-${rand}`;
}

async function ensureOrderSupportSchema(db) {
  await ensureOperationsSchema(db);
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);
  await ensureOrderSupportSchema(db);

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const search = url.searchParams.get('search') || url.searchParams.get('q') || '';
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || url.searchParams.get('start') || '';
      const to = url.searchParams.get('to') || url.searchParams.get('end') || '';
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

      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS cnt');
      const countResult = await db.prepare(countSql).bind(...params).first().catch(() => ({ cnt: 0 }));

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const { results } = await db.prepare(sql).bind(...params).all();

      return json(request, env, {
        success: true,
        data: results || [],
        total: countResult?.cnt || 0,
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const orderId = generateOrderId();
      const amount = Number(body.amount) || 0;
      const discountAmount = Number(body.discount_amount) || 0;
      const finalAmount = amount - discountAmount;
      const status = body.status || 'paid';

      await db.prepare(`
        INSERT INTO orders (
          order_id, user_id, user_name, user_email, class_id, class_title,
          order_type, amount, discount_amount, final_amount, coupon_code,
          pay_method, card_name, status, merchant_uid, receipt_url, memo,
          created_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).bind(
        orderId,
        body.user_id || null,
        body.user_name || '',
        body.user_email || '',
        body.class_id || null,
        body.class_title || '',
        body.order_type || 'class_pass',
        amount,
        discountAmount,
        finalAmount,
        body.coupon_code || null,
        body.pay_method || '',
        body.card_name || '',
        status,
        body.merchant_uid || '',
        body.receipt_url || '',
        body.memo || '',
        status === 'paid' ? new Date().toISOString() : null,
      ).run();

      if (status === 'paid' && finalAmount > 0) {
        const fId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
          VALUES (?, 'income', ?, ?, ?, datetime('now'))
        `).bind(fId, finalAmount, `Order ${orderId} payment`, orderId).run();
      }

      return json(request, env, { success: true, order_id: orderId });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      if (!body.order_id) throw new Error('order_id required');

      const requestedStatus = body.status || (body.action === 'refund' ? 'refunded' : '');
      const updates = [];
      const params = [];

      if (requestedStatus) {
        updates.push('status = ?');
        params.push(requestedStatus);
      }
      if (requestedStatus === 'refunded') {
        updates.push('refunded_at = datetime(\'now\')');
      }
      if (body.memo !== undefined) {
        updates.push('memo = ?');
        params.push(body.memo);
      }

      if (updates.length === 0) throw new Error('No updates');

      params.push(body.order_id);
      await db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`).bind(...params).run();

      if (requestedStatus === 'refunded') {
        const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?').bind(body.order_id).first();
        if (order) {
          const fId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
          await db.prepare(`
            INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
            VALUES (?, 'refund', ?, ?, ?, datetime('now'))
          `).bind(fId, order.final_amount || 0, `Order ${body.order_id} refunded`, body.order_id).run();
        }
      }

      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
