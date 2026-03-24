import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema } from './_lib/schema.js';

function generateWalletId() {
  return `uw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadCoupon(db, code) {
  return db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(code).first();
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id') || auth.user.id;
      if (auth.user.id !== userId && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const { results } = await env.DB.prepare(`
        SELECT *
        FROM user_coupon_wallet
        WHERE user_id = ?
        ORDER BY claimed_at DESC
      `).bind(userId).all();

      return json(request, env, { success: true, data: results || [] });
    } catch (error) {
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const action = String(body.action || 'claim').toLowerCase();
      const userId = body.user_id || auth.user.id;
      const code = normalizeCode(body.code || body.coupon_code);

      if (auth.user.id !== userId && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      if (!code) {
        return json(request, env, { success: false, error: '쿠폰 코드가 필요합니다.' }, { status: 400 });
      }

      const coupon = await loadCoupon(env.DB, code);
      if (!coupon) {
        return json(request, env, { success: false, error: '쿠폰을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (!coupon.is_active) {
        return json(request, env, { success: false, error: '비활성 쿠폰입니다.' }, { status: 400 });
      }
      if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
        return json(request, env, { success: false, error: '아직 시작되지 않은 쿠폰입니다.' }, { status: 400 });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return json(request, env, { success: false, error: '만료된 쿠폰입니다.' }, { status: 400 });
      }

      const existing = await env.DB.prepare(`
        SELECT * FROM user_coupon_wallet
        WHERE user_id = ? AND coupon_code = ?
      `).bind(userId, code).first();

      if (existing) {
        return json(request, env, { success: true, data: existing, already_claimed: true });
      }

      const walletId = generateWalletId();
      await env.DB.prepare(`
        INSERT INTO user_coupon_wallet (
          id, user_id, coupon_code, coupon_name, coupon_type, coupon_amount,
          coupon_image_url, scope, min_order_amount, status, source, claimed_via, issued_at, expires_at, claimed_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), ?, datetime('now'), ?)
        `).bind(
        walletId,
        userId,
        code,
        coupon.name || '',
        coupon.type || 'percent',
        Number(coupon.amount || 0),
        coupon.image_url || '',
        coupon.scope || 'all_classes',
        Number(coupon.min_order_amount || 0),
        'manual',
        action || 'manual',
        coupon.expires_at || null,
        JSON.stringify({ claimed_by: auth.user.id, action }),
      ).run();

      await env.DB.prepare(`
        UPDATE global_coupons
        SET issued_count = COALESCE(issued_count, 0) + 1,
            updated_at = datetime('now')
        WHERE code = ?
      `).bind(code).run();

      const created = await env.DB.prepare(`
        SELECT * FROM user_coupon_wallet WHERE id = ?
      `).bind(walletId).first();

      return json(request, env, { success: true, data: created, coupon });
    } catch (error) {
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
