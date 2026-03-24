import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureOperationsSchema } from './_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadCartItems(db, userId) {
  const { results } = await db.prepare(`
    SELECT *
    FROM user_cart_items
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
  `).bind(userId).all();
  return results || [];
}

export async function onRequest(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);
  await ensureOperationsSchema(db);

  try {
    if (method === 'GET') {
      return json(request, env, { success: true, data: await loadCartItems(db, auth.user.id) });
    }

    if (method === 'POST') {
      const body = await request.json();
      const itemType = normalizeText(body.item_type || 'class') || 'class';
      const referenceId = normalizeText(body.reference_id || body.class_id || body.content_id);
      if (!referenceId) {
        return json(request, env, { success: false, error: 'reference_id is required.' }, { status: 400 });
      }

      const cartId = normalizeText(body.id) || `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.prepare(`
        INSERT INTO user_cart_items (
          id, user_id, item_type, reference_id, class_id, title,
          instructor_id, instructor_name, thumbnail_url, list_price,
          sale_price, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, item_type, reference_id) DO UPDATE SET
          class_id = excluded.class_id,
          title = excluded.title,
          instructor_id = excluded.instructor_id,
          instructor_name = excluded.instructor_name,
          thumbnail_url = excluded.thumbnail_url,
          list_price = excluded.list_price,
          sale_price = excluded.sale_price,
          metadata = excluded.metadata,
          updated_at = datetime('now')
      `).bind(
        cartId,
        auth.user.id,
        itemType,
        referenceId,
        normalizeText(body.class_id) || null,
        normalizeText(body.title),
        normalizeText(body.instructor_id) || null,
        normalizeText(body.instructor_name),
        normalizeText(body.thumbnail_url),
        normalizeInt(body.list_price),
        normalizeInt(body.sale_price),
        body.metadata ? JSON.stringify(body.metadata) : null,
      ).run();

      return json(request, env, { success: true, data: await loadCartItems(db, auth.user.id) }, { status: 201 });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const clearAll = normalizeText(url.searchParams.get('clear_all'));
      if (clearAll === '1') {
        await db.prepare('DELETE FROM user_cart_items WHERE user_id = ?').bind(auth.user.id).run();
        return json(request, env, { success: true, data: [] });
      }

      const itemType = normalizeText(url.searchParams.get('item_type') || 'class') || 'class';
      const referenceId = normalizeText(url.searchParams.get('reference_id') || url.searchParams.get('class_id') || url.searchParams.get('content_id'));
      if (!referenceId) {
        return json(request, env, { success: false, error: 'reference_id is required.' }, { status: 400 });
      }

      await db.prepare(`
        DELETE FROM user_cart_items
        WHERE user_id = ? AND item_type = ? AND reference_id = ?
      `).bind(auth.user.id, itemType, referenceId).run();

      return json(request, env, { success: true, data: await loadCartItems(db, auth.user.id) });
    }
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
