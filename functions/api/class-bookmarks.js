import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureClassBookmarksSchema } from './_lib/class_support.js';
import { ensureClassStatsSchema, ensureClassesSchema } from './_lib/schema.js';

async function refreshBookmarkCount(db, classId) {
  const row = await db.prepare('SELECT COUNT(*) AS cnt FROM class_bookmarks WHERE class_id = ?').bind(classId).first().catch(() => ({ cnt: 0 }));
  const count = Number(row?.cnt || 0);

  await db.prepare(`
    INSERT INTO class_stats (class_id, bookmark_count, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(class_id) DO UPDATE SET
      bookmark_count = excluded.bookmark_count,
      updated_at = datetime('now')
  `).bind(classId, count).run();

  return count;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureClassesSchema(db);
    await ensureClassBookmarksSchema(db);
    await ensureClassStatsSchema(db);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const classId = String(url.searchParams.get('class_id') || '').trim();
      if (!classId) {
        return json(request, env, { success: false, error: 'class_id is required' }, { status: 400 });
      }

      const exists = await db.prepare('SELECT 1 FROM class_bookmarks WHERE class_id = ? AND user_id = ?').bind(classId, auth.user.id).first();
      const count = await db.prepare('SELECT COUNT(*) AS cnt FROM class_bookmarks WHERE class_id = ?').bind(classId).first().catch(() => ({ cnt: 0 }));

      return json(request, env, {
        success: true,
        data: {
          bookmarked: !!exists,
          count: Number(count?.cnt || 0),
        },
      });
    }

    if (request.method !== 'POST') {
      return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
    }

    const body = await request.json().catch(() => ({}));
    const classId = String(body.class_id || body.classId || '').trim();
    if (!classId) {
      return json(request, env, { success: false, error: 'class_id is required' }, { status: 400 });
    }

    const classRow = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(classId).first();
    if (!classRow) {
      return json(request, env, { success: false, error: '클래스를 찾을 수 없습니다.' }, { status: 404 });
    }

    const existing = await db.prepare('SELECT 1 FROM class_bookmarks WHERE class_id = ? AND user_id = ?').bind(classId, auth.user.id).first();
    let bookmarked = false;

    if (existing) {
      await db.prepare('DELETE FROM class_bookmarks WHERE class_id = ? AND user_id = ?').bind(classId, auth.user.id).run();
      bookmarked = false;
    } else {
      await db.prepare(`
        INSERT INTO class_bookmarks (class_id, user_id, created_at)
        VALUES (?, ?, datetime('now'))
      `).bind(classId, auth.user.id).run();
      bookmarked = true;
    }

    const count = await refreshBookmarkCount(db, classId);

    return json(request, env, {
      success: true,
      data: {
        bookmarked,
        count,
      },
    });
  } catch (error) {
    console.error('[API /class-bookmarks] Error:', error);
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
