import { requireClassManager, requireSession } from './_lib/auth.js';
import { json } from './_lib/http.js';

import { ensureClassStatsSchema, ensureClassesSchema } from './_lib/schema.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=15, stale-while-revalidate=120',
};

function trimText(value) {
  return String(value ?? '').trim();
}

function parseIntOrDefault(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function normalizeClassRow(row) {
  return {
    ...row,
    avg_rating: Number(row.avg_rating || 0).toFixed(1),
    review_count: Number(row.review_count || 0),
    bookmark_count: Number(row.bookmark_count || 0),
    like_count: Number(row.like_count || row.bookmark_count || 0),
    is_public: Number(row.is_public ?? 1) === 1,
  };
}

function buildPageMeta(limit, offset, count, hasMore) {
  return {
    limit,
    offset,
    count,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
}

const CLASS_LIST_SELECT = `
  SELECT
    c.id,
    c.creator_id,
    c.title,
    c.category,
    c.keywords,
    c.summary,
    c.price,
    c.discount_rate,
    c.coupon_pack,
    c.class_type,
    c.operating_mode,
    c.is_free,
    c.instructor_phone,
    c.instructor_name,
    c.instructor_email,
    c.current_participants,
    c.thumbnail,
    c.image_url,
    c.created_at,
    c.updated_at,
    u.name AS creator_name,
    COALESCE(u.email, c.creator_email) AS creator_email,
    COALESCE(s.avg_rating, 0) AS avg_rating,
    COALESCE(s.review_count, 0) AS review_count,
    COALESCE(s.bookmark_count, 0) AS bookmark_count,
    COALESCE(s.bookmark_count, 0) AS like_count,
    COALESCE(c.is_public, 1) AS is_public
  FROM classes c
  LEFT JOIN users u ON u.id = c.creator_id
  LEFT JOIN class_stats s ON s.class_id = c.id
`;

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    const category = trimText(url.searchParams.get('category'));
    const query = trimText(url.searchParams.get('q'));
    const instructorId = trimText(url.searchParams.get('instructor_id') || url.searchParams.get('creator_id'));
    const requestedLimit = parseIntOrDefault(url.searchParams.get('limit'), 50, 200);
    const limit = category || query || instructorId ? requestedLimit : Math.min(requestedLimit, 120);
    const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    let phase = 'ensure';
    try {
      await ensureClassesSchema(db);
      await ensureClassStatsSchema(db);

      phase = 'query';
      let sql = `${CLASS_LIST_SELECT} WHERE c.is_public = 1`;
      const params = [];

      if (category) {
        sql += ' AND c.category = ?';
        params.push(category);
      }

      if (instructorId) {
        sql += ' AND c.creator_id = ?';
        params.push(instructorId);
      }

      if (query) {
        const like = `%${query}%`;
        sql += ' AND (c.title LIKE ? OR c.category LIKE ? OR c.keywords LIKE ? OR c.instructor_name LIKE ? OR c.instructor_email LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
        params.push(like, like, like, like, like, like, like);
      }

      sql += ' ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?';
      params.push(limit + 1, offset);

      const { results } = await db.prepare(sql).bind(...params).all();
      const rows = (results || []).map(normalizeClassRow);
      const hasMore = rows.length > limit;
      const enriched = hasMore ? rows.slice(0, limit) : rows;

      return json(request, env, {
        success: true,
        data: enriched,
        meta: buildPageMeta(limit, offset, enriched.length, hasMore),
      }, { headers: RESPONSE_HEADERS });
    } catch (error) {
      return json(request, env, {
        success: false,
        error: 'Failed to load class list',
        phase,
        detail: error.message,
        stack: error.stack || '',
      }, { status: 500 });
    }
  }

  if (method === 'PATCH') {
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;

    try {
      const body = await request.json();
      const id = trimText(body.id);
      if (!id) {
        return json(request, env, { success: false, error: 'ID is required' }, { status: 400 });
      }

      const classAuth = await requireClassManager(context, id);
      if (!classAuth.ok) return classAuth.response;

      const updates = [];
      const values = [];

      for (const key of ['title', 'category', 'is_approved', 'price']) {
        if (body[key] !== undefined) {
          if (key === 'title') {
            const title = trimText(body[key]);
            if (!title) {
              return json(request, env, { success: false, error: 'Title is required' }, { status: 400 });
            }
            updates.push('title = ?');
            values.push(title);
            continue;
          }

          if (key === 'category') {
            updates.push('category = ?');
            values.push(trimText(body[key]) || null);
            continue;
          }

          if (key === 'is_approved') {
            updates.push('is_approved = ?');
            values.push(isTruthyFlag(body[key]) ? 1 : 0);
            continue;
          }

          if (key === 'price') {
            const parsedPrice = Number(body[key]);
            if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
              return json(request, env, { success: false, error: 'price must be a non-negative number' }, { status: 400 });
            }
            updates.push('price = ?');
            values.push(Math.trunc(parsedPrice));
          }
        }
      }

      if (!updates.length) {
        return json(request, env, { success: false, error: 'No fields to update' }, { status: 400 });
      }

      updates.push("updated_at = datetime('now')");
      values.push(id);

      await db.prepare(`UPDATE classes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

      return json(request, env, { success: true, message: 'Class updated successfully' });
    } catch (error) {
      return json(request, env, {
        success: false,
        error: 'Failed to update class',
        detail: error.message,
      }, { status: 500 });
    }
  }

  if (method === 'DELETE') {
    const id = trimText(url.searchParams.get('id'));
    if (!id) {
      return json(request, env, { success: false, error: 'ID is required' }, { status: 400 });
    }

    const auth = await requireClassManager(context, id);
    if (!auth.ok) return auth.response;

    try {
      const cleanupTables = [
        'enrollments',
        'reviews',
        'chat_messages',
        'dm_messages',
        'user_chats',
        'class_notices',
        'coupons',
        'class_participants',
        'class_boards',
        'user_passes',
        'class_bookmarks',
        'class_stats',
      ];

      try {
        await db.prepare('DELETE FROM gathering_participants WHERE gathering_id IN (SELECT id FROM class_gatherings WHERE class_id = ?)').bind(id).run();
      } catch (cleanupError) {
        console.warn('[classes DELETE] skipped gathering_participants:', cleanupError.message);
      }

      try {
        await db.prepare('DELETE FROM class_gatherings WHERE class_id = ?').bind(id).run();
      } catch (cleanupError) {
        console.warn('[classes DELETE] skipped class_gatherings:', cleanupError.message);
      }

      for (const table of cleanupTables) {
        try {
          if (table === 'user_chats') {
            await db.prepare('DELETE FROM user_chats WHERE room_id = ?').bind(id).run();
            continue;
          }

          await db.prepare(`DELETE FROM ${table} WHERE class_id = ?`).bind(id).run();
        } catch (cleanupError) {
          console.warn(`[classes DELETE] skipped ${table}:`, cleanupError.message);
        }
      }

      await db.prepare('UPDATE contacts SET source_class_id = NULL WHERE source_class_id = ?').bind(id).run();

      const result = await db.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
      if (result.meta?.changes === 0) {
        return json(request, env, { success: false, error: 'Class not found' }, { status: 404 });
      }

      return json(request, env, {
        success: true,
        message: 'Class and related records deleted successfully',
        id,
      });
    } catch (error) {
      return json(request, env, {
        success: false,
        error: 'Failed to delete class',
        detail: error.message,
      }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
