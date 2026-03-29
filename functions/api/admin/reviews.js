import { json, options } from '../_lib/http.js';
import { refreshClassStats } from '../_lib/class_support.js';
import { ensureAuthSchema, ensureClassesSchema, ensureReviewsSchema } from '../_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  await Promise.all([
    ensureAuthSchema(db),
    ensureClassesSchema(db),
    ensureReviewsSchema(db),
  ]);

  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      const maxRating = normalizeInt(url.searchParams.get('max_rating') || url.searchParams.get('rating_max'), 3);
      const search = normalizeText(url.searchParams.get('search'));

      let sql = `
        SELECT
          r.push_key,
          r.push_key AS id,
          r.push_key AS review_id,
          r.class_id,
          r.user_id,
          r.user_name,
          r.rating,
          r.content,
          r.instructor_reply,
          r.created_at,
          c.title AS class_title,
          c.title AS class_name,
          COALESCE(uc.name, uc.username, c.instructor_name, '-') AS instructor_name,
          COALESCE(uc.name, uc.username, c.instructor_name, '-') AS main_instructor_name,
          COALESCE(uc.name, uc.username, c.instructor_name, '-') AS creator_name,
          COALESCE(uc.name, uc.username, c.instructor_name, '-') AS class_creator_name,
          COALESCE(uc.email, c.instructor_email, c.creator_email, '-') AS instructor_email,
          COALESCE(uc.email, c.instructor_email, c.creator_email, '-') AS main_instructor_email,
          COALESCE(uc.email, c.instructor_email, c.creator_email, '-') AS creator_email,
          COALESCE(uc.email, c.instructor_email, c.creator_email, '-') AS class_creator_email,
          u.name AS member_name,
          u.username AS member_nickname,
          u.phone AS member_phone,
          u.email AS member_email,
          u.name AS name,
          u.username AS nickname,
          u.phone AS phone,
          u.email AS email
        FROM reviews r
        LEFT JOIN classes c
          ON c.id = r.class_id
        LEFT JOIN users uc
          ON uc.id = c.creator_id
        LEFT JOIN users u
          ON u.id = r.user_id
        WHERE COALESCE(r.rating, 0) <= ?
      `;
      const params = [maxRating];

      if (search) {
        const keyword = `%${search}%`;
        sql += `
          AND (
            r.content LIKE ?
            OR r.user_name LIKE ?
            OR c.title LIKE ?
            OR uc.name LIKE ?
            OR uc.username LIKE ?
            OR uc.email LIKE ?
            OR u.name LIKE ?
            OR u.username LIKE ?
            OR u.email LIKE ?
          )
        `;
        params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
      }

      sql += `
        ORDER BY
          COALESCE(r.rating, 0) ASC,
          datetime(r.created_at) DESC
      `;

      const { results } = await db.prepare(sql).bind(...params).all();
      return json(request, env, { success: true, data: results || [] });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const reviewId = normalizeText(url.searchParams.get('review_id') || url.searchParams.get('id'));
      if (!reviewId) {
        return json(request, env, { success: false, error: 'review_id is required.' }, { status: 400 });
      }

      const review = await db.prepare('SELECT class_id FROM reviews WHERE push_key = ?').bind(reviewId).first();
      if (!review) {
        return json(request, env, { success: false, error: 'Review not found.' }, { status: 404 });
      }

      await db.prepare('DELETE FROM reviews WHERE push_key = ?').bind(reviewId).run();
      if (review.class_id) {
        await refreshClassStats(db, review.class_id).catch(() => null);
      }

      return json(request, env, { success: true });
    }
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
