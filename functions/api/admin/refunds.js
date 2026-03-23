import { isAtLeastRole, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return [];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildRefundMemo(reasonTags, reasonNote) {
  const parts = [];
  if (reasonTags.length) parts.push(`사유: ${reasonTags.join(', ')}`);
  if (reasonNote) parts.push(`메모: ${reasonNote}`);
  return parts.join(' | ');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  if (!isAtLeastRole(auth.user.role, 'operator')) {
    return json(request, env, { success: false, error: '운영자 이상만 환불을 처리할 수 있습니다.' }, { status: 403 });
  }

  await ensureOperationsSchema(env.DB);

  try {
    const body = await request.json();
    const orderId = normalizeText(body.order_id);
    const userId = normalizeText(body.user_id);
    const refundType = normalizeText(body.refund_type || 'full').toLowerCase();
    const reasonTags = normalizeTags(body.reason_tags || body.tags);
    const reasonNote = normalizeText(body.reason_note || body.reason || '');

    if (!orderId) {
      return json(request, env, { success: false, error: 'order_id가 필요합니다.' }, { status: 400 });
    }

    const order = await env.DB.prepare(`
      SELECT *
      FROM orders
      WHERE order_id = ?
    `).bind(orderId).first();

    if (!order) {
      return json(request, env, { success: false, error: '결제 내역을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (userId && normalizeText(order.user_id) && normalizeText(order.user_id) !== userId) {
      return json(request, env, { success: false, error: '주문과 회원 정보가 일치하지 않습니다.' }, { status: 400 });
    }

    const existingRefund = await env.DB.prepare(`
      SELECT id
      FROM user_refund_logs
      WHERE order_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).bind(orderId).first();

    if (existingRefund) {
      return json(request, env, { success: false, error: '이미 환불 처리된 주문입니다.' }, { status: 409 });
    }

    const originalAmount = toNumber(order.final_amount || order.amount || 0);
    if (!originalAmount) {
      return json(request, env, { success: false, error: '환불할 금액이 없습니다.' }, { status: 400 });
    }

    let refundAmount = originalAmount;
    if (refundType === 'partial') {
      refundAmount = toNumber(body.refund_amount);
      if (!refundAmount || refundAmount <= 0) {
        return json(request, env, { success: false, error: '부분 환불 금액을 입력해 주세요.' }, { status: 400 });
      }
      if (refundAmount >= originalAmount) {
        return json(request, env, { success: false, error: '부분 환불 금액은 결제금액보다 작아야 합니다.' }, { status: 400 });
      }
    } else if (refundType !== 'full') {
      return json(request, env, { success: false, error: '환불 유형이 올바르지 않습니다.' }, { status: 400 });
    }

    const refundStatus = refundType === 'partial' ? 'partial_refunded' : 'refunded';
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const processedAt = new Date().toISOString();
    const memoText = buildRefundMemo(reasonTags, reasonNote);
    const metadata = JSON.stringify({
      requested_by: auth.user.id,
      requested_role: auth.user.role,
      refund_type: refundType,
      reason_tags: reasonTags,
      reason_note: reasonNote,
      order_snapshot: {
        order_id: order.order_id,
        user_id: order.user_id,
        user_name: order.user_name,
        class_id: order.class_id,
        class_title: order.class_title,
        amount: order.amount,
        discount_amount: order.discount_amount,
        final_amount: order.final_amount,
        pay_method: order.pay_method,
        card_name: order.card_name,
        status: order.status,
      },
    });

    await env.DB.prepare(`
      UPDATE orders
      SET status = ?, refunded_at = datetime('now'), memo = CASE
        WHEN memo IS NULL OR memo = '' THEN ?
        ELSE memo || ' | ' || ?
      END
      WHERE order_id = ?
    `).bind(refundStatus, memoText || '환불 처리됨', memoText || '환불 처리됨', orderId).run();

    await env.DB.prepare(`
      INSERT INTO user_refund_logs (
        id, user_id, order_id, class_id, class_title,
        refund_type, original_amount, refund_amount,
        reason_tags, reason_note, status,
        processed_by, processed_at, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      refundId,
      normalizeText(order.user_id || userId),
      order.order_id,
      order.class_id || null,
      order.class_title || '',
      refundType,
      originalAmount,
      refundAmount,
      JSON.stringify(reasonTags),
      reasonNote,
      'completed',
      auth.user.id,
      processedAt,
      metadata,
    ).run();

    const financialId = `FR_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(`
      INSERT INTO financial_records (
        id, type, amount, description, related_order_id, created_at
      ) VALUES (?, 'refund', ?, ?, ?, datetime('now'))
    `).bind(
      financialId,
      refundAmount,
      `${refundType === 'partial' ? 'Partial' : 'Full'} refund for ${order.order_id}`,
      order.order_id,
    ).run();

    return json(request, env, {
      success: true,
      data: {
        id: refundId,
        order_id: order.order_id,
        refund_type: refundType,
        refund_amount: refundAmount,
        status: refundStatus,
      },
    });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
