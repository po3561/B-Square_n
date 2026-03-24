import { json, options } from '../_lib/http.js';
import { ensureCommerceSchema } from '../_lib/schema.js';

function generateCouponCode() {
  return `BSQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCouponType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['fixed', 'amount', 'won', 'price'].includes(v)) return 'fixed';
  return 'percent';
}

function normalizeScope(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['class', 'single_class', 'class-only'].includes(v)) return 'single_class';
  return 'all_classes';
}

function buildTargetIds(scope, targetClassId) {
  if (scope !== 'single_class' || !targetClassId) return '[]';
  return JSON.stringify([String(targetClassId).trim()]);
}

async function generateUniqueCouponCode(db, maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateCouponCode();
    const existing = await db.prepare('SELECT 1 FROM global_coupons WHERE code = ?').bind(candidate).first().catch(() => null);
    if (!existing) return candidate;
  }

  return `BSQ${Date.now().toString(36).toUpperCase()}`;
}

async function listCoupons(db) {
  const { results } = await db.prepare(`
    SELECT *
    FROM global_coupons
    ORDER BY COALESCE(display_order, 0) DESC, created_at DESC
  `).all();

  const rows = results || [];
  const enhanced = await Promise.all(rows.map(async (coupon) => {
    const claimRow = await db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM user_coupon_wallet
      WHERE coupon_code = ?
    `).bind(coupon.code).first().catch(() => ({ cnt: 0 }));

    const usageRow = await db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM coupon_usage
      WHERE coupon_code = ?
    `).bind(coupon.code).first().catch(() => ({ cnt: 0 }));

    return {
      ...coupon,
      claimed_count: Number(claimRow?.cnt || 0) || Number(coupon.issued_count || 0) || 0,
      actual_used: Number(usageRow?.cnt || 0) || Number(coupon.used_count || 0) || 0,
      scope_label: ['all_classes', 'global', 'all'].includes(String(coupon.scope || '').toLowerCase())
        ? '전체 클래스'
        : String(coupon.scope || '').toLowerCase() === 'single_class'
          ? '특정 클래스'
          : coupon.scope || '전체 클래스',
    };
  }));

  return enhanced;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  await ensureCommerceSchema(db);

  if (method === 'GET') {
    try {
      const coupons = await listCoupons(db);
      return json(request, env, { success: true, data: coupons });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const action = String(body.action || '').toLowerCase();

      if (action === 'validate') {
        const code = normalizeCode(body.code);
        const coupon = await db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(code).first();
        if (!coupon) return json(request, env, { success: false, error: 'Coupon not found.' }, { status: 404 });
        if (!coupon.is_active) return json(request, env, { success: false, error: 'Coupon is inactive.' }, { status: 400 });
        if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
          return json(request, env, { success: false, error: 'Coupon has not started yet.' }, { status: 400 });
        }
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          return json(request, env, { success: false, error: 'Coupon has expired.' }, { status: 400 });
        }

        const classId = body.class_id || '';
        const scope = normalizeScope(coupon.scope);
        const targetIds = Array.isArray(coupon.target_ids)
          ? coupon.target_ids
          : (() => {
              try {
                return JSON.parse(coupon.target_ids || '[]');
              } catch {
                return [];
              }
            })();
        const targetClassId = coupon.target_class_id || targetIds[0] || null;
        if (scope === 'single_class' && targetClassId && classId && String(targetClassId) !== String(classId)) {
          return json(request, env, { success: false, error: 'This coupon is limited to another class.' }, { status: 400 });
        }

        const claimedRow = await db.prepare(`
          SELECT COUNT(*) AS cnt
          FROM user_coupon_wallet
          WHERE coupon_code = ?
        `).bind(code).first().catch(() => ({ cnt: 0 }));
        const claimedCount = Number(claimedRow?.cnt || coupon.issued_count || 0);
        if ((coupon.max_issue_count || 0) > 0 && claimedCount >= coupon.max_issue_count) {
          return json(request, env, { success: false, error: 'Coupon usage limit reached.' }, { status: 400 });
        }

        return json(request, env, {
          success: true,
          data: {
            ...coupon,
            claimed_count: claimedCount,
            actual_used: Number(coupon.used_count || 0),
          },
        });
      }

      if (action === 'use') {
        const code = normalizeCode(body.code);
        if (!code) {
          return json(request, env, { success: false, error: 'code is required.' }, { status: 400 });
        }

        const coupon = await db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(code).first();
        if (!coupon) {
          return json(request, env, { success: false, error: 'Coupon not found.' }, { status: 404 });
        }

        const usageId = `cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.prepare(`
          INSERT INTO coupon_usage (
            id, coupon_code, coupon_name, coupon_type, coupon_amount, coupon_image_url,
            scope, user_id, user_name, order_id, used_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          usageId,
          code,
          coupon.name || '',
          coupon.type || 'percent',
          Number(coupon.amount || 0),
          coupon.image_url || '',
          coupon.scope || 'all',
          body.user_id || null,
          body.user_name || '',
          body.order_id || null,
        ).run();

        await db.prepare(`
          UPDATE global_coupons
          SET used_count = COALESCE(used_count, 0) + 1,
              updated_at = datetime('now')
          WHERE code = ?
        `).bind(code).run();

        return json(request, env, { success: true });
      }

      let code = normalizeCode(body.code);
      if (!code) code = await generateUniqueCouponCode(db);
      const name = String(body.name || '').trim();
      if (!name) {
        return json(request, env, { success: false, error: 'name is required.' }, { status: 400 });
      }

      const description = body.description || '';
      const type = normalizeCouponType(body.type);
      const amount = Math.max(0, parseInt(body.amount, 10) || 0);
      const minOrderAmount = Math.max(0, parseInt(body.min_order_amount, 10) || 0);
      const maxIssueCount = Math.max(0, parseInt(body.max_issue_count, 10) || 0);
      const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;
      const startsAt = body.starts_at || null;
      const expiresAt = body.expires_at || null;
      const scope = normalizeScope(body.scope);
      const targetKind = body.target_kind || 'class';
      const targetIds = body.target_ids || buildTargetIds(scope, body.target_class_id || body.class_id || null);
      const targetClassId = body.target_class_id || null;
      const perUserLimit = Math.max(1, parseInt(body.per_user_limit, 10) || 1);
      const imageUrl = body.image_url || null;
      const displayOrder = Math.max(0, parseInt(body.display_order, 10) || 0);
      const existing = await db.prepare('SELECT code FROM global_coupons WHERE code = ?').bind(code).first().catch(() => null);

      if (existing) {
        await db.prepare(`
          UPDATE global_coupons
          SET name = ?,
              description = ?,
              type = ?,
              amount = ?,
              min_order_amount = ?,
              max_issue_count = ?,
              is_active = ?,
              starts_at = ?,
              expires_at = ?,
              scope = ?,
              target_kind = ?,
              target_ids = ?,
              target_class_id = ?,
              per_user_limit = ?,
              image_url = ?,
              display_order = ?,
              updated_at = datetime('now')
          WHERE code = ?
        `).bind(
          name,
          description,
          type,
          amount,
          minOrderAmount,
          maxIssueCount,
          isActive,
          startsAt,
          expiresAt,
          scope,
          targetKind,
          targetIds,
          targetClassId,
          perUserLimit,
          imageUrl,
          displayOrder,
          code,
        ).run();

        return json(request, env, { success: true, code, updated: true });
      }

      await db.prepare(`
        INSERT INTO global_coupons (
          code, name, description, type, amount, min_order_amount,
          max_issue_count, issued_count, used_count, is_active,
          starts_at, expires_at, scope, target_kind, target_ids, target_class_id, per_user_limit, image_url,
          display_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        code,
        name,
        description,
        type,
        amount,
        minOrderAmount,
        maxIssueCount,
        isActive,
        startsAt,
        expiresAt,
        scope,
        targetKind,
        targetIds,
        targetClassId,
        perUserLimit,
        imageUrl,
        displayOrder,
      ).run();

      return json(request, env, { success: true, code, updated: false }, { status: 201 });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      const code = normalizeCode(body.code);
      if (!code) {
        return json(request, env, { success: false, error: 'code required' }, { status: 400 });
      }

      const updates = [];
      const params = [];
      const fields = [
        ['name', body.name],
        ['description', body.description],
        ['type', normalizeCouponType(body.type)],
        ['amount', body.amount],
        ['min_order_amount', body.min_order_amount],
        ['max_issue_count', body.max_issue_count],
        ['is_active', body.is_active],
        ['starts_at', body.starts_at],
        ['expires_at', body.expires_at],
        ['scope', normalizeScope(body.scope)],
        ['target_kind', body.target_kind],
        ['target_ids', body.target_ids || buildTargetIds(normalizeScope(body.scope), body.target_class_id || body.class_id || null)],
        ['target_class_id', body.target_class_id],
        ['per_user_limit', body.per_user_limit],
        ['image_url', body.image_url],
        ['display_order', body.display_order],
      ];

      fields.forEach(([key, value]) => {
        if (value !== undefined) {
          updates.push(`${key} = ?`);
          params.push(key === 'amount' || key === 'min_order_amount' || key === 'max_issue_count' || key === 'display_order'
            ? Math.max(0, parseInt(value, 10) || 0)
            : key === 'is_active'
              ? (value ? 1 : 0)
              : value);
        }
      });

      updates.push('updated_at = datetime(\'now\')');
      params.push(code);

      await db.prepare(`UPDATE global_coupons SET ${updates.join(', ')} WHERE code = ?`).bind(...params).run();
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const code = normalizeCode(url.searchParams.get('code'));
      if (!code) {
        return json(request, env, { success: false, error: 'code required' }, { status: 400 });
      }

      await db.prepare('DELETE FROM global_coupons WHERE code = ?').bind(code).run();
      await db.prepare('DELETE FROM coupon_usage WHERE coupon_code = ?').bind(code).run();
      await db.prepare('DELETE FROM user_coupon_wallet WHERE coupon_code = ?').bind(code).run();
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
