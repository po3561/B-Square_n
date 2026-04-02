import { requireAdmin } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureClassesSchema, ensureClassStatsSchema, ensureOperationsSchema } from '../_lib/schema.js';
import { ensureClassBookmarksSchema, getEffectiveClassPrice, getClassHotScore } from '../_lib/class_support.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function parseIntSafe(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVisibility(value) {
  const text = String(value || 'all').trim().toLowerCase();
  if (['public', 'visible', 'on', '1'].includes(text)) return 'public';
  if (['private', 'hidden', 'off', '0'].includes(text)) return 'private';
  return 'all';
}

function buildLike(value) {
  return `%${String(value || '').trim()}%`;
}

async function loadClasses(db, params) {
  const sortKey = normalizeText(params.sort || 'newest').toLowerCase();
  const limit = Math.min(Math.max(parseIntSafe(params.limit, 500), 1), 1000);
  const recentCutoff = "datetime('now', '-30 days')";

  let sql = `
    SELECT
      c.id,
      c.creator_id,
      c.title,
      c.category,
      c.keywords,
      c.price,
      c.discount_rate,
      c.coupon_pack,
      c.coupon_detail,
      c.class_type,
      c.operating_mode,
      c.capacity_min,
      c.capacity_max,
      c.is_approved,
      c.is_free,
      c.instructor_phone,
      c.instructor_name,
      c.instructor_email,
      c.current_participants,
      c.is_public,
      c.thumbnail,
      c.image_url,
      c.created_at,
      c.updated_at,
      c.creator_id AS instructor_id,
      COALESCE(u.name, c.instructor_name) AS creator_name,
      COALESCE(u.email, c.creator_email, c.instructor_email) AS creator_email,
      COALESCE(u.phone, c.instructor_phone) AS creator_phone,
      COALESCE(s.avg_rating, 0) AS avg_rating,
      COALESCE(s.review_count, 0) AS review_count,
      COALESCE(s.total_visits, 0) AS total_visits,
      COALESCE(s.total_enrollments, 0) AS total_enrollments,
      COALESCE(s.total_passes_issued, 0) AS total_passes_issued,
      COALESCE(s.total_passes_used, 0) AS total_passes_used,
      COALESCE(s.total_revenue, 0) AS total_revenue,
      COALESCE(s.total_gatherings, 0) AS total_gatherings,
      COALESCE(s.bookmark_count, 0) AS bookmark_count,
      COALESCE(active.recent_active_students, 0) AS recent_active_students,
      CASE
        WHEN COALESCE(c.is_free, 0) = 1 THEN 0
        WHEN COALESCE(c.discount_rate, 0) > 0 THEN ROUND(COALESCE(c.price, 0) * (1 - COALESCE(c.discount_rate, 0) / 100.0))
        ELSE COALESCE(c.price, 0)
      END AS effective_price,
      (
        (COALESCE(s.bookmark_count, 0) * 24) +
        (COALESCE(s.review_count, 0) * 18) +
        (COALESCE(s.avg_rating, 0) * 32) +
        (COALESCE(s.total_visits, 0) * 0.5) +
        (COALESCE(s.total_enrollments, 0) * 10) +
        (COALESCE(s.total_gatherings, 0) * 4)
      ) AS hot_score
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    LEFT JOIN class_stats s ON s.class_id = c.id
    LEFT JOIN (
      SELECT
        class_id,
        COUNT(DISTINCT user_id) AS recent_active_students
      FROM enrollments
      WHERE enrolled_at >= ${recentCutoff}
         OR (enrolled_at IS NULL AND created_at >= ${recentCutoff})
      GROUP BY class_id
    ) active ON active.class_id = c.id
    WHERE 1=1
  `;

  const bindings = [];

  if (params.q) {
    sql += `
      AND (
        c.title LIKE ?
        OR c.category LIKE ?
        OR c.keywords LIKE ?
        OR c.summary LIKE ?
        OR c.description LIKE ?
        OR c.description_text LIKE ?
        OR c.instructor_name LIKE ?
        OR c.creator_email LIKE ?
        OR u.name LIKE ?
        OR u.email LIKE ?
      )
    `;
    const like = buildLike(params.q);
    bindings.push(like, like, like, like, like, like, like, like, like, like);
  }

  if (params.category && params.category !== 'all') {
    sql += ' AND (c.category = ? OR c.category LIKE ? OR c.keywords LIKE ?)';
    const like = buildLike(params.category);
    bindings.push(params.category, like, like);
  }

  if (params.visibility === 'public') {
    sql += ' AND COALESCE(c.is_public, 1) = 1';
  } else if (params.visibility === 'private') {
    sql += ' AND COALESCE(c.is_public, 1) = 0';
  }

  if (params.instructorId) {
    sql += ' AND c.creator_id = ?';
    bindings.push(params.instructorId);
  }

  let orderClause = ' ORDER BY c.created_at DESC, c.title ASC';
  if (sortKey === 'popular') {
    orderClause = ' ORDER BY hot_score DESC, c.created_at DESC, c.title ASC';
  } else if (sortKey === 'price-high') {
    orderClause = ' ORDER BY effective_price DESC, c.created_at DESC, c.title ASC';
  } else if (sortKey === 'price-low') {
    orderClause = ' ORDER BY effective_price ASC, c.created_at DESC, c.title ASC';
  }

  sql += `${orderClause} LIMIT ?`;
  bindings.push(limit);

  const { results } = await db.prepare(sql).bind(...bindings).all();
  return Array.isArray(results) ? results : [];
}

function sortClasses(rows, sort) {
  const items = [...rows];
  switch (sort) {
    case 'popular':
      items.sort((a, b) => getClassHotScore(b) - getClassHotScore(a));
      break;
    case 'price-high':
      items.sort((a, b) => getEffectiveClassPrice(b) - getEffectiveClassPrice(a));
      break;
    case 'price-low':
      items.sort((a, b) => getEffectiveClassPrice(a) - getEffectiveClassPrice(b));
      break;
    case 'newest':
    default:
      items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      break;
  }
  return items;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  if (request.method !== 'GET') {
    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);
    await ensureClassBookmarksSchema(db);
    await ensureOperationsSchema(db);

    const q = normalizeText(url.searchParams.get('q'));
    const category = normalizeText(url.searchParams.get('category'));
    const instructorId = normalizeText(url.searchParams.get('instructor_id') || url.searchParams.get('creator_id'));
    const sort = normalizeText(url.searchParams.get('sort') || 'newest');
    const visibility = normalizeVisibility(url.searchParams.get('visibility'));
    const limit = Math.min(Math.max(parseIntSafe(url.searchParams.get('limit'), 500), 1), 1000);

    const data = (await loadClasses(db, {
      q,
      category,
      instructorId,
      visibility,
      sort,
      limit,
    })).map((row) => ({
      ...row,
      bookmark_count: Number(row.bookmark_count || 0),
      recent_active_students: Number(row.recent_active_students || 0),
      effective_price: getEffectiveClassPrice(row),
      hot_score: getClassHotScore(row),
      is_public: Number(row.is_public ?? 1) === 1,
      is_approved: Number(row.is_approved ?? 0) === 1,
      current_participants: Number(row.current_participants || row.total_enrollments || 0),
    }));

    return json(request, env, {
      success: true,
      data,
      meta: {
        count: data.length,
        sort,
        q,
        category,
        visibility,
        limit,
      },
    });
  } catch (error) {
    console.error('[API /admin/classes] Error:', error);
    return json(request, env, {
      success: false,
      error: '클래스 목록을 불러오지 못했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
