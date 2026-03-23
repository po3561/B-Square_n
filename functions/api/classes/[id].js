import { ensureClassBookmarksSchema } from '../_lib/class_support.js';
import { ensureClassesSchema, ensureReviewsSchema, ensureClassStatsSchema } from '../_lib/schema.js';

async function bumpClassVisit(db, classId) {
  await db.prepare(`
    INSERT INTO class_stats (class_id, total_visits, updated_at)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(class_id) DO UPDATE SET
      total_visits = COALESCE(total_visits, 0) + 1,
      updated_at = datetime('now')
  `).bind(classId).run();
}

function safeParseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function onRequest(context) {
  const { env, params } = context;
  const db = env.DB;
  const classId = params.id;

  if (!classId) {
    return Response.json({ success: false, error: 'class_id is required' }, { status: 400 });
  }

  try {
    await ensureClassesSchema(db);
    await ensureReviewsSchema(db);
    await ensureClassStatsSchema(db);
    await ensureClassBookmarksSchema(db);

    const classData = await db
      .prepare(`
        SELECT
          c.*,
          c.creator_id AS instructor_id,
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
        LEFT JOIN users u ON c.creator_id = u.id
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        WHERE c.id = ?
      `)
      .bind(classId)
      .first();

    if (!classData) {
      return Response.json({ success: false, error: 'Class not found' }, { status: 404 });
    }

    await bumpClassVisit(db, classId);

    const reviewStats = await db
      .prepare('SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE class_id = ?')
      .bind(classId)
      .first();

    let enrollmentCount = { count: 0 };
    try {
      const enrollResult = await db
        .prepare('SELECT COUNT(*) AS count FROM enrollments WHERE class_id = ?')
        .bind(classId)
        .first();
      enrollmentCount = enrollResult || { count: 0 };
    } catch (error) {
      console.warn('[API /classes/:id] enrollment stats failed:', error.message);
    }

    let chatCount = 0;
    let dailyChatAvg = 0;
    try {
      const chatResult = await db
        .prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE class_id = ?')
        .bind(classId)
        .first();
      chatCount = chatResult?.count || 0;

      if (classData.created_at) {
        const createdDate = new Date(classData.created_at);
        const now = new Date();
        const diffDays = Math.max(1, Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
        dailyChatAvg = Number((chatCount / diffDays).toFixed(1));
      }
    } catch (error) {
      console.warn('[API /classes/:id] chat stats failed:', error.message);
    }

    const result = {
      ...classData,
      avg_rating: reviewStats?.avg_rating ? Number(reviewStats.avg_rating).toFixed(1) : Number(classData.avg_rating || 0).toFixed(1),
      review_count: reviewStats?.review_count || classData.review_count || 0,
      enrollment_count: enrollmentCount?.count || 0,
      daily_chat_avg: dailyChatAvg,
      image_urls: safeParseJSON(classData.image_urls, []),
      curriculum: safeParseJSON(classData.curriculum, []),
      sub_instructors: safeParseJSON(classData.sub_instructors, []),
      target_audience: safeParseJSON(classData.target_audience, []),
      objectives: safeParseJSON(classData.objectives, []),
      bookmark_count: Number(classData.bookmark_count || 0),
      like_count: Number(classData.bookmark_count || 0),
      total_visits: Number(classData.total_visits || 0) + 1,
    };

    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error('[API /classes/:id] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
