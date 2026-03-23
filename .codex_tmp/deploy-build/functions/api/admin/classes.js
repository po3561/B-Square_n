import { requireAdmin } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureClassesSchema, ensureClassStatsSchema } from '../_lib/schema.js';

function buildLike(value) {
  return `%${String(value || '').trim()}%`;
}

function parseIntSafe(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadClasses(db, params) {
  let sql = `
    SELECT
      c.*,
      u.name AS creator_name,
      u.email AS creator_email,
      u.phone AS creator_phone,
      COALESCE(s.avg_rating, 0) AS avg_rating,
      COALESCE(s.review_count, 0) AS review_count,
      COALESCE(s.total_visits, 0) AS total_visits,
      COALESCE(s.total_enrollments, 0) AS total_enrollments,
      COALESCE(s.total_passes_issued, 0) AS total_passes_issued,
      COALESCE(s.total_passes_used, 0) AS total_passes_used,
      COALESCE(s.total_revenue, 0) AS total_revenue,
      COALESCE(s.bookmark_count, 0) AS bookmark_count
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    LEFT JOIN class_stats s ON s.class_id = c.id
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

  if (params.category) {
    sql += ' AND (c.category LIKE ? OR c.keywords LIKE ?)';
    const like = buildLike(params.category);
    bindings.push(like, like);
  }

  if (params.instructorId) {
    sql += ' AND c.creator_id = ?';
    bindings.push(params.instructorId);
  }

  if (params.approved !== null) {
    sql += ' AND c.is_approved = ?';
    bindings.push(params.approved ? 1 : 0);
  }

  sql += ' ORDER BY c.created_at DESC, c.title ASC';

  if (params.limit !== null) {
    sql += ' LIMIT ? OFFSET ?';
    bindings.push(params.limit, params.offset);
  }

  const { results } = await db.prepare(sql).bind(...bindings).all();
  return Array.isArray(results) ? results : [];
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

    const limitParam = url.searchParams.get('limit');
    const hasLimit = limitParam !== null && limitParam !== '';
    const limit = hasLimit ? Math.min(Math.max(parseIntSafe(limitParam, 0), 1), 5000) : null;
    const offset = Math.max(parseIntSafe(url.searchParams.get('offset'), 0), 0);
    const q = String(url.searchParams.get('q') || '').trim();
    const category = String(url.searchParams.get('category') || '').trim();
    const instructorId = String(url.searchParams.get('instructor_id') || url.searchParams.get('creator_id') || '').trim();

    const approvedParam = url.searchParams.get('is_approved');
    const approved = approvedParam === '1' ? true : approvedParam === '0' ? false : null;

    const data = await loadClasses(db, {
      q,
      category,
      instructorId,
      approved,
      limit,
      offset,
    });

    return json(request, env, {
      success: true,
      data,
      meta: {
        count: data.length,
        limit,
        offset,
        q,
        category,
        instructorId,
        is_approved: approvedParam,
      },
    });
  } catch (error) {
    console.error('[API /admin/classes] Error:', error);
    return json(request, env, {
      success: false,
      error: '관리자 클래스 카탈로그를 불러오지 못했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
