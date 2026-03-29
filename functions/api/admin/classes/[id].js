import { requireAdmin } from '../../_lib/auth.js';
import { json, options } from '../../_lib/http.js';
import { ensureClassStatsSchema, ensureClassesSchema, ensureOperationsSchema, ensureReviewsSchema } from '../../_lib/schema.js';
import { ensureClassBookmarksSchema } from '../../_lib/class_support.js';

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

function uniqueStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

function extractSubInstructorIds(rawValue) {
  if (!rawValue) return [];

  let parsed = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return uniqueStrings(parsed.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.id || item.user_id || item.userId || '';
    }
    return '';
  }));
}

function buildNotInClause(column, values = []) {
  const ids = uniqueStrings(values);
  if (!ids.length) {
    return { clause: '', binds: [] };
  }

  return {
    clause: ` AND ${column} NOT IN (${ids.map(() => '?').join(',')})`,
    binds: ids,
  };
}

function normalizeSubInstructorItem(item, profile = {}, index = 0) {
  const fallback = item && typeof item === 'object' ? item : {};
  const id = String(fallback.id || fallback.user_id || fallback.userId || profile.id || '').trim();
  const name = profile.name || fallback.name || fallback.nickname || '서브 강사';
  const email = profile.email || fallback.email || '';
  const phone = profile.phone || fallback.phone || '';
  const image = profile.profile_image_url || fallback.profile_image_url || fallback.avatar || '';
  const role = profile.role || fallback.role || 'instructor';

  return {
    id: id || `sub_instructor_${index}`,
    user_id: id || `sub_instructor_${index}`,
    name,
    email,
    phone,
    profile_image_url: image,
    avatar: image,
    role,
  };
}

async function loadSubInstructorProfiles(db, rawSubInstructors = []) {
  const refs = Array.isArray(rawSubInstructors) ? rawSubInstructors : safeParseJSON(rawSubInstructors, []);
  const ids = uniqueStrings(refs.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.id || item.user_id || item.userId || '';
    return '';
  }));

  if (!ids.length) {
    return refs.map((item, index) => normalizeSubInstructorItem(item, {}, index));
  }

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`
    SELECT id, name, email, phone, profile_image_url, role
    FROM users
    WHERE id IN (${placeholders})
  `).bind(...ids).all().catch(() => ({ results: [] }));

  const byId = new Map((results || []).map((row) => [String(row.id), row]));
  return refs.map((item, index) => {
    const rawId = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? item.id || item.user_id || item.userId || '' : '');
    const profile = rawId ? byId.get(String(rawId).trim()) || {} : {};
    return normalizeSubInstructorItem(item, profile, index);
  });
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYear(date = new Date()) {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadRevenueByRange(db, classId) {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(paid_at) = date('now') THEN final_amount ELSE 0 END), 0) AS day,
      COALESCE(SUM(CASE WHEN datetime(paid_at) >= datetime('now', '-6 days') THEN final_amount ELSE 0 END), 0) AS week,
      COALESCE(SUM(CASE WHEN datetime(paid_at) >= datetime('now', 'start of month') THEN final_amount ELSE 0 END), 0) AS month,
      COALESCE(SUM(CASE WHEN datetime(paid_at) >= datetime('now', 'start of year') THEN final_amount ELSE 0 END), 0) AS year
    FROM orders
    WHERE class_id = ?
      AND paid_at IS NOT NULL
  `).bind(classId).first().catch(() => ({ day: 0, week: 0, month: 0, year: 0 }));

  return {
    day: Number(row?.day || 0),
    week: Number(row?.week || 0),
    month: Number(row?.month || 0),
    year: Number(row?.year || 0),
  };
}

async function loadStudentStats(db, classId, excludedIds = []) {
  const filter = buildNotInClause('user_id', excludedIds);
  const row = await db.prepare(`
    SELECT
      COUNT(DISTINCT user_id) AS total_students,
      COUNT(DISTINCT CASE
        WHEN datetime(COALESCE(enrolled_at, created_at)) >= datetime('now', '-30 days') THEN user_id
      END) AS recent_active_students
    FROM enrollments
    WHERE class_id = ?
      ${filter.clause}
  `).bind(classId, ...filter.binds).first().catch(() => ({ total_students: 0, recent_active_students: 0 }));

  return {
    total_students: Number(row?.total_students || 0),
    recent_active_students: Number(row?.recent_active_students || 0),
  };
}

async function loadRefundSummary(db, classId) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) AS total_refund_amount
    FROM user_refund_logs
    WHERE class_id = ?
  `).bind(classId).first().catch(() => ({ total_refund_amount: 0 }));

  return {
    total_refund_amount: Number(row?.total_refund_amount || 0),
  };
}

async function loadRecentRefundLogs(db, classId) {
  const { results } = await db.prepare(`
    SELECT
      r.id,
      r.user_id,
      r.order_id,
      r.class_id,
      r.class_title,
      r.refund_type,
      r.original_amount,
      r.refund_amount,
      r.reason_tags,
      r.reason_note,
      r.status,
      r.processed_by,
      r.processed_at,
      r.metadata,
      r.created_at,
      u.name AS user_name,
      u.email AS user_email,
      u.phone AS user_phone,
      u.profile_image_url AS user_profile_image
    FROM user_refund_logs r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.class_id = ?
    ORDER BY datetime(COALESCE(r.processed_at, r.created_at)) DESC
    LIMIT 100
  `).bind(classId).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results : [];
}

async function loadMeetingStats(db, classId, excludedIds = []) {
  const filter = buildNotInClause('gp.user_id', excludedIds);
  const attendance = await db.prepare(`
    SELECT
      COUNT(*) AS attendance_count,
      COUNT(DISTINCT gp.user_id) AS distinct_attendees
    FROM class_gatherings g
    JOIN gathering_participants gp ON gp.gathering_id = g.id
    WHERE g.class_id = ?
      AND datetime(g.gathering_at) >= datetime('now', '-30 days')
      ${filter.clause}
  `).bind(classId, ...filter.binds).first().catch(() => ({ attendance_count: 0, distinct_attendees: 0 }));

  return {
    recent_attendance_count: Number(attendance?.attendance_count || 0),
    recent_attendee_count: Number(attendance?.distinct_attendees || 0),
  };
}

async function deleteClassReferences(db, classId) {
  await db.prepare('DELETE FROM gathering_participants WHERE gathering_id IN (SELECT id FROM class_gatherings WHERE class_id = ?)').bind(classId).run();
  await db.prepare('DELETE FROM class_gatherings WHERE class_id = ?').bind(classId).run();

  const tables = [
    'enrollments',
    'reviews',
    'chat_messages',
    'class_notices',
    'coupons',
    'class_participants',
    'class_boards',
    'user_passes',
    'class_bookmarks',
  ];

  for (const table of tables) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE class_id = ?`).bind(classId).run();
    } catch (error) {
      console.warn(`[API admin/classes/:id] Skipped ${table}:`, error.message);
    }
  }

  await db.prepare('UPDATE contacts SET source_class_id = NULL WHERE source_class_id = ?').bind(classId).run().catch(() => {});

  const { results: folders } = await db
    .prepare('SELECT folder_id, class_ids, type FROM recommendations')
    .all()
    .catch(() => ({ results: [] }));

  for (const folder of folders || []) {
    let classIds = [];
    try {
      classIds = JSON.parse(folder.class_ids || '[]');
      if (!Array.isArray(classIds)) classIds = [];
    } catch {
      classIds = [];
    }

    const nextIds = classIds.filter((id) => String(id) !== String(classId));
    if (nextIds.length === classIds.length) continue;

    await db.prepare('UPDATE recommendations SET class_ids = ? WHERE folder_id = ?').bind(JSON.stringify(nextIds), folder.folder_id).run();
  }

  await db.prepare('DELETE FROM class_stats WHERE class_id = ?').bind(classId).run().catch(() => {});
  return true;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const db = env.DB;
  const classId = params.id;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  if (!classId) {
    return json(request, env, { success: false, error: 'class_id is required' }, { status: 400 });
  }

  try {
    await ensureClassesSchema(db);
    await ensureReviewsSchema(db);
    await ensureClassStatsSchema(db);
    await ensureOperationsSchema(db);
    await ensureClassBookmarksSchema(db);

    if (request.method === 'GET') {
      const classRow = await db.prepare(`
        SELECT
          c.id,
          c.creator_id,
          c.creator_email,
          c.title,
          c.category,
          c.keywords,
          c.summary,
          c.description,
          c.description_text,
          c.price,
          c.discount_rate,
          c.coupon_pack,
          c.class_type,
          c.operating_mode,
          c.capacity_min,
          c.capacity_max,
          c.tickets_price_one_time,
          c.tickets_pass_count,
          c.tickets_price_multi,
          c.tickets_price_monthly,
          c.image_url,
          c.image_urls,
          c.thumbnail,
          c.curriculum,
          c.sub_instructors,
          c.target_audience,
          c.objectives,
          c.is_approved,
          c.is_free,
          c.current_participants,
          c.is_public,
          c.coupon_detail,
          c.created_at,
          c.updated_at,
          c.creator_id AS instructor_id,
          COALESCE(u.name, c.instructor_name) AS creator_name,
          COALESCE(u.name, c.instructor_name) AS instructor_name,
          COALESCE(u.email, c.instructor_email, c.creator_email) AS instructor_email,
          COALESCE(u.phone, c.instructor_phone) AS instructor_phone,
          u.role AS instructor_role,
          u.profile_image_url AS instructor_profile_image,
          u.profile_image_url AS creator_profile_image,
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

      if (!classRow) {
        return json(request, env, { success: false, error: '클래스를 찾을 수 없습니다.' }, { status: 404 });
      }

      const rawSubInstructors = safeParseJSON(classRow.sub_instructors, []);
      const subInstructorProfiles = await loadSubInstructorProfiles(db, rawSubInstructors).catch(() => []);
      const instructorIds = uniqueStrings([
        classRow.instructor_id,
        ...subInstructorProfiles.map((item) => item.id),
      ]);

      const [
        studentStats,
        revenueByRange,
        meetingStats,
        refundSummary,
        refundLogs,
      ] = await Promise.all([
        loadStudentStats(db, classId, instructorIds).catch(() => ({ total_students: 0, recent_active_students: 0 })),
        loadRevenueByRange(db, classId).catch(() => ({ day: 0, week: 0, month: 0, year: 0 })),
        loadMeetingStats(db, classId, instructorIds).catch(() => ({ recent_attendance_count: 0, recent_attendee_count: 0 })),
        loadRefundSummary(db, classId).catch(() => ({ total_refund_amount: 0 })),
        loadRecentRefundLogs(db, classId).catch(() => []),
      ]);

      const totalStudents = Number(studentStats?.total_students || classRow.total_enrollments || classRow.current_participants || 0);
      const recentActiveCount = Number(studentStats?.recent_active_students || 0);
      const totalMeetings = Number(classRow.total_gatherings || 0);
      const totalRevenue = Number(classRow.total_revenue || 0);
      const avgRevenuePerMeeting = totalMeetings > 0
        ? Math.round(totalRevenue / totalMeetings)
        : 0;
      const totalRefundAmount = Number(refundSummary?.total_refund_amount || 0);
      const reviewCount = Number(classRow.review_count || 0);
      const avgRating = Number(classRow.avg_rating || 0);
      const bookmarkCount = Number(classRow.bookmark_count || 0);
      const totalPassesIssued = Number(classRow.total_passes_issued || 0);
      const totalPassesUsed = Number(classRow.total_passes_used || 0);
      const instructor = {
        id: classRow.instructor_id || null,
        name: classRow.instructor_name || null,
        email: classRow.instructor_email || null,
        phone: classRow.instructor_phone || null,
        profile_image_url: classRow.instructor_profile_image || null,
        role: classRow.instructor_role || null,
      };
      const subInstructors = subInstructorProfiles.length ? subInstructorProfiles : rawSubInstructors.map((item, index) => normalizeSubInstructorItem(item, {}, index));

      return json(request, env, {
        success: true,
        data: {
          class: {
            ...classRow,
            image_urls: safeParseJSON(classRow.image_urls, []),
            curriculum: safeParseJSON(classRow.curriculum, []),
            target_audience: safeParseJSON(classRow.target_audience, []),
            objectives: safeParseJSON(classRow.objectives, []),
            is_public: Number(classRow.is_public ?? 1) === 1,
            is_approved: Number(classRow.is_approved ?? 0) === 1,
            total_students: totalStudents,
            current_participants: totalStudents,
            total_enrollments: totalStudents,
            recent_active_students: recentActiveCount,
            total_meetings: totalMeetings,
            recent_meeting_attendance: Number(meetingStats?.recent_attendance_count || 0),
            recent_meeting_attendee_count: Number(meetingStats?.recent_attendee_count || 0),
            total_passes_issued: totalPassesIssued,
            total_passes_used: totalPassesUsed,
            total_revenue: totalRevenue,
            total_gatherings: totalMeetings,
            avg_rating: avgRating,
            review_count: reviewCount,
            bookmark_count: bookmarkCount,
            like_count: bookmarkCount,
            total_refund_amount: totalRefundAmount,
            sub_instructors: subInstructors,
          },
          instructor,
          recent_students: [],
          participants: [],
          gatherings: [],
          refund_logs: refundLogs,
          revenue_by_range: revenueByRange,
          meeting_stats: meetingStats,
          summary: {
            total_students: totalStudents,
            recent_active_students: recentActiveCount,
            recent_meeting_attendance: meetingStats.recent_attendance_count || 0,
            recent_meeting_attendee_count: meetingStats.recent_attendee_count || 0,
            total_meetings: totalMeetings,
            avg_revenue_per_meeting: avgRevenuePerMeeting,
            total_refund_amount: totalRefundAmount,
            total_revenue: totalRevenue,
            total_passes_issued: totalPassesIssued,
            total_passes_used: totalPassesUsed,
            review_count: reviewCount,
            avg_rating: avgRating,
            bookmark_count: bookmarkCount,
            total_visits: Number(classRow.total_visits || 0),
            total_gatherings: totalMeetings,
          },
        },
      });
    }

    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const nextIsPublic = body.is_public === undefined ? null : (body.is_public ? 1 : 0);

      if (nextIsPublic === null) {
        return json(request, env, { success: false, error: 'is_public is required' }, { status: 400 });
      }

      await db.prepare(`
        UPDATE classes
        SET is_public = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(nextIsPublic, classId).run();

      return json(request, env, {
        success: true,
        message: '공개 상태가 변경되었습니다.',
        data: { id: classId, is_public: !!nextIsPublic },
      });
    }

    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => ({}));
      const confirmTitle = String(body.confirm_title || body.class_title || body.title || '').trim();
      const classRow = await db.prepare('SELECT title FROM classes WHERE id = ?').bind(classId).first();
      if (!classRow) {
        await deleteClassReferences(db, classId).catch((error) => {
          console.warn('[API admin/classes/:id] cleanup skipped for missing class:', error.message);
        });
        return json(request, env, {
          success: true,
          message: '이미 삭제되었거나 동기화가 지연된 클래스입니다. 목록을 새로고침했습니다.',
          data: { id: classId, already_missing: true },
        });
      }

      if (!confirmTitle || confirmTitle !== String(classRow.title || '').trim()) {
        return json(request, env, { success: false, error: '클래스명을 정확히 입력해야 삭제할 수 있습니다.' }, { status: 400 });
      }

      await deleteClassReferences(db, classId);
      const result = await db.prepare('DELETE FROM classes WHERE id = ?').bind(classId).run();

      if (!result?.meta || result.meta.changes === 0) {
        return json(request, env, { success: false, error: '삭제 대상 클래스를 찾지 못했습니다.' }, { status: 404 });
      }

      return json(request, env, {
        success: true,
        message: '클래스가 영구 삭제되었습니다.',
        data: { id: classId },
      });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[API /admin/classes/:id] Error:', error);
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
