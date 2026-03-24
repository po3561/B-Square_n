import { getCurrentUser, requireClassManager, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema, ensureOperationsSchema } from './_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowTime() {
  return Date.now();
}

function isCouponActive(coupon) {
  if (!coupon || !Number(coupon.is_active ?? 1)) return false;
  const now = nowTime();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return false;
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return false;
  return true;
}

function parseTargetIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizeText(item)).filter(Boolean);
    }
  } catch {}
  return String(value)
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function couponAppliesToClass(coupon, classId) {
  const scope = normalizeText(coupon.scope || 'all_classes') || 'all_classes';
  if (!classId || scope === 'all_classes') return true;
  if (scope === 'single_class') {
    return parseTargetIds(coupon.target_ids).includes(classId);
  }
  return true;
}

function mapCouponPayload(coupon, scope, extra = {}) {
  return {
    ...coupon,
    scope,
    coupon_scope: scope,
    value: Number(coupon.value ?? coupon.amount ?? 0),
    amount: Number(coupon.amount ?? coupon.value ?? 0),
    type: normalizeText(coupon.type || 'amount') || 'amount',
    image_url: coupon.image_url || '',
    coupon_code: coupon.coupon_code || coupon.code || '',
    code: coupon.code || coupon.coupon_code || '',
    ...extra,
  };
}

async function validateGlobalCoupon(db, { code, classId, userId, orderAmount }) {
  const coupon = await db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(code).first();
  if (!coupon) return null;
  if (!isCouponActive(coupon)) {
    throw new Error('Coupon is inactive or expired.');
  }
  if (!couponAppliesToClass(coupon, classId)) {
    throw new Error('Coupon is not available for this class.');
  }

  const minOrderAmount = Number(coupon.min_order_amount || 0);
  if (minOrderAmount > 0 && Number(orderAmount || 0) < minOrderAmount) {
    throw new Error('Order amount does not meet coupon minimum.');
  }

  const walletCountRow = await db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM user_coupon_wallet
    WHERE coupon_code = ?
  `).bind(code).first().catch(() => ({ cnt: 0 }));
  const issuedCount = Number(walletCountRow?.cnt || 0);

  if (Number(coupon.max_issue_count || 0) > 0 && issuedCount >= Number(coupon.max_issue_count || 0)) {
    const walletForUser = userId
      ? await db.prepare(`
          SELECT *
          FROM user_coupon_wallet
          WHERE coupon_code = ? AND user_id = ?
          ORDER BY datetime(created_at) DESC
          LIMIT 1
        `).bind(code, userId).first().catch(() => null)
      : null;
    if (!walletForUser) {
      throw new Error('Coupon issue limit reached.');
    }
  }

  let wallet = null;
  if (userId) {
    wallet = await db.prepare(`
      SELECT *
      FROM user_coupon_wallet
      WHERE coupon_code = ? AND user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).bind(code, userId).first().catch(() => null);

    const usageRow = await db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM coupon_usage
      WHERE coupon_code = ? AND user_id = ?
    `).bind(code, userId).first().catch(() => ({ cnt: 0 }));

    const userUsageCount = Number(usageRow?.cnt || 0);
    const perUserLimit = Math.max(1, Number(coupon.per_user_limit || 1));
    if (wallet?.status === 'used' || userUsageCount >= perUserLimit) {
      throw new Error('Coupon already used by this user.');
    }
  }

  return {
    coupon,
    wallet,
    issued_count: issuedCount,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const classId = normalizeText(url.searchParams.get('class_id'));
  const code = normalizeText(url.searchParams.get('code')).toUpperCase();
  const orderAmount = normalizeInt(url.searchParams.get('order_amount'));
  const current = await getCurrentUser(context).catch(() => null);

  await ensureOperationsSchema(env.DB);
  await ensureCommerceSchema(env.DB);

  try {
    if (code) {
      if (classId) {
        const classCoupon = await env.DB.prepare(`
          SELECT *
          FROM coupons
          WHERE coupon_code = ? AND class_id = ?
        `).bind(code, classId).first();

        if (classCoupon) {
          if (Number(classCoupon.limit_count || 0) > 0 && Number(classCoupon.used_count || 0) >= Number(classCoupon.limit_count || 0)) {
            return json(request, env, { success: false, error: 'Coupon usage limit reached.' }, { status: 409 });
          }
          return json(request, env, { success: true, data: mapCouponPayload(classCoupon, 'class') });
        }
      }

      const classRow = classId
        ? await env.DB.prepare('SELECT price FROM classes WHERE id = ?').bind(classId).first().catch(() => null)
        : null;
      const globalValidation = await validateGlobalCoupon(env.DB, {
        code,
        classId,
        userId: current?.user?.id || '',
        orderAmount: orderAmount || Number(classRow?.price || 0),
      }).catch((error) => {
        throw error;
      });

      if (!globalValidation?.coupon) {
        return json(request, env, { success: false, error: 'Coupon not found.' }, { status: 404 });
      }

      return json(request, env, {
        success: true,
        data: mapCouponPayload(globalValidation.coupon, 'global', {
          wallet_status: globalValidation.wallet?.status || null,
          issued_count: globalValidation.issued_count,
        }),
      });
    }

    if (classId) {
      const auth = await requireClassManager(context, classId);
      if (!auth.ok) return auth.response;

      const { results } = await env.DB.prepare(`
        SELECT *
        FROM coupons
        WHERE class_id = ?
        ORDER BY coupon_code ASC
      `).bind(classId).all();

      return json(request, env, { success: true, data: results || [] });
    }

    return json(request, env, { success: false, error: 'class_id or code is required.' }, { status: 400 });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 400 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  await ensureOperationsSchema(env.DB);
  await ensureCommerceSchema(env.DB);

  try {
    const body = await request.json();

    if (body?.action === 'claim') {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;

      const code = normalizeText(body.code).toUpperCase();
      if (!code) {
        return json(request, env, { success: false, error: 'code is required.' }, { status: 400 });
      }

      const validation = await validateGlobalCoupon(env.DB, {
        code,
        classId: normalizeText(body.class_id),
        userId: auth.user.id,
        orderAmount: normalizeInt(body.order_amount),
      });

      const existingWallet = validation.wallet;
      if (existingWallet && existingWallet.status === 'active') {
        return json(request, env, { success: true, data: existingWallet });
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
        normalizeText(body.claimed_via || 'manual') || 'manual',
        validation.coupon.expires_at || null,
        JSON.stringify({
          source: 'api/coupons',
          class_id: normalizeText(body.class_id),
        }),
      ).run();

      const wallet = await env.DB.prepare('SELECT * FROM user_coupon_wallet WHERE id = ?').bind(walletId).first();
      return json(request, env, {
        success: true,
        data: {
          wallet,
          coupon: mapCouponPayload(validation.coupon, 'global'),
        },
      });
    }

    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;

    const classId = normalizeText(body.class_id);
    const code = normalizeText(body.code).toUpperCase();
    if (!classId || !code) {
      return json(request, env, { success: false, error: 'class_id and code are required.' }, { status: 400 });
    }

    const classAuth = await requireClassManager(context, classId);
    if (!classAuth.ok) return classAuth.response;

    const existing = await env.DB.prepare(`
      SELECT 1
      FROM coupons
      WHERE class_id = ? AND coupon_code = ?
    `).bind(classId, code).first();

    if (existing) {
      return json(request, env, { success: false, error: 'Coupon already exists.' }, { status: 409 });
    }

    await env.DB.prepare(`
      INSERT INTO coupons (class_id, coupon_code, type, value, limit_count, used_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
      classId,
      code,
      normalizeText(body.type || 'amount') || 'amount',
      normalizeInt(body.value),
      normalizeInt(body.max_limit),
    ).run();

    return json(request, env, { success: true, message: 'Coupon created.' }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const classId = normalizeText(url.searchParams.get('class_id'));
  const code = normalizeText(url.searchParams.get('code')).toUpperCase();

  if (!classId || !code) {
    return json(request, env, { success: false, error: 'class_id and code are required.' }, { status: 400 });
  }

  await ensureOperationsSchema(env.DB);
  await ensureCommerceSchema(env.DB);

  const auth = await requireClassManager(context, classId);
  if (!auth.ok) return auth.response;

  try {
    await env.DB.prepare('DELETE FROM coupons WHERE class_id = ? AND coupon_code = ?').bind(classId, code).run();
    return json(request, env, { success: true });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
