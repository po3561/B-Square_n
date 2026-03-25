import { applyMasterAdminOverride, isAtLeastRole, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

function normalizeLimit(value, fallback = 25, max = 100) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function normalizeOffset(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function dedupeBySignature(items, getSignature) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const signature = getSignature(item);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }

  return result;
}

function mapUser(row) {
  if (!row) return null;
  const user = applyMasterAdminOverride({
    id: row.user_id || row.id || '',
    email: row.email || '',
    name: row.name || '',
    username: row.username || '',
    phone: row.phone || '',
    profile_image_url: row.profile_image_url || '',
    role: row.role || 'user',
    membership_level: row.membership_level || 'Free',
    is_blacklisted: row.is_blacklisted,
    blacklisted_at: row.blacklisted_at || null,
    blacklisted_by: row.blacklisted_by || null,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    phone: user.phone,
    profile_image_url: user.profile_image_url,
    role: user.role,
    membership_level: user.membership_level,
    is_blacklisted: normalizeBoolean(user.is_blacklisted),
    blacklisted_at: user.blacklisted_at || null,
    blacklisted_by: user.blacklisted_by || null,
  };
}

function blacklistSignature(row) {
  return [
    normalizeText(row?.user_id),
    normalizeText(row?.previous_state),
    normalizeText(row?.new_state),
    normalizeText(row?.changed_by),
    normalizeText(row?.reason),
  ].join('|');
}

function refundSignature(row) {
  return [
    normalizeText(row?.user_id),
    normalizeText(row?.order_id),
    normalizeText(row?.class_id),
    normalizeText(row?.refund_type),
    normalizeText(row?.original_amount),
    normalizeText(row?.refund_amount),
    normalizeText(row?.reason_tags),
    normalizeText(row?.reason_note),
    normalizeText(row?.status),
    normalizeText(row?.processed_by),
  ].join('|');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  if (!isAtLeastRole(auth.user.role, 'operator')) {
    return json(request, env, { success: false, error: '운영자 이상만 볼 수 있습니다.' }, { status: 403 });
  }

  await ensureOperationsSchema(env.DB);

  try {
    const url = new URL(request.url);
    const limit = normalizeLimit(url.searchParams.get('limit'), 25, 100);
    const offset = normalizeOffset(url.searchParams.get('offset'));

    const blacklistRows = await env.DB.prepare(`
      SELECT
        l.id,
        l.user_id,
        l.previous_state,
        l.new_state,
        l.changed_by,
        l.reason,
        l.created_at,
        u.email,
        u.name,
        u.username,
        u.phone,
        u.profile_image_url,
        u.role,
        u.membership_level,
        u.is_blacklisted,
        u.blacklisted_at,
        u.blacklisted_by
      FROM user_blacklist_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY datetime(l.created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const refundRows = await env.DB.prepare(`
      SELECT
        r.id,
        r.user_id,
        r.order_id,
        r.class_id,
        r.class_title,
        r.refund_type,
        r.original_amount,
        r.refund_amount,
        r.reason_tags,
        r.reason_note,
        r.status,
        r.processed_by,
        r.processed_at,
        r.created_at,
        u.email,
        u.name,
        u.username,
        u.phone,
        u.profile_image_url,
        u.role,
        u.membership_level,
        o.status AS order_status,
        o.pay_method,
        o.final_amount
      FROM user_refund_logs r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN orders o ON o.order_id = r.order_id
      ORDER BY datetime(COALESCE(r.processed_at, r.created_at)) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const blacklist_logs_raw = (blacklistRows.results || [])
      .filter((row) => row.previous_state !== row.new_state)
      .map((row) => ({
        id: row.id,
        user: mapUser(row),
        previous_state: normalizeBoolean(row.previous_state),
        new_state: normalizeBoolean(row.new_state),
        changed_by: row.changed_by || '',
        reason: row.reason || '',
        created_at: row.created_at || '',
      }));

    const refund_logs_raw = (refundRows.results || []).map((row) => ({
      id: row.id,
      user: mapUser(row),
      order_id: row.order_id || '',
      class_id: row.class_id || '',
      class_title: row.class_title || '',
      refund_type: row.refund_type || 'full',
      original_amount: Number(row.original_amount || 0),
      refund_amount: Number(row.refund_amount || 0),
      reason_tags: row.reason_tags || '',
      reason_note: row.reason_note || '',
      status: row.status || '',
      processed_by: row.processed_by || '',
      processed_at: row.processed_at || '',
      order_status: row.order_status || '',
      pay_method: row.pay_method || '',
      final_amount: Number(row.final_amount || 0),
      created_at: row.created_at || '',
    }));

    const blacklist_logs = dedupeBySignature(blacklist_logs_raw, blacklistSignature);
    const refund_logs = dedupeBySignature(refund_logs_raw, refundSignature);

    return json(request, env, {
      success: true,
      data: {
        blacklist_logs,
        refund_logs,
        counts: {
          blacklist: blacklist_logs.length,
          refund: refund_logs.length,
        },
      },
    });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
