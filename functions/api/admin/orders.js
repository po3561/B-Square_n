import { json, options } from '../_lib/http.js';
import { refreshClassStats } from '../_lib/class_support.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

async function loadOrderDetail(db, orderId) {
  const order = await db.prepare(`
    SELECT *
    FROM orders
    WHERE order_id = ?
  `).bind(orderId).first();

  if (!order) return null;

  const { results: refundLogs } = await db.prepare(`
    SELECT
      id,
      refund_type,
      original_amount,
      refund_amount,
      reason_tags,
      reason_note,
      status,
      processed_by,
      processed_at,
      created_at
    FROM user_refund_logs
    WHERE order_id = ?
    ORDER BY datetime(created_at) DESC
  `).bind(orderId).all().catch(() => ({ results: [] }));

  const { results: financialRows } = await db.prepare(`
    SELECT
      id,
      type,
      amount,
      description,
      created_at
    FROM financial_records
    WHERE related_order_id = ?
    ORDER BY datetime(created_at) DESC
  `).bind(orderId).all().catch(() => ({ results: [] }));

  const couponUsage = order.coupon_code
    ? await db.prepare(`
        SELECT
          id,
          wallet_id,
          discount_amount,
          used_at
        FROM coupon_usage
        WHERE order_id = ?
        ORDER BY datetime(used_at) DESC
        LIMIT 1
      `).bind(orderId).first().catch(() => null)
    : null;

  const settlementItem = order.settlement_item_id
    ? await db.prepare('SELECT * FROM settlement_batch_items WHERE id = ?').bind(order.settlement_item_id).first().catch(() => null)
    : null;
  const settlementBatch = order.settlement_batch_id
    ? await db.prepare('SELECT * FROM settlement_batches WHERE id = ?').bind(order.settlement_batch_id).first().catch(() => null)
    : null;

  return {
    ...order,
    refund_logs: refundLogs || [],
    financial_rows: financialRows || [],
    coupon_usage: couponUsage,
    settlement_item: settlementItem,
    settlement_batch: settlementBatch,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);
  await ensureOperationsSchema(db);

  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      const orderId = normalizeText(url.searchParams.get('order_id'));
      if (orderId) {
        const detail = await loadOrderDetail(db, orderId);
        if (!detail) {
          return json(request, env, { success: false, error: 'Order not found.' }, { status: 404 });
        }
        return json(request, env, { success: true, data: detail });
      }

      const search = normalizeText(url.searchParams.get('search') || url.searchParams.get('q'));
      const status = normalizeText(url.searchParams.get('status'));
      const from = normalizeText(url.searchParams.get('from') || url.searchParams.get('start'));
      const to = normalizeText(url.searchParams.get('to') || url.searchParams.get('end'));
      const classId = normalizeText(url.searchParams.get('class_id'));
      const userId = normalizeText(url.searchParams.get('user_id'));
      const settlementStatus = normalizeText(url.searchParams.get('settlement_status'));
      const year = normalizeText(url.searchParams.get('year'));
      const month = normalizeText(url.searchParams.get('month'));
      const limit = Math.min(normalizeInt(url.searchParams.get('limit'), 50), 500);
      const offset = normalizeInt(url.searchParams.get('offset'));

      let sql = `
        SELECT
          o.*,
          (
            SELECT reason_note
            FROM user_refund_logs r
            WHERE r.order_id = o.order_id
            ORDER BY datetime(r.created_at) DESC
            LIMIT 1
          ) AS latest_refund_reason_note,
          (
            SELECT refund_amount
            FROM user_refund_logs r
            WHERE r.order_id = o.order_id
            ORDER BY datetime(r.created_at) DESC
            LIMIT 1
          ) AS latest_refund_amount
        FROM orders o
        WHERE 1 = 1
      `;
      const params = [];

      if (search) {
        const keyword = `%${search}%`;
        sql += ' AND (o.order_id LIKE ? OR o.user_name LIKE ? OR o.class_title LIKE ? OR o.user_email LIKE ?)';
        params.push(keyword, keyword, keyword, keyword);
      }
      if (status) {
        sql += ' AND o.status = ?';
        params.push(status);
      }
      if (classId) {
        sql += ' AND o.class_id = ?';
        params.push(classId);
      }
      if (userId) {
        sql += ' AND o.user_id = ?';
        params.push(userId);
      }
      if (settlementStatus) {
        sql += ' AND o.settlement_status = ?';
        params.push(settlementStatus);
      }
      if (from) {
        sql += ' AND date(o.created_at) >= ?';
        params.push(from);
      }
      if (to) {
        sql += ' AND date(o.created_at) <= ?';
        params.push(to);
      }
      if (year && month) {
        sql += ' AND strftime(\'%Y\', COALESCE(o.paid_at, o.created_at)) = ? AND strftime(\'%m\', COALESCE(o.paid_at, o.created_at)) = ?';
        params.push(year, String(month).padStart(2, '0'));
      }

      const countSql = sql.replace(/SELECT[\s\S]*?FROM orders o/i, 'SELECT COUNT(*) AS cnt FROM orders o');
      const countResult = await db.prepare(countSql).bind(...params).first().catch(() => ({ cnt: 0 }));

      sql += ' ORDER BY datetime(COALESCE(o.paid_at, o.created_at)) DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const { results } = await db.prepare(sql).bind(...params).all();
      return json(request, env, {
        success: true,
        data: results || [],
        total: Number(countResult?.cnt || 0),
      });
    }

    if (method === 'POST') {
      const body = await request.json();
      const orderId = normalizeText(body.order_id) || generateOrderId();
      const amount = Math.max(0, normalizeInt(body.amount));
      const discountAmount = Math.max(0, normalizeInt(body.discount_amount));
      const finalAmount = Math.max(0, normalizeInt(body.final_amount, Math.max(amount - discountAmount, 0)));
      const status = normalizeText(body.status || 'paid') || 'paid';
      const normalizedStatus = status.toLowerCase();
      const isPaid = ['paid', 'completed', 'done', 'success'].includes(normalizedStatus);

      await db.prepare(`
        INSERT INTO orders (
          order_id, user_id, user_name, user_email, class_id, class_title,
          order_type, amount, discount_amount, final_amount, coupon_code,
          coupon_scope, coupon_name, pay_method, card_name, status,
          merchant_uid, receipt_url, payment_provider, payment_reference,
          payment_payload, source_enrollment_id, source_type, memo,
          settlement_status, settlement_month, created_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).bind(
        orderId,
        normalizeText(body.user_id) || null,
        normalizeText(body.user_name),
        normalizeText(body.user_email),
        normalizeText(body.class_id) || null,
        normalizeText(body.class_title),
        normalizeText(body.order_type || 'class_pass') || 'class_pass',
        amount,
        discountAmount,
        finalAmount,
        normalizeText(body.coupon_code) || null,
        normalizeText(body.coupon_scope) || null,
        normalizeText(body.coupon_name) || null,
        normalizeText(body.pay_method),
        normalizeText(body.card_name),
        status,
        normalizeText(body.merchant_uid) || orderId,
        normalizeText(body.receipt_url) || null,
        normalizeText(body.payment_provider) || null,
        normalizeText(body.payment_reference) || null,
        body.payment_payload ? JSON.stringify(body.payment_payload) : null,
        normalizeText(body.source_enrollment_id) || null,
        normalizeText(body.source_type || 'manual') || 'manual',
        normalizeText(body.memo),
        normalizeText(body.settlement_status || 'pending') || 'pending',
        normalizeText(body.settlement_month) || null,
        isPaid ? new Date().toISOString() : null,
      ).run();

      if (isPaid && finalAmount > 0) {
        await db.prepare(`
          INSERT INTO financial_records (
            id, type, amount, description, related_order_id, related_user_id, metadata, created_at
          ) VALUES (?, 'income', ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `FR_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          finalAmount,
          `Order ${orderId} payment`,
          orderId,
          normalizeText(body.user_id) || null,
          JSON.stringify({
            class_id: normalizeText(body.class_id),
            class_title: normalizeText(body.class_title),
          }),
        ).run();
      }

      if (isPaid && body.class_id) {
        await refreshClassStats(db, body.class_id).catch(() => null);
      }

      return json(request, env, { success: true, order_id: orderId });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const orderId = normalizeText(body.order_id);
      if (!orderId) {
        return json(request, env, { success: false, error: 'order_id required' }, { status: 400 });
      }

      const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?').bind(orderId).first();
      if (!order) {
        return json(request, env, { success: false, error: 'Order not found.' }, { status: 404 });
      }

      const requestedStatus = normalizeText(body.status || (body.action === 'refund' ? 'refunded' : ''));
      const memo = body.memo !== undefined ? normalizeText(body.memo) : undefined;
      const refundAmount = normalizeInt(body.refund_amount, normalizeInt(order.final_amount || order.amount || 0));
      const refundReason = normalizeText(body.refund_reason);
      const refundReasonNote = normalizeText(body.refund_reason_note || body.reason_note);

      const updates = [];
      const params = [];

      if (requestedStatus) {
        updates.push('status = ?');
        params.push(requestedStatus);
      }
      if (memo !== undefined) {
        updates.push('memo = ?');
        params.push(memo);
      }
      if (requestedStatus === 'refunded' || requestedStatus === 'partial_refunded') {
        updates.push('refunded_at = datetime(\'now\')');
        updates.push('refund_amount = ?');
        params.push(refundAmount);
        updates.push('refund_type = ?');
        params.push(requestedStatus === 'partial_refunded' ? 'partial' : 'full');
        updates.push('refund_status = ?');
        params.push(requestedStatus);
        updates.push('refund_reason = ?');
        params.push(refundReason || null);
        updates.push('refund_reason_note = ?');
        params.push(refundReasonNote || null);
        updates.push('refund_processed_at = datetime(\'now\')');
        updates.push('settlement_status = ?');
        params.push(requestedStatus);
      }
      if (body.settlement_status !== undefined) {
        updates.push('settlement_status = ?');
        params.push(normalizeText(body.settlement_status) || 'pending');
      }

      if (!updates.length) {
        return json(request, env, { success: false, error: 'No updates.' }, { status: 400 });
      }

      params.push(orderId);
      await db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`).bind(...params).run();

      if (requestedStatus === 'refunded' || requestedStatus === 'partial_refunded') {
        const existingRefundRecord = await db.prepare(`
          SELECT id
          FROM financial_records
          WHERE related_order_id = ? AND type = 'refund'
          ORDER BY datetime(created_at) DESC
          LIMIT 1
        `).bind(orderId).first().catch(() => null);

        if (!existingRefundRecord) {
          await db.prepare(`
            INSERT INTO financial_records (
              id, type, amount, description, related_order_id, related_user_id, metadata, created_at
            ) VALUES (?, 'refund', ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            `FR_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            refundAmount,
            `Order ${orderId} refunded`,
            orderId,
            order.user_id || null,
            JSON.stringify({
              refund_reason: refundReason,
              refund_reason_note: refundReasonNote,
            }),
          ).run();
        }
      }

      if (order.class_id) {
        await refreshClassStats(db, order.class_id).catch(() => null);
      }

      return json(request, env, { success: true, data: await loadOrderDetail(db, orderId) });
    }
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
