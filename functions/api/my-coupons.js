import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema } from './_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTargetIds(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeText(item)).filter(Boolean);
  } catch {}
  return String(value).split(',').map((item) => normalizeText(item)).filter(Boolean);
}

function resolveTargetClassId(coupon) {
  const targetIds = parseTargetIds(coupon.target_ids);
  return normalizeText(coupon.target_class_id || targetIds[0] || '');
}

function isCouponActive(coupon) {
  if (!coupon || !Number(coupon.is_active ?? 1)) return false;
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return false;
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return false;
  return true;
}

function couponAppliesToClass(coupon, classId) {
  const scope = normalizeText(coupon.scope || 'all_classes') || 'all_classes';
  if (!classId || scope === 'all_classes') return true;
  if (scope === 'single_class') {
    const targetClassId = resolveTargetClassId(coupon);
    if (targetClassId && String(targetClassId) === String(classId)) return true;
    return parseTargetIds(coupon.target_ids).includes(classId);
  }
  return true;
}

async function loadCoupon(db, code) {
  return db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(code).first();
}

async function getWalletCoupon(db, walletId) {
  return db.prepare(`
    SELECT
      w.*,
      c.name,
      c.description,
      c.image_url,
      c.type,
      c.amount,
      c.scope,
      c.target_kind,
      c.target_ids,
      c.target_class_id,
      c.min_order_amount,
      c.starts_at,
      c.expires_at AS coupon_expires_at,
      c.is_active
    FROM user_coupon_wallet w
    JOIN global_coupons c
      ON c.code = w.coupon_code
    WHERE w.id = ?
  `).bind(walletId).first();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    const url = new URL(request.url);
    const status = normalizeText(url.searchParams.get('status'));
    const classId = normalizeText(url.searchParams.get('class_id'));

    let sql = `
      SELECT
        w.*,
        c.name,
        c.description,
        c.image_url,
        c.type,
        c.amount,
        c.scope,
        c.target_kind,
        c.target_ids,
        c.target_class_id,
        c.min_order_amount,
        c.starts_at,
        c.expires_at AS coupon_expires_at,
        c.is_active
      FROM user_coupon_wallet w
      JOIN global_coupons c
        ON c.code = w.coupon_code
      WHERE w.user_id = ?
    `;
    const params = [auth.user.id];

    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY CASE WHEN w.status = \'active\' THEN 0 ELSE 1 END, datetime(w.issued_at) DESC';

    const { results } = await env.DB.prepare(sql).bind(...params).all();
    const rows = (results || []).map((item) => ({
      ...item,
      usable_for_class: couponAppliesToClass(item, classId),
      is_available: isCouponActive(item) && item.status === 'active',
    }));

    return json(request, env, { success: true, data: rows });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    const body = await request.json();
    const code = normalizeText(body.code).toUpperCase();
    if (!code) {
      return json(request, env, { success: false, error: 'code is required.' }, { status: 400 });
    }

    const coupon = await loadCoupon(env.DB, code);
    if (!coupon) {
      return json(request, env, { success: false, error: 'Coupon not found.' }, { status: 404 });
    }
    if (!isCouponActive(coupon)) {
      return json(request, env, { success: false, error: 'Coupon is inactive or expired.' }, { status: 400 });
    }

    const existingWallet = await env.DB.prepare(`
      SELECT *
      FROM user_coupon_wallet
      WHERE coupon_code = ? AND user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).bind(code, auth.user.id).first().catch(() => null);

    const perUserLimit = Math.max(1, normalizeInt(coupon.per_user_limit, 1));
    const usageRow = await env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM coupon_usage
      WHERE coupon_code = ? AND user_id = ?
    `).bind(code, auth.user.id).first().catch(() => ({ cnt: 0 }));

    if (existingWallet?.status === 'active') {
      return json(request, env, { success: true, data: await getWalletCoupon(env.DB, existingWallet.id) });
    }
    if (Number(usageRow?.cnt || 0) >= perUserLimit) {
      return json(request, env, { success: false, error: 'Coupon already used.' }, { status: 409 });
    }

    const issuedRow = await env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM user_coupon_wallet
      WHERE coupon_code = ?
    `).bind(code).first().catch(() => ({ cnt: 0 }));
    if (normalizeInt(coupon.max_issue_count) > 0 && Number(issuedRow?.cnt || 0) >= normalizeInt(coupon.max_issue_count)) {
      return json(request, env, { success: false, error: 'Coupon issue limit reached.' }, { status: 409 });
    }

    const walletId = `ucw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(`
      INSERT INTO user_coupon_wallet (
        id, coupon_code, user_id, status, claimed_via,
        issued_at, expires_at, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))
    `).bind(
      walletId,
      code,
      auth.user.id,
      normalizeText(body.claimed_via || 'mypage') || 'mypage',
      coupon.expires_at || null,
      JSON.stringify({
        source: 'api/my-coupons',
      }),
    ).run();

    return json(request, env, { success: true, data: await getWalletCoupon(env.DB, walletId) }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
