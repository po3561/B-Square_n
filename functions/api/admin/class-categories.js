import { requireAdmin } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { loadClassCategories, normalizeCategoryName, defaultCategoryEmoji, ensureClassCategoriesSchema } from '../_lib/class_support.js';

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeEmoji(value, fallbackName = '') {
  const text = String(value ?? '').trim();
  return text || defaultCategoryEmoji(fallbackName);
}

async function propagateCategoryRename(db, fromName, toName) {
  if (!fromName || !toName || fromName === toName) return;
  await db.prepare('UPDATE classes SET category = ? WHERE category = ?').bind(toName, fromName).run();
  await db.prepare('UPDATE recommendations SET category = ? WHERE category = ?').bind(toName, fromName).run();
  await db.prepare('UPDATE user_chats SET class_category = ? WHERE class_category = ?').bind(toName, fromName).run().catch(() => {});
}

async function propagateCategoryDelete(db, categoryName) {
  if (!categoryName) return;
  await db.prepare('UPDATE classes SET category = NULL WHERE category = ?').bind(categoryName).run();
  await db.prepare("UPDATE recommendations SET category = 'all' WHERE category = ?").bind(categoryName).run();
  await db.prepare("UPDATE user_chats SET class_category = '미분류' WHERE class_category = ?").bind(categoryName).run().catch(() => {});
}

async function fetchAllCategories(db) {
  const rows = await loadClassCategories(db, { activeOnly: false });
  return rows.map((row) => ({
    name: row.name,
    emoji: row.emoji || '✨',
    sort_order: Number(row.sort_order || 0),
    is_active: Number(row.is_active ?? 1) === 1,
    class_count: Number(row.class_count || 0),
    public_class_count: Number(row.public_class_count || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureClassCategoriesSchema(db);

    if (method === 'GET') {
      const categories = await fetchAllCategories(db);
      return json(request, env, { success: true, data: categories });
    }

    const body = await request.json().catch(() => ({}));

    if (method === 'POST') {
      const name = normalizeCategoryName(body.name);
      if (!name) {
        return json(request, env, { success: false, error: '카테고리 이름이 필요합니다.' }, { status: 400 });
      }

      const emoji = normalizeEmoji(body.emoji, name);
      const sortOrder = toNumber(body.sort_order, 0);
      const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0);

      const existed = await db.prepare('SELECT name FROM class_categories WHERE name = ?').bind(name).first();

      await db.prepare(`
        INSERT INTO class_categories (name, emoji, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(name) DO UPDATE SET
          emoji = excluded.emoji,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active,
          updated_at = datetime('now')
      `).bind(name, emoji, sortOrder, isActive).run();

      return json(request, env, {
        success: true,
        message: existed ? '카테고리가 수정되었습니다.' : '카테고리가 추가되었습니다.',
        data: { name, emoji, sort_order: sortOrder, is_active: !!isActive },
      });
    }

    if (method === 'PUT') {
      const originalName = normalizeCategoryName(body.original_name || body.previous_name || body.name);
      const nextName = normalizeCategoryName(body.name);
      if (!originalName || !nextName) {
        return json(request, env, { success: false, error: '수정할 카테고리 이름이 필요합니다.' }, { status: 400 });
      }

      const emoji = normalizeEmoji(body.emoji, nextName);
      const sortOrder = toNumber(body.sort_order, 0);
      const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0);

      if (originalName !== nextName) {
        await db.prepare('DELETE FROM class_categories WHERE name = ?').bind(originalName).run();
      }

      await db.prepare(`
        INSERT INTO class_categories (name, emoji, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(name) DO UPDATE SET
          emoji = excluded.emoji,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active,
          updated_at = datetime('now')
      `).bind(nextName, emoji, sortOrder, isActive).run();

      await propagateCategoryRename(db, originalName, nextName);

      return json(request, env, {
        success: true,
        message: '카테고리가 수정되었습니다.',
        data: { name: nextName, emoji, sort_order: sortOrder, is_active: !!isActive },
      });
    }

    if (method === 'DELETE') {
      const name = normalizeCategoryName(body.name || body.category || '');
      if (!name) {
        return json(request, env, { success: false, error: '삭제할 카테고리 이름이 필요합니다.' }, { status: 400 });
      }

      await propagateCategoryDelete(db, name);
      await db.prepare('DELETE FROM class_categories WHERE name = ?').bind(name).run();

      return json(request, env, {
        success: true,
        message: '카테고리가 삭제되었습니다.',
      });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[API /admin/class-categories] Error:', error);
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
