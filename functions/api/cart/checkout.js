import { requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureCommerceSchema } from '../_lib/schema.js';
import { refreshClassStats } from '../_lib/class_support.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map((item) => normalizeText(item)).filter(Boolean)));
}

function parseList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return uniqueStrings(parsed);
    } catch {
      // Fall through to comma parsing.
    }
    return uniqueStrings(value.split(','));
  }
  return uniqueStrings([value]);
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateOrderId(index = 0) {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BSQ${y}${m}${d}${h}${mi}-${rand}${index > 0 ? `-${index + 1}` : ''}`;
}

function formatCount(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}개`;
}

function toEpochText(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function normalizeCartItem(row) {
  const classId = normalizeText(row.class_id || row.reference_id || row.referenceId || '');
  const referenceId = normalizeText(row.reference_id || row.referenceId || classId || row.id || '');
  const title = normalizeText(row.title || row.class_title || row.name || row.class_name || '');
  const subtitle = normalizeText(row.subtitle || row.class_summary || row.instructor_name || row.class_category || row.category || '');
  const imageUrl = normalizeText(row.image_url || row.class_image_url || row.thumbnail_url || row.thumbnail || '');
  const price = normalizeInt(row.price ?? row.class_price ?? row.sale_price ?? row.list_price ?? row.amount ?? row.final_amount ?? 0);
  const quantity = Math.max(1, normalizeInt(row.quantity || 1, 1));
  const href = normalizeText(row.href || row.url || (classId ? `../class_view/class_view.html?id=${encodeURIComponent(classId)}` : ''));

  return {
    ...row,
    id: normalizeText(row.id),
    item_type: normalizeText(row.item_type || row.type || 'class') || 'class',
    reference_id: referenceId,
    class_id: classId,
    title,
    subtitle,
    image_url: imageUrl,
    price,
    quantity,
    href,
    status: normalizeText(row.status || 'active') || 'active',
    instructor_id: normalizeText(row.instructor_id || ''),
    instructor_name: normalizeText(row.instructor_name || ''),
    category: normalizeText(row.class_category || row.category || ''),
    snapshot: safeJsonParse(row.snapshot_json, null),
  };
}

async function loadCartItems(db, userId, selectedIds = []) {
  const { results } = await db.prepare(`
    SELECT *
    FROM user_cart_items
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(updated_at, added_at, created_at)) DESC
  `).bind(userId).all();

  const items = (results || [])
    .map(normalizeCartItem)
    .filter((item) => item.status !== 'removed');

  const selected = uniqueStrings(selectedIds);
  if (!selected.length) return items;

  const selectedSet = new Set(selected);
  return items.filter((item) => selectedSet.has(item.id) || selectedSet.has(item.class_id) || selectedSet.has(item.reference_id));
}

function couponTargetsClass(coupon, classId) {
  const targetClassId = normalizeText(coupon?.target_class_id);
  if (targetClassId && String(targetClassId) === String(classId)) return true;

  const targetIds = parseList(coupon?.target_ids);
  if (targetIds.includes(String(classId))) return true;

  return false;
}

function isCouponActive(coupon) {
  if (!coupon) return false;
  if (!normalizeBool(coupon.is_active ?? 1)) return false;
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > Date.now()) return false;
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return false;
  return true;
}

function buildAllocationMap(items, eligibleIds, discountTotal) {
  const allocation = new Map(items.map((item) => [item.id, 0]));
  const eligibleItems = items.filter((item) => eligibleIds.has(item.id));
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + Math.max(0, item.price * item.quantity), 0);

  if (!eligibleItems.length || discountTotal <= 0 || eligibleSubtotal <= 0) {
    return { allocation, eligibleItems, eligibleSubtotal, appliedDiscount: 0 };
  }

  const cappedDiscount = Math.min(discountTotal, eligibleSubtotal);
  let assigned = 0;

  eligibleItems.forEach((item, index) => {
    const lineAmount = Math.max(0, item.price * item.quantity);
    let share = index === eligibleItems.length - 1
      ? cappedDiscount - assigned
      : Math.floor((cappedDiscount * lineAmount) / eligibleSubtotal);
    share = Math.max(0, Math.min(share, lineAmount));
    allocation.set(item.id, share);
    assigned += share;
  });

  let remainder = Math.max(0, cappedDiscount - assigned);
  const ordered = [...eligibleItems].sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity));
  while (remainder > 0) {
    let progressed = false;
    for (const item of ordered) {
      const lineAmount = Math.max(0, item.price * item.quantity);
      const current = allocation.get(item.id) || 0;
      if (current < lineAmount) {
        allocation.set(item.id, current + 1);
        remainder -= 1;
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  const appliedDiscount = [...allocation.values()].reduce((sum, value) => sum + value, 0);
  return { allocation, eligibleItems, eligibleSubtotal, appliedDiscount };
}

async function resolveCouponPlan(db, { userId, couponCode, items, subtotal }) {
  const normalizedCode = normalizeCode(couponCode);
  if (!normalizedCode) {
    return {
      code: '',
      name: null,
      type: null,
      amount: 0,
      scope: null,
      targetClassId: null,
      eligibleIds: new Set(items.map((item) => item.id)),
      discountTotal: 0,
      source: null,
      walletId: null,
      couponRow: null,
    };
  }

  const classCoupons = await db.prepare(`
    SELECT *
    FROM coupons
    WHERE coupon_code = ?
  `).bind(normalizedCode).all();

  const classCoupon = (classCoupons.results || []).find((row) => items.some((item) => String(item.class_id) === String(row.class_id)));
  if (classCoupon) {
    const limitCount = normalizeInt(classCoupon.limit_count || 0);
    const usedCount = normalizeInt(classCoupon.used_count || 0);
    if (limitCount > 0 && usedCount >= limitCount) {
      throw new Error('Coupon usage limit reached.');
    }

    const eligibleItems = items.filter((item) => String(item.class_id) === String(classCoupon.class_id));
    if (!eligibleItems.length) {
      throw new Error('This coupon is limited to another class.');
    }

    const baseAmount = eligibleItems.reduce((sum, item) => sum + Math.max(0, item.price * item.quantity), 0);
    const discount = String(classCoupon.type || '').toLowerCase() === 'percent'
      ? Math.floor(baseAmount * (normalizeInt(classCoupon.value || 0) / 100))
      : normalizeInt(classCoupon.value || 0);

    return {
      code: normalizedCode,
      name: classCoupon.coupon_code,
      type: classCoupon.type || 'amount',
      amount: normalizeInt(classCoupon.value || 0),
      scope: 'class',
      targetClassId: classCoupon.class_id || null,
      eligibleIds: new Set(eligibleItems.map((item) => item.id)),
      discountTotal: Math.min(Math.max(discount, 0), baseAmount),
      source: 'class',
      walletId: null,
      couponRow: classCoupon,
    };
  }

  const walletCoupon = await db.prepare(`
    SELECT
      w.id AS wallet_id,
      w.coupon_code,
      w.user_id,
      w.status AS wallet_status,
      w.claimed_via,
      w.issued_at,
      w.expires_at AS wallet_expires_at,
      w.used_at,
      w.used_order_id,
      w.metadata AS wallet_metadata,
      w.created_at AS wallet_created_at,
      w.updated_at AS wallet_updated_at,
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
      c.max_issue_count,
      c.per_user_limit,
      c.used_count AS coupon_used_count,
      c.is_active,
      c.starts_at,
      c.expires_at,
      c.created_by,
      c.created_at AS coupon_created_at,
      c.updated_at AS coupon_updated_at
    FROM user_coupon_wallet w
    JOIN global_coupons c ON c.code = w.coupon_code
    WHERE w.user_id = ? AND w.coupon_code = ?
    ORDER BY datetime(COALESCE(w.updated_at, w.created_at, w.issued_at)) DESC
    LIMIT 1
  `).bind(userId, normalizedCode).first().catch(() => null);

  const globalCoupon = walletCoupon || await db.prepare(`
    SELECT *
    FROM global_coupons
    WHERE code = ?
  `).bind(normalizedCode).first().catch(() => null);

  if (!globalCoupon) {
    throw new Error('Coupon not found.');
  }

  if (walletCoupon?.wallet_status && walletCoupon.wallet_status !== 'active') {
    throw new Error('Coupon is inactive.');
  }

  const coupon = {
    code: normalizedCode,
    name: normalizeText(globalCoupon.name || globalCoupon.coupon_name || normalizedCode) || normalizedCode,
    type: normalizeText(globalCoupon.type || 'percent') || 'percent',
    amount: normalizeInt(globalCoupon.amount || globalCoupon.coupon_amount || 0),
    scope: normalizeText(globalCoupon.scope || 'all_classes') || 'all_classes',
    targetClassId: normalizeText(globalCoupon.target_class_id || ''),
    targetIds: parseList(globalCoupon.target_ids),
    minOrderAmount: normalizeInt(globalCoupon.min_order_amount || 0),
    perUserLimit: Math.max(1, normalizeInt(globalCoupon.per_user_limit || 1)),
    imageUrl: normalizeText(globalCoupon.image_url || globalCoupon.coupon_image_url || ''),
    walletId: walletCoupon?.wallet_id || null,
    couponRow: globalCoupon,
    source: walletCoupon ? 'wallet' : 'global',
  };

  if (!isCouponActive(globalCoupon)) {
    throw new Error('Coupon is inactive or expired.');
  }

  const usageRow = await db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM coupon_usage
    WHERE coupon_code = ? AND user_id = ?
  `).bind(normalizedCode, userId).first().catch(() => ({ cnt: 0 }));

  if (normalizeInt(usageRow?.cnt || 0) >= coupon.perUserLimit) {
    throw new Error('Coupon already used by this user.');
  }

  const eligibleItems = coupon.scope === 'single_class' || coupon.targetClassId || coupon.targetIds.length
    ? items.filter((item) => couponTargetsClass({
      target_class_id: coupon.targetClassId,
      target_ids: coupon.targetIds,
    }, item.class_id))
    : [...items];

  if (!eligibleItems.length) {
    throw new Error('쿠폰을 적용할 수 있는 항목이 없습니다.');
  }

  const baseAmount = eligibleItems.reduce((sum, item) => sum + Math.max(0, item.price * item.quantity), 0);
  if (coupon.minOrderAmount > 0 && baseAmount < coupon.minOrderAmount) {
    throw new Error(`최소 주문 금액 ${coupon.minOrderAmount.toLocaleString('ko-KR')}원 이상이어야 합니다.`);
  }

  const rawDiscount = coupon.type === 'percent'
    ? Math.floor(baseAmount * (coupon.amount / 100))
    : coupon.amount;

  return {
    ...coupon,
    eligibleIds: new Set(eligibleItems.map((item) => item.id)),
    discountTotal: Math.min(Math.max(rawDiscount, 0), baseAmount),
  };
}

async function markCouponUsage(db, { couponPlan, userId, userName, orderId, classId, discountAmount }) {
  if (!couponPlan?.code || discountAmount <= 0) return;

  const couponType = couponPlan.type || 'amount';
  const couponAmount = normalizeInt(couponPlan.amount || discountAmount);
  const couponName = normalizeText(couponPlan.name || couponPlan.code);
  const couponImageUrl = normalizeText(couponPlan.imageUrl || couponPlan.couponRow?.image_url || couponPlan.couponRow?.coupon_image_url || '');
  const scope = normalizeText(couponPlan.scope || (couponPlan.source === 'class' ? 'class' : 'all'));
  const metadata = JSON.stringify({
    source: couponPlan.source,
    scope,
    target_class_id: couponPlan.targetClassId || null,
    target_ids: couponPlan.couponRow?.target_ids || null,
    discount_amount: discountAmount,
  });

  if (couponPlan.source === 'class') {
    await db.prepare(`
      UPDATE coupons
      SET used_count = COALESCE(used_count, 0) + 1
      WHERE class_id = ? AND coupon_code = ?
    `).bind(couponPlan.targetClassId || classId, couponPlan.code).run();
  } else {
    if (couponPlan.walletId) {
      await db.prepare(`
        UPDATE user_coupon_wallet
        SET status = 'used',
            used_at = datetime('now'),
            used_order_id = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(orderId, couponPlan.walletId).run();
    } else {
      await db.prepare(`
        INSERT OR IGNORE INTO user_coupon_wallet (
          id, user_id, coupon_code, coupon_name, coupon_type, coupon_amount,
          coupon_image_url, scope, min_order_amount, status, source, claimed_via,
          issued_at, expires_at, claimed_at, used_at, used_order_id, metadata,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, 'used', 'checkout', 'checkout',
          datetime('now'), ?, datetime('now'), datetime('now'), ?, ?, datetime('now'), datetime('now')
        )
      `).bind(
        generateId('ucw'),
        userId,
        couponPlan.code,
        couponName,
        couponType,
        couponAmount,
        couponImageUrl || null,
        scope,
        normalizeInt(couponPlan.minOrderAmount || 0),
        couponPlan.couponRow?.expires_at || couponPlan.couponRow?.wallet_expires_at || null,
        orderId,
        metadata,
      ).run();
    }

    await db.prepare(`
      UPDATE global_coupons
      SET used_count = COALESCE(used_count, 0) + 1,
          updated_at = datetime('now')
      WHERE code = ?
    `).bind(couponPlan.code).run();
  }

  await db.prepare(`
    INSERT INTO coupon_usage (
      id, wallet_id, coupon_code, coupon_name, coupon_type, coupon_amount,
      coupon_image_url, scope, user_id, user_name, order_id, class_id,
      discount_amount, status, metadata, used_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'used', ?, datetime('now'), datetime('now'))
  `).bind(
    generateId('cup'),
    couponPlan.walletId || null,
    couponPlan.code,
    couponName,
    couponType,
    couponAmount,
    couponImageUrl || null,
    scope,
    userId,
    userName || '',
    orderId,
    classId || null,
    discountAmount,
    metadata,
  ).run();
}

function buildPaymentPayload({ batchId, item, couponPlan, subtotal, discountTotal, itemDiscount, finalAmount, payMethod, selectedIds }) {
  return JSON.stringify({
    checkout_id: batchId,
    selected_ids: selectedIds,
    coupon_code: couponPlan?.code || null,
    coupon_scope: couponPlan?.scope || null,
    coupon_source: couponPlan?.source || null,
    coupon_name: couponPlan?.name || null,
    subtotal,
    discount_total: discountTotal,
    item_discount: itemDiscount,
    final_amount: finalAmount,
    class_id: item.class_id,
    class_title: item.title,
    pay_method: payMethod,
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  if (method !== 'POST') {
    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const userId = auth.user.id;
    const selectedIds = parseList(body.selected_ids || body.selected_ids_json || body.item_ids);
    const paymentMethod = normalizeText(body.pay_method || body.payment_method || 'card').toLowerCase() || 'card';
    const dryRun = normalizeBool(body.dry_run);
    const couponCode = normalizeCode(body.coupon_code || body.coupon_id || body.coupon || '');

    const user = await env.DB.prepare(`
      SELECT id, name, username, email
      FROM users
      WHERE id = ?
    `).bind(userId).first();

    if (!user) {
      return json(request, env, { success: false, error: 'User not found.' }, { status: 404 });
    }

    const cartItems = await loadCartItems(env.DB, userId, selectedIds);
    if (!cartItems.length) {
      return json(request, env, { success: false, error: '장바구니가 비어 있습니다.' }, { status: 400 });
    }

    const subtotal = cartItems.reduce((sum, item) => sum + Math.max(0, item.price * item.quantity), 0);
    const couponPlan = await resolveCouponPlan(env.DB, {
      userId,
      couponCode,
      items: cartItems,
      subtotal,
    });

    const { allocation, eligibleItems, eligibleSubtotal, appliedDiscount } = buildAllocationMap(
      cartItems,
      couponPlan.eligibleIds || new Set(cartItems.map((item) => item.id)),
      couponPlan.discountTotal || 0,
    );

    const lineItems = cartItems.map((item) => {
      const itemSubtotal = Math.max(0, item.price * item.quantity);
      const discountAmount = allocation.get(item.id) || 0;
      const finalAmount = Math.max(0, itemSubtotal - discountAmount);
      return {
        id: item.id,
        class_id: item.class_id,
        title: item.title,
        subtitle: item.subtitle,
        image_url: item.image_url,
        price: item.price,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        discount_amount: discountAmount,
        final_amount: finalAmount,
      };
    });

    const discountTotal = Math.min(couponPlan.discountTotal || 0, subtotal);
    const total = Math.max(0, subtotal - discountTotal);

    if (dryRun) {
      return json(request, env, {
        success: true,
        data: {
          item_count: cartItems.length,
          subtotal,
          discount_total: discountTotal,
          total,
          coupon_code: couponPlan.code || null,
          coupon_name: couponPlan.name || null,
          coupon_scope: couponPlan.scope || null,
          coupon_source: couponPlan.source || null,
          payment_method: paymentMethod,
          eligible_count: eligibleItems.length,
          eligible_subtotal: eligibleSubtotal,
          items: lineItems,
        },
      });
    }

    const batchId = generateId('chk');
    const selectedCartIds = cartItems.map((item) => item.id).filter(Boolean);

    const createdOrders = [];
    const createdEnrollments = [];

    for (let index = 0; index < lineItems.length; index += 1) {
      const item = lineItems[index];
      const orderId = generateOrderId(index);
      const enrollmentId = generateId('enr');
      const itemSubtotal = Math.max(0, item.subtotal);
      const itemDiscount = Math.max(0, item.discount_amount);
      const finalAmount = Math.max(0, item.final_amount);
      const paymentLabel = paymentMethod === 'free'
        ? '무료'
        : paymentMethod === 'trans'
          ? '계좌이체'
          : '카드';
      const paidAt = toEpochText();

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
        item.class_id || null,
        paymentMethod,
        itemSubtotal,
        couponPlan.code || null,
        'active',
        orderId,
        itemSubtotal,
        0,
        itemDiscount,
        finalAmount,
        couponPlan.code || null,
        'paid',
        item.instructor_id || null,
        item.subtitle || user.name || '',
        batchId,
        'pending',
      ).run();

      await env.DB.prepare(`
        INSERT INTO orders (
          order_id, user_id, user_name, user_email, class_id, class_title,
          order_type, amount, base_amount, discount_amount, class_discount_amount,
          coupon_discount_amount, final_amount, coupon_code, method, pay_method,
          card_name, status, merchant_uid, receipt_url, coupon_scope, coupon_name,
          payment_provider, payment_reference, payment_payload, source_enrollment_id,
          source_type, instructor_id, instructor_name, refund_amount, settlement_status,
          pay_option, created_at, paid_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          'class_pass', ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 'paid', ?, '', ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, 0, 'pending',
          'onetime', datetime('now'), ?
        )
      `).bind(
        orderId,
        userId,
        user.name || user.username || '',
        user.email || '',
        item.class_id || null,
        item.title || '',
        itemSubtotal,
        itemSubtotal,
        itemDiscount,
        0,
        itemDiscount,
        finalAmount,
        couponPlan.code || null,
        paymentMethod,
        paymentMethod,
        paymentLabel,
        batchId,
        couponPlan.scope || null,
        couponPlan.name || couponPlan.code || null,
        paymentMethod,
        orderId,
        buildPaymentPayload({
          batchId,
          item,
          couponPlan,
          subtotal,
          discountTotal,
          itemDiscount,
          finalAmount,
          payMethod: paymentMethod,
          selectedIds: selectedCartIds,
        }),
        enrollmentId,
        'cart',
        item.instructor_id || null,
        item.subtitle || user.name || '',
        paidAt,
      ).run();

      createdOrders.push(orderId);
      createdEnrollments.push(enrollmentId);
    }

    if (couponPlan.code && discountTotal > 0) {
      await markCouponUsage(env.DB, {
        couponPlan,
        userId,
        userName: user.name || user.username || '',
        orderId: batchId,
        classId: eligibleItems[0]?.class_id || cartItems[0]?.class_id || null,
        discountAmount: discountTotal,
      });
    }

    if (selectedCartIds.length) {
      const placeholders = selectedCartIds.map(() => '?').join(', ');
      await env.DB.prepare(`
        DELETE FROM user_cart_items
        WHERE user_id = ? AND id IN (${placeholders})
      `).bind(userId, ...selectedCartIds).run();
    }

    const uniqueClassIds = uniqueStrings(cartItems.map((item) => item.class_id));
    for (const classId of uniqueClassIds) {
      try {
        await refreshClassStats(env.DB, classId);
      } catch (error) {
        console.warn('[API /cart/checkout] refreshClassStats failed:', classId, error?.message || error);
      }
    }

    return json(request, env, {
      success: true,
      data: {
        checkout_id: batchId,
        item_count: cartItems.length,
        subtotal,
        discount_total: discountTotal,
        total,
        coupon_code: couponPlan.code || null,
        coupon_name: couponPlan.name || null,
        coupon_scope: couponPlan.scope || null,
        coupon_source: couponPlan.source || null,
        payment_method: paymentMethod,
        created_orders: createdOrders,
        created_enrollments: createdEnrollments,
        items: lineItems,
      },
    });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
