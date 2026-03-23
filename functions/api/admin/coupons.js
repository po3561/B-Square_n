import { json, options } from '../_lib/http.js';

function generateCouponCode() {
  return `BSQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function ensureCouponSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS global_coupons (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'percent',
      amount INTEGER DEFAULT 0,
      min_order_amount INTEGER DEFAULT 0,
      max_issue_count INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      starts_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id TEXT PRIMARY KEY,
      coupon_code TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      order_id TEXT,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const addColumnIfMissing = async (table, definition) => {
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error.message || '')) {
        throw error;
      }
    }
  };

  await addColumnIfMissing('global_coupons', 'description TEXT');
  await addColumnIfMissing('global_coupons', "type TEXT DEFAULT 'percent'");
  await addColumnIfMissing('global_coupons', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing('global_coupons', 'min_order_amount INTEGER DEFAULT 0');
  await addColumnIfMissing('global_coupons', 'max_issue_count INTEGER DEFAULT 0');
  await addColumnIfMissing('global_coupons', 'used_count INTEGER DEFAULT 0');
  await addColumnIfMissing('global_coupons', 'is_active INTEGER DEFAULT 1');
  await addColumnIfMissing('global_coupons', 'starts_at DATETIME');
  await addColumnIfMissing('global_coupons', 'expires_at DATETIME');
  await addColumnIfMissing('global_coupons', 'created_at DATETIME');

  await addColumnIfMissing('coupon_usage', 'coupon_code TEXT');
  await addColumnIfMissing('coupon_usage', 'user_id TEXT');
  await addColumnIfMissing('coupon_usage', 'user_name TEXT');
  await addColumnIfMissing('coupon_usage', 'order_id TEXT');
  await addColumnIfMissing('coupon_usage', 'used_at DATETIME');
}

async function listCoupons(db) {
  const { results } = await db.prepare('SELECT * FROM global_coupons ORDER BY created_at DESC').all();

  const enhanced = await Promise.all((results || []).map(async (coupon) => {
    const usage = await db.prepare(
      'SELECT COUNT(*) AS cnt FROM coupon_usage WHERE coupon_code = ?'
    ).bind(coupon.code).first().catch(() => ({ cnt: 0 }));

    return {
      ...coupon,
      actual_used: usage?.cnt || 0,
    };
  }));

  return enhanced;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  await ensureCouponSchema(db);

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

      if (body?.action === 'validate') {
        const coupon = await db.prepare('SELECT * FROM global_coupons WHERE code = ?').bind(body.code).first();
        if (!coupon) return json(request, env, { success: false, error: 'Coupon not found.' });
        if (!coupon.is_active) return json(request, env, { success: false, error: 'Coupon is inactive.' });
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          return json(request, env, { success: false, error: 'Coupon has expired.' });
        }
        if ((coupon.max_issue_count || 0) > 0 && (coupon.used_count || 0) >= coupon.max_issue_count) {
          return json(request, env, { success: false, error: 'Coupon usage limit reached.' });
        }

        if (body.user_id) {
          const already = await db.prepare(
            'SELECT 1 FROM coupon_usage WHERE coupon_code = ? AND user_id = ?'
          ).bind(body.code, body.user_id).first();

          if (already) {
            return json(request, env, { success: false, error: 'Coupon already used by this user.' });
          }
        }

        return json(request, env, {
          success: true,
          coupon: {
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            amount: coupon.amount,
            min_order_amount: coupon.min_order_amount,
          },
        });
      }

      if (body?.action === 'use') {
        if (!body.code) {
          return json(request, env, { success: false, error: 'code is required.' }, { status: 400 });
        }

        const usageId = `cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.prepare(`
          INSERT INTO coupon_usage (id, coupon_code, user_id, user_name, order_id, used_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(usageId, body.code, body.user_id || null, body.user_name || '', body.order_id || null).run();

        await db.prepare('UPDATE global_coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE code = ?')
          .bind(body.code)
          .run();

        return json(request, env, { success: true });
      }

      const code = (body.code || generateCouponCode()).toUpperCase();
      if (!body.name) {
        return json(request, env, { success: false, error: 'name is required.' }, { status: 400 });
      }

      await db.prepare(`
        INSERT INTO global_coupons (
          code, name, description, type, amount, min_order_amount,
          max_issue_count, used_count, is_active, starts_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, datetime('now'))
      `).bind(
        code,
        body.name,
        body.description || '',
        body.type || 'percent',
        parseInt(body.amount, 10) || 0,
        parseInt(body.min_order_amount, 10) || 0,
        parseInt(body.max_issue_count, 10) || 0,
        body.starts_at || null,
        body.expires_at || null,
      ).run();

      return json(request, env, { success: true, code });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get('code');
      if (!code) {
        return json(request, env, { success: false, error: 'code required' }, { status: 400 });
      }

      await db.prepare('DELETE FROM global_coupons WHERE code = ?').bind(code).run();
      await db.prepare('DELETE FROM coupon_usage WHERE coupon_code = ?').bind(code).run();
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
