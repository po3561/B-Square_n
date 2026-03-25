import { requireSession, isAtLeastRole } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema } from './_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCartItem(row) {
  const classId = normalizeText(row.class_id || row.reference_id || row.content_id || '');
  const title = normalizeText(row.title || row.class_title || row.name || '');
  const subtitle = normalizeText(row.subtitle || row.class_summary || row.instructor_name || row.class_category || row.category || '');
  const imageUrl = normalizeText(row.image_url || row.class_image_url || row.thumbnail_url || row.thumbnail || '');
  const price = normalizeInt(row.price ?? row.class_price ?? row.list_price ?? row.sale_price ?? row.amount ?? row.final_amount ?? 0);
  const href = normalizeText(row.href || row.url || (classId ? `../class_view/class_view.html?id=${encodeURIComponent(classId)}` : ''));
  const type = normalizeText(row.type || row.item_type || 'class') || 'class';
  const itemType = normalizeText(row.item_type || type || 'class') || 'class';
  const referenceId = normalizeText(row.reference_id || classId || row.id || '');

  return {
    ...row,
    id: row.id || '',
    type,
    item_type: itemType,
    reference_id: referenceId,
    class_id: classId,
    title,
    subtitle,
    price,
    image_url: imageUrl,
    href,
    created_at: row.created_at || row.added_at || row.updated_at || '',
  };
}

function buildSnapshot(payload) {
  return JSON.stringify({
    id: payload.id,
    type: payload.type,
    class_id: payload.class_id,
    title: payload.title,
    subtitle: payload.subtitle,
    price: payload.price,
    image_url: payload.image_url,
    href: payload.href,
    created_at: payload.created_at,
  });
}

async function loadCartItems(db, userId) {
  const { results } = await db.prepare(`
    SELECT *
    FROM user_cart_items
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
  `).bind(userId).all();
  return (results || []).map(normalizeCartItem);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      const userId = normalizeText(url.searchParams.get('user_id') || auth.user.id);

      if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      return json(request, env, { success: true, data: await loadCartItems(env.DB, userId) });
    }

    if (method === 'POST') {
      const body = await request.json();
      const userId = normalizeText(body.user_id || auth.user.id);

      if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const itemType = normalizeText(body.type || body.item_type || 'class') || 'class';
      const referenceId = normalizeText(body.reference_id || body.class_id || body.content_id);
      if (!referenceId) {
        return json(request, env, { success: false, error: 'reference_id is required.' }, { status: 400 });
      }

      const classId = normalizeText(body.class_id || body.reference_id || body.content_id || referenceId);
      const title = normalizeText(body.title || body.name || '');
      const subtitle = normalizeText(body.subtitle || body.instructor_name || body.category || '');
      const imageUrl = normalizeText(body.image_url || body.thumbnail_url || body.imageUrl || '');
      const price = normalizeInt(body.price ?? body.class_price ?? body.list_price ?? body.sale_price ?? body.amount ?? 0);
      const href = normalizeText(body.href || body.url || (classId ? `../class_view/class_view.html?id=${encodeURIComponent(classId)}` : ''));
      const instructorName = normalizeText(body.instructor_name || body.subtitle || body.category || '');
      const category = normalizeText(body.category || '');
      const cartId = normalizeText(body.id) || `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const snapshotPayload = {
        id: cartId,
        type: itemType,
        class_id: classId,
        title,
        subtitle,
        price,
        image_url: imageUrl,
        href,
        created_at: body.created_at || new Date().toISOString(),
      };
      const metadata = body.metadata
        ? (typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata))
        : JSON.stringify(snapshotPayload);

      await env.DB.prepare(`
        INSERT INTO user_cart_items (
          id, user_id, item_type, reference_id, class_id, title,
          instructor_id, instructor_name, thumbnail_url, list_price,
          sale_price, metadata, class_title, class_category, class_image_url,
          class_summary, class_price, quantity, status, snapshot_json,
          created_at, updated_at, added_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, datetime('now'), datetime('now'), datetime('now'))
        ON CONFLICT(user_id, item_type, reference_id) DO UPDATE SET
          class_id = excluded.class_id,
          title = excluded.title,
          instructor_id = excluded.instructor_id,
          instructor_name = excluded.instructor_name,
          thumbnail_url = excluded.thumbnail_url,
          list_price = excluded.list_price,
          sale_price = excluded.sale_price,
          metadata = excluded.metadata,
          class_title = excluded.class_title,
          class_category = excluded.class_category,
          class_image_url = excluded.class_image_url,
          class_summary = excluded.class_summary,
          class_price = excluded.class_price,
          quantity = excluded.quantity,
          status = excluded.status,
          snapshot_json = excluded.snapshot_json,
          updated_at = datetime('now')
      `).bind(
        cartId,
        userId,
        itemType,
        referenceId,
        classId || null,
        title,
        normalizeText(body.instructor_id) || null,
        instructorName,
        imageUrl,
        price,
        price,
        metadata,
        title,
        category,
        imageUrl,
        subtitle,
        price,
        buildSnapshot(snapshotPayload),
      ).run();

      return json(request, env, { success: true, data: await loadCartItems(env.DB, userId) }, { status: 201 });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const userId = normalizeText(url.searchParams.get('user_id') || auth.user.id);

      if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
      }

      const clearAll = normalizeText(url.searchParams.get('clear_all'));
      if (clearAll === '1') {
        await env.DB.prepare('DELETE FROM user_cart_items WHERE user_id = ?').bind(userId).run();
        return json(request, env, { success: true, data: [] });
      }

      const itemId = normalizeText(url.searchParams.get('id'));
      if (itemId) {
        await env.DB.prepare('DELETE FROM user_cart_items WHERE user_id = ? AND id = ?')
          .bind(userId, itemId).run();
        return json(request, env, { success: true, data: await loadCartItems(env.DB, userId) });
      }

      const itemType = normalizeText(url.searchParams.get('item_type') || 'class') || 'class';
      const referenceId = normalizeText(url.searchParams.get('reference_id') || url.searchParams.get('class_id') || url.searchParams.get('content_id'));
      if (!referenceId) {
        return json(request, env, { success: false, error: 'reference_id is required.' }, { status: 400 });
      }

      await env.DB.prepare(`
        DELETE FROM user_cart_items
        WHERE user_id = ? AND item_type = ? AND reference_id = ?
      `).bind(userId, itemType, referenceId).run();

      return json(request, env, { success: true, data: await loadCartItems(env.DB, userId) });
    }
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
