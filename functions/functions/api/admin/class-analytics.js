import { json, options } from '../_lib/http.js';
import { ensureClassStatsSchema, ensureClassesSchema, ensureGatheringsSchema, ensureOperationsSchema } from '../_lib/schema.js';
import { ensureClassBookmarksSchema } from '../_lib/class_support.js';

function safeParseJSON(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function loadRevenueByRange(db, classId) {
  const rangeDefs = {
    day: `date(paid_at) = date('now')`,
    week: `datetime(paid_at) >= datetime('now', '-6 days')`,
    month: `datetime(paid_at) >= datetime('now', 'start of month')`,
    year: `datetime(paid_at) >= datetime('now', 'start of year')`,
  };

  const result = {};
  for (const [key, condition] of Object.entries(rangeDefs)) {
    const row = await db.prepare(`
      SELECT COALESCE(SUM(final_amount), 0) AS total
      FROM orders
      WHERE class_id = ?
        AND paid_at IS NOT NULL
        AND ${condition}
    `).bind(classId).first().catch(() => ({ total: 0 }));
    result[key] = Number(row?.total || 0);
  }

  return result;
}

async function loadRanking(db, top) {
  const { results } = await db.prepare(`
    SELECT
      c.id,
      c.title,
      c.category,
      c.thumbnail,
      c.price,
      c.discount_rate,
      c.instructor_name,
      c.creator_id AS instructor_id,
      c.created_at,
      c.current_participants,
      COALESCE(cs.total_visits, 0) AS visits,
      COALESCE(cs.total_enrollments, 0) AS enrollments,
      COALESCE(cs.total_revenue, 0) AS revenue,
      COALESCE(cs.avg_rating, 0) AS avg_rating,
      COALESCE(cs.review_count, 0) AS review_count,
      COALESCE(cs.bookmark_count, 0) AS bookmarks,
      COALESCE(cs.total_passes_issued, 0) AS passes_issued,
      COALESCE(cs.total_passes_used, 0) AS passes_used,
      COALESCE(cs.total_gatherings, 0) AS gatherings,
      (
        (COALESCE(cs.bookmark_count, 0) * 24) +
        (COALESCE(cs.review_count, 0) * 18) +
        (COALESCE(cs.avg_rating, 0) * 32) +
        (COALESCE(cs.total_visits, 0) * 0.5) +
        (COALESCE(cs.total_enrollments, 0) * 10) +
        (COALESCE(cs.total_gatherings, 0) * 4)
      ) AS score
    FROM classes c
    LEFT JOIN class_stats cs ON c.id = cs.class_id
    ORDER BY score DESC, c.created_at DESC
    LIMIT ?
  `).bind(top).all();

  return (results || [])
    .map((row) => ({
      ...row,
      score: Number(row.score || 0),
    }))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      bookmarks: Number(row.bookmarks || 0),
      visits: Number(row.visits || 0),
      enrollments: Number(row.enrollments || 0),
      revenue: Number(row.revenue || 0),
      avg_rating: Number(row.avg_rating || 0),
      review_count: Number(row.review_count || 0),
      passes_issued: Number(row.passes_issued || 0),
      passes_used: Number(row.passes_used || 0),
      gatherings: Number(row.gatherings || 0),
      current_participants: Number(row.current_participants || 0),
    }));
}

async function loadCategorySummary(db) {
  const { results } = await db.prepare(`
    SELECT
      COALESCE(c.category, '미분류') AS category,
      COUNT(*) AS class_count,
      COALESCE(SUM(cs.total_visits), 0) AS total_visits,
      COALESCE(SUM(cs.total_enrollments), SUM(c.current_participants), 0) AS total_enrollments,
      COALESCE(SUM(cs.total_revenue), 0) AS total_revenue,
      COALESCE(AVG(cs.avg_rating), 0) AS avg_rating
    FROM classes c
    LEFT JOIN class_stats cs ON c.id = cs.class_id
    GROUP BY COALESCE(c.category, '미분류')
    ORDER BY total_enrollments DESC, class_count DESC
  `).all();

  return (results || []).map((row) => ({
    category: row.category || '미분류',
    class_count: Number(row.class_count || 0),
    total_visits: Number(row.total_visits || 0),
    total_enrollments: Number(row.total_enrollments || 0),
    total_revenue: Number(row.total_revenue || 0),
    avg_rating: Number(row.avg_rating || 0),
  }));
}

async function loadDetail(db, classId) {
  const classRow = await db.prepare(`
    SELECT
      c.*,
      c.creator_id AS instructor_id,
      u.name AS instructor_name,
      u.email AS instructor_email,
      u.phone AS instructor_phone,
      u.profile_image_url AS instructor_profile_image,
      COALESCE(cs.total_visits, 0) AS total_visits,
      COALESCE(cs.total_enrollments, 0) AS total_enrollments,
      COALESCE(cs.total_passes_issued, 0) AS total_passes_issued,
      COALESCE(cs.total_passes_used, 0) AS total_passes_used,
      COALESCE(cs.total_revenue, 0) AS total_revenue,
      COALESCE(cs.total_gatherings, 0) AS total_gatherings,
      COALESCE(cs.avg_rating, 0) AS avg_rating,
      COALESCE(cs.review_count, 0) AS review_count,
      COALESCE(cs.bookmark_count, 0) AS bookmark_count
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    LEFT JOIN class_stats cs ON cs.class_id = c.id
    WHERE c.id = ?
  `).bind(classId).first();

  if (!classRow) return null;

  const instructor = classRow.instructor_id
    ? await db.prepare('SELECT id, name, email, phone, profile_image_url, role FROM users WHERE id = ?').bind(classRow.instructor_id).first().catch(() => null)
    : null;

  const { results: recentOrders } = await db.prepare(`
    SELECT * FROM orders
    WHERE class_id = ?
    ORDER BY datetime(COALESCE(paid_at, created_at)) DESC
    LIMIT 20
  `).bind(classId).all().catch(() => ({ results: [] }));

  const { results: participants } = await db.prepare(`
    SELECT
      cp.*,
      COALESCE(e.enrolled_at, e.created_at) AS joined_at,
      u.name,
      u.email,
      u.phone,
      u.profile_image_url
    FROM class_participants cp
    LEFT JOIN users u ON cp.user_id = u.id
    LEFT JOIN enrollments e ON e.class_id = cp.class_id AND e.user_id = cp.user_id
    WHERE cp.class_id = ?
    ORDER BY datetime(COALESCE(e.enrolled_at, e.created_at)) DESC
  `).bind(classId).all().catch(() => ({ results: [] }));

  const { results: gatherings } = await db.prepare(`
    SELECT *
    FROM class_gatherings
    WHERE class_id = ?
    ORDER BY datetime(gathering_at) DESC
  `).bind(classId).all().catch(() => ({ results: [] }));

  const { results: refundLogs } = await db.prepare(`
    SELECT
      r.*,
      u.name AS user_name,
      u.email AS user_email,
      u.phone AS user_phone,
      u.profile_image_url AS user_profile_image
    FROM user_refund_logs r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.class_id = ?
    ORDER BY datetime(COALESCE(r.processed_at, r.created_at)) DESC
  `).bind(classId).all().catch(() => ({ results: [] }));

  const summary = {
    total_students: Number(classRow.total_enrollments || classRow.current_participants || 0),
    total_meetings: Number(classRow.total_gatherings || 0),
    recent_meeting_attendance: participants.length,
    total_refund_amount: (refundLogs || []).reduce((sum, item) => sum + Number(item.refund_amount || 0), 0),
  };

  const revenueByRange = await loadRevenueByRange(db, classId);

  return {
    class: {
      ...classRow,
      image_urls: safeParseJSON(classRow.image_urls, []),
      curriculum: safeParseJSON(classRow.curriculum, []),
      sub_instructors: safeParseJSON(classRow.sub_instructors, []),
      target_audience: safeParseJSON(classRow.target_audience, []),
      objectives: safeParseJSON(classRow.objectives, []),
      is_public: Number(classRow.is_public ?? 1) === 1,
      is_approved: Number(classRow.is_approved ?? 0) === 1,
    },
    instructor,
    recent_orders: recentOrders || [],
    participants: participants || [],
    gatherings: gatherings || [],
      refund_logs: refundLogs || [],
      summary,
    revenue_by_range: revenueByRange,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);
  if (method !== 'GET') return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'ranking';
  const top = Math.max(1, Math.min(parseInt(url.searchParams.get('top')) || 10, 50));
  const classId = url.searchParams.get('classId') || '';

  try {
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);
    await ensureClassBookmarksSchema(db);
    await ensureGatheringsSchema(db);
    await ensureOperationsSchema(db);

    if (type === 'ranking') {
      const data = await loadRanking(db, top);
      return json(request, env, {
        success: true,
        data,
        top,
      });
    }

    if (type === 'category') {
      const data = await loadCategorySummary(db);
      return json(request, env, { success: true, data });
    }

    if (type === 'detail' && classId) {
      const data = await loadDetail(db, classId);
      if (!data) {
        return json(request, env, { success: false, error: 'Class not found' }, { status: 404 });
      }
      return json(request, env, { success: true, data });
    }

    const summary = await db.prepare(`
      SELECT
        COUNT(*) AS total_classes,
        COALESCE(SUM(current_participants), 0) AS total_students,
        COUNT(CASE WHEN is_approved = 1 THEN 1 END) AS active_classes,
        COUNT(CASE WHEN is_free = 1 THEN 1 END) AS free_classes
      FROM classes
    `).first();

    const instructors = await db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.profile_image_url, COUNT(c.id) AS class_count
      FROM users u
      LEFT JOIN classes c ON u.id = c.creator_id
      WHERE u.role = 'instructor'
      GROUP BY u.id
      ORDER BY class_count DESC
    `).all().catch(() => ({ results: [] }));

    return json(request, env, {
      success: true,
      data: {
        summary: summary || {},
        instructors: instructors?.results || [],
      },
    });
  } catch (err) {
    console.error('[API /admin/class-analytics] Error:', err);
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
