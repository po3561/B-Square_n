import { isAtLeastRole, requireClassManager, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema, ensureOperationsSchema } from './_lib/schema.js';
import { refreshClassStats } from './_lib/class_support.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTargetIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeText(item)).filter(Boolean);
  } catch {}
  return String(value).split(',').map((item) => normalizeText(item)).filter(Boolean);
}

function couponTargetsClass(coupon, classId) {
  const targetClassId = normalizeText(coupon.target_class_id);
  if (targetClassId && String(targetClassId) === String(classId)) return true;
  return parseTargetIds(coupon.target_ids).includes(classId);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateOrderId() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BSQ${y}${m}${d}${h}${mi}-${rand}`;
}

function computeBaseAmount(cls, payOption, fallbackAmount) {
  const basePrice = toNumber(cls?.price || fallbackAmount || 0);
  const option = normalizeText(payOption || 'onetime').toLowerCase();
  if (option === '30days') return Math.round(basePrice * 1.5);
  return basePrice;
}

async function resolveCoupon(db, { classId, code, userId, baseAmount }) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  const classCoupon = await db.prepare(`
    SELECT *
    FROM coupons
    WHERE class_id = ? AND coupon_code = ?
  `).bind(classId, normalizedCode).first();

  if (classCoupon) {
    const limitCount = toNumber(classCoupon.limit_count || 0);
    const usedCount = toNumber(classCoupon.used_count || 0);
    if (limitCount > 0 && usedCount >= limitCount) {
      throw new Error('Coupon usage limit reached.');
    }

    const couponDiscount = String(classCoupon.type || '').toLowerCase() === 'percent'
      ? Math.floor(baseAmount * (toNumber(classCoupon.value || 0) / 100))
      : toNumber(classCoupon.value || 0);

    return {
      scope: 'class',
      coupon_code: normalizedCode,
      coupon_type: classCoupon.type || 'amount',
      coupon_value: toNumber(classCoupon.value || 0),
      discount_amount: Math.min(Math.max(couponDiscount, 0), baseAmount),
      class_coupon: classCoupon,
      wallet: null,
    };
  }

  const globalCoupon = await db.prepare(`
    SELECT *
    FROM global_coupons
    WHERE code = ?
  `).bind(normalizedCode).first();

  if (!globalCoupon) {
    throw new Error('Coupon not found.');
  }
  if (!Number(globalCoupon.is_active ?? 1)) {
    throw new Error('Coupon is inactive.');
  }
  if (globalCoupon.starts_at && new Date(globalCoupon.starts_at) > new Date()) {
    throw new Error('Coupon has not started yet.');
  }
  if (globalCoupon.expires_at && new Date(globalCoupon.expires_at) < new Date()) {
    throw new Error('Coupon has expired.');
  }
  if (normalizeText(globalCoupon.scope || 'all_classes') === 'single_class' && classId && !couponTargetsClass(globalCoupon, classId)) {
    throw new Error('This coupon is limited to another class.');
  }

  const wallet = userId
    ? await db.prepare(`
        SELECT *
        FROM user_coupon_wallet
        WHERE coupon_code = ? AND user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `).bind(normalizedCode, userId).first().catch(() => null)
    : null;

  const perUserLimit = Math.max(1, toNumber(globalCoupon.per_user_limit || 1));
  if (wallet?.status === 'used') {
    throw new Error('Coupon already used by this user.');
  }

  const usageRow = userId
    ? await db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM coupon_usage
        WHERE coupon_code = ? AND user_id = ?
      `).bind(normalizedCode, userId).first().catch(() => ({ cnt: 0 }))
    : { cnt: 0 };

  if (userId && toNumber(usageRow?.cnt || 0) >= perUserLimit) {
    throw new Error('Coupon already used by this user.');
  }

  const discountAmount = String(globalCoupon.type || '').toLowerCase() === 'percent'
    ? Math.floor(baseAmount * (toNumber(globalCoupon.amount || 0) / 100))
    : toNumber(globalCoupon.amount || 0);

  return {
    scope: 'global',
    coupon_code: normalizedCode,
    coupon_type: globalCoupon.type || 'percent',
    coupon_value: toNumber(globalCoupon.amount || 0),
    discount_amount: Math.min(Math.max(discountAmount, 0), baseAmount),
    coupon: globalCoupon,
    wallet,
  };
}

async function applyCouponUsage(db, { couponInfo, userId, userName, orderId, classId, finalDiscountAmount }) {
  if (!couponInfo) return;

  if (couponInfo.scope === 'class' && couponInfo.class_coupon) {
    await db.prepare(`
      UPDATE coupons
      SET used_count = COALESCE(used_count, 0) + 1
      WHERE class_id = ? AND coupon_code = ?
    `).bind(classId, couponInfo.coupon_code).run();

    await db.prepare(`
      INSERT INTO coupon_usage (
        id, wallet_id, coupon_code, user_id, user_name, order_id, class_id,
        discount_amount, status, metadata, used_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'used', ?, datetime('now'))
    `).bind(
      generateId('cup'),
      couponInfo.coupon_code,
      userId,
      userName || '',
      orderId,
      classId,
      finalDiscountAmount,
      JSON.stringify({ scope: 'class' }),
    ).run();
    return;
  }

  const wallet = couponInfo.wallet;
  if (wallet?.id) {
    await db.prepare(`
      UPDATE user_coupon_wallet
      SET status = 'used', used_at = datetime('now'), used_order_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(orderId, wallet.id).run();
  } else {
    await db.prepare(`
      INSERT OR IGNORE INTO user_coupon_wallet (
        id, coupon_code, user_id, status, claimed_via, issued_at, expires_at, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'used', 'checkout', datetime('now'), NULL, ?, datetime('now'), datetime('now'))
    `).bind(
      generateId('ucw'),
      couponInfo.coupon_code,
      userId,
      JSON.stringify({ source: 'checkout' }),
    ).run();
  }

  await db.prepare(`
    INSERT INTO coupon_usage (
      id, wallet_id, coupon_code, user_id, user_name, order_id, class_id,
      discount_amount, status, metadata, used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'used', ?, datetime('now'))
  `).bind(
    generateId('cup'),
    wallet?.id || null,
    couponInfo.coupon_code,
    userId,
    userName || '',
    orderId,
    classId,
    finalDiscountAmount,
    JSON.stringify({ scope: 'global' }),
  ).run();

  await db.prepare(`
    UPDATE global_coupons
    SET used_count = COALESCE(used_count, 0) + 1,
        updated_at = datetime('now')
    WHERE code = ?
  `).bind(couponInfo.coupon_code).run();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = normalizeText(url.searchParams.get('user_id'));
  const classId = normalizeText(url.searchParams.get('class_id'));
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureOperationsSchema(env.DB);
  await ensureCommerceSchema(env.DB);

  try {
    if (userId && classId) {
      if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const enrollment = await env.DB.prepare(`
        SELECT e.*, o.order_id, o.status AS order_status, o.final_amount, o.discount_amount, o.refund_amount, o.refund_reason
        FROM enrollments e
        LEFT JOIN orders o ON o.order_id = e.order_id
        WHERE e.user_id = ? AND e.class_id = ?
      `).bind(userId, classId).first();

      return json(request, env, { success: true, data: { enrolled: !!enrollment, enrollment } });
    }

    if (classId && !userId) {
      const classAuth = await requireClassManager(context, classId);
      if (!classAuth.ok) return classAuth.response;

      const { results } = await env.DB.prepare(`
        SELECT
          e.*,
          o.order_id,
          o.status AS order_status,
          o.final_amount,
          o.discount_amount,
          o.refund_amount,
          u.name,
          u.username,
          u.profile_image_url,
          u.phone,
          u.role,
          u.email
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        LEFT JOIN orders o ON o.order_id = e.order_id
        WHERE e.class_id = ?
        ORDER BY e.enrolled_at ASC
      `).bind(classId).all();

      return json(request, env, { success: true, data: { enrollments: results || [] } });
    }

    if (userId) {
      if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const { results } = await env.DB.prepare(`
        SELECT
          e.*,
          c.title,
          c.category,
          c.image_url,
          c.creator_id AS instructor_id,
          c.instructor_name,
          c.instructor_email,
          c.instructor_phone,
          o.order_id,
          o.final_amount,
          o.discount_amount,
          o.refund_amount,
          o.refund_reason,
          o.pay_option,
          o.status AS order_status,
          o.created_at AS order_created_at
        FROM enrollments e
        LEFT JOIN classes c ON e.class_id = c.id
        LEFT JOIN orders o ON o.order_id = e.order_id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC
      `).bind(userId).all();

      return json(request, env, { success: true, data: { enrollments: results || [] } });
    }

    return json(request, env, { success: false, error: 'user_id 파라미터가 필요합니다.' }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: '조회 실패', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureOperationsSchema(env.DB);
  await ensureCommerceSchema(env.DB);

  try {
    const body = await request.json();
    const userId = auth.user.id;
    const classId = normalizeText(body.class_id);

    if (!userId || !classId) {
      return json(request, env, { success: false, error: 'user_id and class_id are required.' }, { status: 400 });
    }

    const user = await env.DB.prepare('SELECT id, name, username, email, phone FROM users WHERE id = ?')
      .bind(userId).first();
    if (!user) {
      return json(request, env, { success: false, error: 'User not found.' }, { status: 404 });
    }

    const cls = await env.DB.prepare(`
      SELECT *
      FROM classes
      WHERE id = ?
    `).bind(classId).first();
    if (!cls) {
      return json(request, env, { success: false, error: 'Class not found.' }, { status: 404 });
    }

    const existing = await env.DB.prepare(`
      SELECT id FROM enrollments WHERE user_id = ? AND class_id = ?
    `).bind(userId, classId).first();
    if (existing) {
      return json(request, env, { success: false, error: '이미 수강 중인 클래스입니다.' }, { status: 409 });
    }

    const payOption = normalizeText(body.pay_option || body.payment_option || 'onetime').toLowerCase();
    const baseAmount = computeBaseAmount(cls, payOption, body.base_amount || body.amount);
    const classDiscountAmount = Math.min(baseAmount, toNumber(body.class_discount_amount, Math.floor(baseAmount * (toNumber(cls.discount_rate || 0) / 100))));
    const couponCode = normalizeCode(body.coupon_code || body.coupon_id);
    let couponInfo = null;
    let couponDiscountAmount = 0;

    if (couponCode) {
      couponInfo = await resolveCoupon(env.DB, {
        classId,
        code: couponCode,
        userId,
        baseAmount: Math.max(baseAmount - classDiscountAmount, 0),
      });
      couponDiscountAmount = Math.min(
        Math.max(toNumber(body.coupon_discount_amount, couponInfo?.discount_amount || 0), 0),
        Math.max(baseAmount - classDiscountAmount, 0)
      );
    }

    const finalAmount = Math.max(
      0,
      toNumber(body.final_amount, baseAmount - classDiscountAmount - couponDiscountAmount)
    );

    const enrollmentId = generateId('enr');
    const orderId = normalizeText(body.order_id) || normalizeText(body.merchant_uid) || generateOrderId();
    const paymentMethod = normalizeText(body.pay_method || body.payment_method || 'card') || 'card';
    const status = finalAmount <= 0 ? 'paid' : 'paid';
    const paidAt = body.paid_at ? new Date(Number(body.paid_at) * 1000 || body.paid_at).toISOString?.() : new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO enrollments (
        id, user_id, class_id, pay_method, amount, applied_coupon, status,
        enrolled_at, created_at, updated_at, order_id, base_amount,
        class_discount_amount, coupon_discount_amount, final_amount, coupon_code,
        payment_status, instructor_id, instructor_name, settlement_batch_id, settlement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      enrollmentId,
      userId,
      classId,
      paymentMethod,
      finalAmount,
      couponCode || null,
      'active',
      orderId,
      baseAmount,
      classDiscountAmount,
      couponDiscountAmount,
      finalAmount,
      couponCode || null,
      status,
      cls.creator_id || null,
      cls.instructor_name || user.name || '',
      null,
      'pending',
    ).run();

    const paymentLabel = paymentMethod === 'coupon' ? 'Coupon' : paymentMethod;
    await env.DB.prepare(`
      INSERT INTO orders (
        order_id, user_id, user_name, user_email, class_id, class_title,
        order_type, amount, base_amount, discount_amount, class_discount_amount,
        coupon_discount_amount, final_amount, coupon_code, pay_method, card_name,
        status, merchant_uid, receipt_url, memo, created_at, paid_at,
        instructor_id, instructor_name, settlement_status, settlement_period_key, pay_option
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      userId,
      user.name || user.username || '',
      user.email || '',
      classId,
      cls.title || '',
      'class_pass',
      baseAmount,
      baseAmount,
      classDiscountAmount + couponDiscountAmount,
      classDiscountAmount,
      couponDiscountAmount,
      finalAmount,
      couponCode || null,
      paymentMethod,
      body.card_name || paymentLabel || '',
      'paid',
      normalizeText(body.merchant_uid || orderId),
      body.receipt_url || '',
      body.memo || '',
      paidAt,
      cls.creator_id || null,
      cls.instructor_name || '',
      'pending',
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      payOption,
    ).run();

    if (couponInfo) {
      await applyCouponUsage(env.DB, {
        couponInfo,
        userId,
        userName: user.name || user.username || '',
        orderId,
        classId,
        finalDiscountAmount: couponDiscountAmount,
      });
    }

    if (finalAmount > 0) {
      const financialId = generateId('fr');
      await env.DB.prepare(`
        INSERT INTO financial_records (
          id, type, amount, description, related_order_id, related_user_id, metadata, created_at
        ) VALUES (?, 'income', ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        financialId,
        finalAmount,
        `Order ${orderId} payment`,
        orderId,
        userId,
        JSON.stringify({ class_id: classId, pay_option: payOption }),
      ).run();
    }

    await refreshClassStats(env.DB, classId).catch((error) => {
      console.warn('[API /enrollments] refreshClassStats after enrollment failed:', error.message);
    });

    return json(request, env, {
      success: true,
      data: {
        enrollment_id: enrollmentId,
        order_id: orderId,
        final_amount: finalAmount,
        coupon_code: couponCode || null,
      },
    }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
