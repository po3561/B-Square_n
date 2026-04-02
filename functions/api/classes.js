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

function parseNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function parseSortSpec(rawSort, rawOrder) {
  const sortInput = String(rawSort ?? '').trim().toLowerCase();
  const orderInput = String(rawOrder ?? '').trim().toLowerCase();

  let sort = 'created_at';
  let defaultOrder = 'DESC';

  if (sortInput === 'oldest') {
    sort = 'created_at';
    defaultOrder = 'ASC';
  } else if (['popular', 'bookmarks', 'bookmark', 'likes', 'hot'].includes(sortInput)) {
    sort = 'popular';
  } else if (['rating', 'reviews'].includes(sortInput)) {
    sort = 'rating';
  } else if (['participants', 'students', 'enrollments'].includes(sortInput)) {
    sort = 'participants';
  } else if (['price', 'price_low', 'price_asc', 'low_price'].includes(sortInput)) {
    sort = 'price';
    defaultOrder = 'ASC';
  } else if (['price_high', 'price_desc', 'high_price'].includes(sortInput)) {
    sort = 'price';
    defaultOrder = 'DESC';
  } else if (['new', 'newest', 'recent', 'latest', 'created_at', ''].includes(sortInput)) {
    sort = 'created_at';
    defaultOrder = 'DESC';
  }

  const order = orderInput === 'asc' ? 'ASC' : orderInput === 'desc' ? 'DESC' : defaultOrder;
  return { sort, order };
}

function buildOrderByClause(sort, order) {
  switch (sort) {
    case 'popular':
      return `COALESCE(s.bookmark_count, 0) ${order}, COALESCE(s.review_count, 0) ${order}, c.created_at DESC, c.id DESC`;
    case 'rating':
      return `COALESCE(s.avg_rating, 0) ${order}, COALESCE(s.review_count, 0) ${order}, c.created_at DESC, c.id DESC`;
    case 'participants':
      return `COALESCE(s.total_enrollments, c.current_participants, 0) ${order}, c.created_at DESC, c.id DESC`;
    case 'price':
      return `CASE WHEN COALESCE(c.is_free, 0) = 1 THEN 0 ELSE COALESCE(c.price, 0) END ${order}, c.created_at DESC, c.id DESC`;
    case 'created_at':
    default:
      return `c.created_at ${order}, c.id ${order}`;
  }
}

function parseCursorToken(value) {
  const token = trimText(value);
  if (!token) return { cursor: null, error: null };

  let decoded = '';
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    try {
      decoded = Buffer.from(token, 'base64').toString('utf8');
    } catch {
      return { cursor: null, error: 'Invalid cursor encoding' };
    }
  }

  try {
    const payload = JSON.parse(decoded);
    const createdAt = trimText(payload?.created_at);
    const id = trimText(payload?.id);
    if (!createdAt || !id) {
      return { cursor: null, error: 'Invalid cursor payload' };
    }
    return { cursor: { createdAt, id }, error: null };
  } catch {
    return { cursor: null, error: 'Invalid cursor payload' };
  }
}

function makeCursorToken(row) {
  const createdAt = trimText(row?.created_at);
  const id = trimText(row?.id);
  if (!createdAt || !id) return null;
  return Buffer.from(JSON.stringify({ created_at: createdAt, id }), 'utf8').toString('base64url');
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

function buildPageMeta(limit, offset, count, hasMore, extra = {}) {
  return {
    limit,
    offset,
    count,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    ...extra,
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
    c.coupon_detail,
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
    const hasSortQuery = url.searchParams.has('sort') || url.searchParams.has('order');
    const { sort, order } = parseSortSpec(url.searchParams.get('sort'), url.searchParams.get('order'));
    const requestedLimit = parseIntOrDefault(url.searchParams.get('limit'), 50, 200);
    const limit = category || query || instructorId ? requestedLimit : Math.min(requestedLimit, 120);
    const offset = parseNonNegativeInt(url.searchParams.get('offset'), 0);
    const includeTotal = isTruthyFlag(url.searchParams.get('include_total'));
    const hasCursorQuery = url.searchParams.has('cursor');
    const { cursor, error: cursorError } = parseCursorToken(url.searchParams.get('cursor'));

    if (cursorError) {
      return json(request, env, { success: false, error: cursorError }, { status: 400 });
    }
    if (cursor && sort !== 'created_at') {
      return json(request, env, { success: false, error: 'cursor is only supported for created_at sorting' }, { status: 400 });
    }

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

      if (cursor) {
        if (order === 'DESC') {
          sql += ' AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))';
        } else {
          sql += ' AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?))';
        }
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }

      sql += ` ORDER BY ${buildOrderByClause(sort, order)} LIMIT ?`;
      params.push(limit + 1);

      if (!cursor) {
        sql += ' OFFSET ?';
        params.push(offset);
      }

      const { results } = await db.prepare(sql).bind(...params).all();
      const rows = (results || []).map(normalizeClassRow);
      const hasMore = rows.length > limit;
      const enriched = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && sort === 'created_at'
        ? makeCursorToken(enriched[enriched.length - 1])
        : null;

      let total = null;
      if (includeTotal) {
        let totalSql = `
          SELECT COUNT(*) AS total
          FROM classes c
          LEFT JOIN users u ON u.id = c.creator_id
          WHERE c.is_public = 1
        `;
        const totalParams = [];

        if (category) {
          totalSql += ' AND c.category = ?';
          totalParams.push(category);
        }

        if (instructorId) {
          totalSql += ' AND c.creator_id = ?';
          totalParams.push(instructorId);
        }

        if (query) {
          const like = `%${query}%`;
          totalSql += ' AND (c.title LIKE ? OR c.category LIKE ? OR c.keywords LIKE ? OR c.instructor_name LIKE ? OR c.instructor_email LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
          totalParams.push(like, like, like, like, like, like, like);
        }

        const totalRow = await db.prepare(totalSql).bind(...totalParams).first().catch(() => ({ total: 0 }));
        total = Number(totalRow?.total || 0);
      }

      const extraMeta = {};
      if (hasSortQuery) {
        extraMeta.sort = sort;
        extraMeta.order = order.toLowerCase();
      }
      if (includeTotal) {
        extraMeta.total = total;
      }
      if (hasCursorQuery) {
        extraMeta.next_cursor = nextCursor;
      }
      if (cursor) {
        extraMeta.next_offset = null;
      }

      return json(request, env, {
        success: true,
        data: enriched,
        meta: buildPageMeta(limit, cursor ? 0 : offset, enriched.length, hasMore, extraMeta),
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
      const body = await request.json().catch(() => ({}));
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
