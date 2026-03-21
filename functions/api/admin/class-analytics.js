// functions/api/admin/class-analytics.js — 클래스 분석 API
// GET /api/admin/class-analytics?type=ranking|category|detail&classId=&top=10

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (method !== 'GET') return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'ranking';
  const top = parseInt(url.searchParams.get('top')) || 10;
  const classId = url.searchParams.get('classId') || '';

  try {
    // 인기 클래스 랭킹
    if (type === 'ranking') {
      const { results } = await db.prepare(`
        SELECT 
          c.id, c.title, c.category, c.thumbnail, c.price, c.instructor_name, c.created_at,
          c.current_participants,
          COALESCE(cs.total_visits, 0) as visits,
          COALESCE(cs.total_enrollments, 0) as enrollments,
          COALESCE(cs.total_revenue, 0) as revenue,
          COALESCE(cs.avg_rating, 0) as avg_rating,
          COALESCE(cs.review_count, 0) as review_count,
          COALESCE(cs.bookmark_count, 0) as bookmarks,
          COALESCE(cs.total_passes_issued, 0) as passes_issued,
          COALESCE(cs.total_passes_used, 0) as passes_used,
          COALESCE(cs.total_gatherings, 0) as gatherings
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        ORDER BY COALESCE(cs.total_enrollments, c.current_participants, 0) DESC
        LIMIT ?
      `).bind(top).all();

      return new Response(JSON.stringify({
        success: true,
        data: results || [],
        top
      }), { headers: CORS });
    }

    // 카테고리별 분석
    if (type === 'category') {
      const { results } = await db.prepare(`
        SELECT 
          COALESCE(c.category, '미분류') as category,
          COUNT(*) as class_count,
          COALESCE(SUM(cs.total_visits), 0) as total_visits,
          COALESCE(SUM(cs.total_enrollments), SUM(c.current_participants), 0) as total_enrollments,
          COALESCE(SUM(cs.total_revenue), 0) as total_revenue
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        GROUP BY COALESCE(c.category, '미분류')
        ORDER BY total_enrollments DESC
      `).all();

      return new Response(JSON.stringify({ success: true, data: results || [] }), { headers: CORS });
    }

    // 개별 클래스 상세
    if (type === 'detail' && classId) {
      const cls = await db.prepare(`
        SELECT c.*, cs.*
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        WHERE c.id = ?
      `).bind(classId).first();

      // 강사 정보 
      let instructor = null;
      if (cls?.creator_id) {
        instructor = await db.prepare('SELECT id, name, email, phone, profile_image_url, role FROM users WHERE id = ?').bind(cls.creator_id).first();
      }

      // 최근 주문
      const { results: orders } = await db.prepare('SELECT * FROM orders WHERE class_id = ? ORDER BY created_at DESC LIMIT 10').bind(classId).all().catch(() => ({ results: [] }));

      // 수강생 목록
      const { results: participants } = await db.prepare(`
        SELECT cp.*, u.name, u.email, u.phone, u.profile_image_url
        FROM class_participants cp
        LEFT JOIN users u ON cp.user_id = u.id
        WHERE cp.class_id = ?
      `).bind(classId).all().catch(() => ({ results: [] }));

      // 모임 목록
      const { results: gatherings } = await db.prepare('SELECT * FROM class_gatherings WHERE class_id = ? ORDER BY gathering_at DESC').bind(classId).all().catch(() => ({ results: [] }));

      return new Response(JSON.stringify({
        success: true,
        data: {
          class: cls,
          instructor,
          recent_orders: orders || [],
          participants: participants || [],
          gatherings: gatherings || []
        }
      }), { headers: CORS });
    }

    // 전체 요약
    const summary = await db.prepare(`
      SELECT 
        COUNT(*) as total_classes,
        COALESCE(SUM(current_participants), 0) as total_students,
        COUNT(CASE WHEN is_approved = 1 THEN 1 END) as active_classes,
        COUNT(CASE WHEN is_free = 1 THEN 1 END) as free_classes
      FROM classes
    `).first();

    const instructors = await db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.profile_image_url, COUNT(c.id) as class_count
      FROM users u
      LEFT JOIN classes c ON u.id = c.creator_id
      WHERE u.role = 'instructor'
      GROUP BY u.id
      ORDER BY class_count DESC
    `).all().catch(() => ({ results: [] }));

    return new Response(JSON.stringify({
      success: true,
      data: {
        summary: summary || {},
        instructors: instructors?.results || []
      }
    }), { headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
