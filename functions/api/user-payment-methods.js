import { isAtLeastRole, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureCommerceSchema } from './_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadMethods(db, userId) {
  const { results } = await db.prepare(`
    SELECT *
    FROM user_payment_methods
    WHERE user_id = ?
    ORDER BY is_default DESC, datetime(updated_at) DESC, datetime(created_at) DESC
  `).bind(userId).all();
  return results || [];
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    const url = new URL(request.url);
    const userId = normalizeText(url.searchParams.get('user_id') || auth.user.id);
    if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
      return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    return json(request, env, { success: true, data: await loadMethods(env.DB, userId) });
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
    const userId = normalizeText(body.user_id || auth.user.id);
    if (auth.user.id !== userId && !isAtLeastRole(auth.user.role, 'admin')) {
      return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const id = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const label = normalizeText(body.label || '결제 수단') || '결제 수단';
    const provider = normalizeText(body.provider || 'card') || 'card';
    const last4 = normalizeText(body.last4 || '').replace(/[^0-9]/g, '').slice(-4);
    const isDefault = normalizeInt(body.is_default || body.isDefault || 0) ? 1 : 0;
    const metadata = body.metadata ? (typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata)) : null;

    if (isDefault) {
      await env.DB.prepare('UPDATE user_payment_methods SET is_default = 0, updated_at = datetime("now") WHERE user_id = ?')
        .bind(userId).run();
    }

    await env.DB.prepare(`
      INSERT INTO user_payment_methods (
        id, user_id, label, provider, last4, is_default, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, userId, label, provider, last4 || null, isDefault, metadata).run();

    return json(request, env, { success: true, data: await loadMethods(env.DB, userId) }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    const body = await request.json();
    const methodId = normalizeText(body.id);
    if (!methodId) {
      return json(request, env, { success: false, error: 'id is required.' }, { status: 400 });
    }

    const current = await env.DB.prepare('SELECT * FROM user_payment_methods WHERE id = ?').bind(methodId).first();
    if (!current) {
      return json(request, env, { success: false, error: '결제 수단을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (auth.user.id !== current.user_id && !isAtLeastRole(auth.user.role, 'admin')) {
      return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    if (body.is_default !== undefined) {
      await env.DB.batch([
        env.DB.prepare('UPDATE user_payment_methods SET is_default = 0, updated_at = datetime("now") WHERE user_id = ?').bind(current.user_id),
        env.DB.prepare('UPDATE user_payment_methods SET is_default = 1, updated_at = datetime("now") WHERE id = ?').bind(methodId),
      ]);
    }

    if (body.label !== undefined || body.provider !== undefined || body.last4 !== undefined) {
      const label = body.label !== undefined ? normalizeText(body.label) : current.label;
      const provider = body.provider !== undefined ? normalizeText(body.provider) : current.provider;
      const last4 = body.last4 !== undefined ? normalizeText(body.last4).replace(/[^0-9]/g, '').slice(-4) : current.last4;
      await env.DB.prepare(`
        UPDATE user_payment_methods
        SET label = ?, provider = ?, last4 = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(label || '결제 수단', provider || 'card', last4 || null, methodId).run();
    }

    return json(request, env, { success: true, data: await loadMethods(env.DB, current.user_id) });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureCommerceSchema(env.DB);

  try {
    const url = new URL(request.url);
    const methodId = normalizeText(url.searchParams.get('id'));
    if (!methodId) {
      return json(request, env, { success: false, error: 'id is required.' }, { status: 400 });
    }

    const current = await env.DB.prepare('SELECT * FROM user_payment_methods WHERE id = ?').bind(methodId).first();
    if (!current) {
      return json(request, env, { success: false, error: '결제 수단을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (auth.user.id !== current.user_id && !isAtLeastRole(auth.user.role, 'admin')) {
      return json(request, env, { success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    await env.DB.prepare('DELETE FROM user_payment_methods WHERE id = ?').bind(methodId).run();

    const remaining = await loadMethods(env.DB, current.user_id);
    if (!remaining.some((item) => Number(item.is_default || 0) === 1) && remaining[0]) {
      await env.DB.prepare('UPDATE user_payment_methods SET is_default = 1, updated_at = datetime("now") WHERE id = ?')
        .bind(remaining[0].id).run();
    }

    return json(request, env, { success: true, data: await loadMethods(env.DB, current.user_id) });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
