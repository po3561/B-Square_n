import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema } from './_lib/schema.js';
import { ensureClassesSchema } from './_lib/schema.js';

function generateCartId() {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getClassSnapshot(db, classId) {
  return db.prepare(`
    SELECT
      c.id,
      c.title,
      c.category,
      c.summary,
      c.description_text,
      c.image_url,
      c.price,
      c.discount_rate,
      c.instructor_name,
      c.instructor_email,
      c.instructor_phone,
      u.name AS creator_name
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    WHERE c.id = ?
  `).bind(classId).first();
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);
  await ensureClassesSchema(env.DB);

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id') || auth.user.id;
      if (auth.user.id !== userId && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const { results } = await env.DB.prepare(`
        SELECT *
        FROM user_cart_items
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).bind(userId).all();

      return json(request, env, { success: true, data: results || [] });
    } catch (error) {
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const userId = body.user_id || auth.user.id;
      const classId = body.class_id || body.id;

      if (auth.user.id !== userId && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }
      if (!classId) {
        return json(request, env, { success: false, error: 'class_id is required.' }, { status: 400 });
      }

      const snapshot = await getClassSnapshot(env.DB, classId);
      if (!snapshot) {
        return json(request, env, { success: false, error: '클래스를 찾을 수 없습니다.' }, { status: 404 });
      }

      const existing = await env.DB.prepare(`
        SELECT * FROM user_cart_items WHERE user_id = ? AND class_id = ?
      `).bind(userId, classId).first();

      const payload = {
        class_title: snapshot.title || '',
        class_category: snapshot.category || '',
        class_image_url: snapshot.image_url || '',
        class_summary: snapshot.summary || snapshot.description_text || '',
        class_price: Number(snapshot.price || 0),
        snapshot_json: JSON.stringify(snapshot),
      };

      if (existing) {
        await env.DB.prepare(`
          UPDATE user_cart_items
          SET class_title = ?, class_category = ?, class_image_url = ?, class_summary = ?,
              class_price = ?, snapshot_json = ?, updated_at = datetime('now'), status = 'active'
          WHERE id = ?
        `).bind(
          payload.class_title,
          payload.class_category,
          payload.class_image_url,
          payload.class_summary,
          payload.class_price,
          payload.snapshot_json,
          existing.id,
        ).run();

        const updated = await env.DB.prepare('SELECT * FROM user_cart_items WHERE id = ?')
          .bind(existing.id).first();
        return json(request, env, { success: true, data: updated, updated: true });
      }

      const cartId = generateCartId();
      await env.DB.prepare(`
        INSERT INTO user_cart_items (
          id, user_id, class_id, class_title, class_category, class_image_url,
          class_summary, class_price, quantity, status, snapshot_json, added_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, datetime('now'), datetime('now'))
      `).bind(
        cartId,
        userId,
        classId,
        payload.class_title,
        payload.class_category,
        payload.class_image_url,
        payload.class_summary,
        payload.class_price,
        payload.snapshot_json,
      ).run();

      const created = await env.DB.prepare('SELECT * FROM user_cart_items WHERE id = ?')
        .bind(cartId).first();
      return json(request, env, { success: true, data: created, created: true });
    } catch (error) {
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id') || auth.user.id;
      const classId = url.searchParams.get('class_id');
      const itemId = url.searchParams.get('id');

      if (auth.user.id !== userId && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      if (itemId) {
        await env.DB.prepare('DELETE FROM user_cart_items WHERE id = ? AND user_id = ?')
          .bind(itemId, userId).run();
      } else if (classId) {
        await env.DB.prepare('DELETE FROM user_cart_items WHERE class_id = ? AND user_id = ?')
          .bind(classId, userId).run();
      } else {
        return json(request, env, { success: false, error: '삭제 대상이 없습니다.' }, { status: 400 });
      }

      return json(request, env, { success: true });
    } catch (error) {
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
