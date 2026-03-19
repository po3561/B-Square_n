// GET /api/enrollments — 수강 목록/확인
// POST /api/enrollments — 수강 등록
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');
  const class_id = url.searchParams.get('class_id');

  try {
    // 특정 클래스 수강 여부 확인
    if (user_id && class_id) {
      const enrollment = await env.DB.prepare(
        'SELECT * FROM enrollments WHERE user_id = ? AND class_id = ?'
      ).bind(user_id, class_id).first();

      return new Response(JSON.stringify({
        success: true,
        data: { enrolled: !!enrollment, enrollment }
      }), { headers: cors });
    }

    // 클래스의 전체 수강생 목록 (강사/운영자용)
    if (class_id && !user_id) {
      const { results } = await env.DB.prepare(`
        SELECT e.*, u.name, u.nickname, u.profile_image_url, u.phone, u.role
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.class_id = ?
        ORDER BY e.created_at ASC
      `).bind(class_id).all();

      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }

    // 유저의 전체 수강 목록
    if (user_id) {
      const { results } = await env.DB.prepare(`
        SELECT e.*, c.title, c.category, c.image_url, c.creator_id
        FROM enrollments e
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.created_at DESC
      `).bind(user_id).all();

      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: 'user_id 파라미터가 필요합니다.' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '수강 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { user_id, class_id, payment_method, amount_paid, coupon_id } = body;

    if (!user_id || !class_id) {
      return new Response(JSON.stringify({ success: false, error: 'user_id와 class_id가 필요합니다.' }), { status: 400, headers: cors });
    }

    // 중복 수강 체크
    const existing = await env.DB.prepare(
      'SELECT id FROM enrollments WHERE user_id = ? AND class_id = ?'
    ).bind(user_id, class_id).first();

    if (existing) {
      return new Response(JSON.stringify({ success: false, error: '이미 수강 등록된 클래스입니다.' }), { status: 409, headers: cors });
    }

    const enrollId = 'enrl_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

    await env.DB.prepare(`
      INSERT INTO enrollments (id, user_id, class_id, payment_method, amount_paid, coupon_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).bind(enrollId, user_id, class_id, payment_method || 'free', amount_paid || 0, coupon_id || null).run();

    // 쿠폰 사용 처리
    if (coupon_id) {
      await env.DB.prepare('UPDATE coupons SET is_used = 1 WHERE id = ?').bind(coupon_id).run();
    }

    return new Response(JSON.stringify({ success: true, data: { id: enrollId } }), { status: 201, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '수강 등록 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
