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
        ORDER BY e.enrolled_at ASC
      `).bind(class_id).all();

      return new Response(JSON.stringify({ success: true, data: { enrollments: results } }), { headers: cors });
    }

    // 유저의 전체 수강 목록
    if (user_id) {
      const { results } = await env.DB.prepare(`
        SELECT e.*, c.title, c.category, c.image_url, c.creator_id
        FROM enrollments e
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC
      `).bind(user_id).all();

      return new Response(JSON.stringify({ success: true, data: { enrollments: results } }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: 'user_id 파라미터가 필요합니다.' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '수강 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  try {
    const body = await request.json();
    console.log('[API] Enrollment Request:', body);
    const { user_id, class_id, payment_method, pay_method, amount_paid, amount, coupon_id } = body;

    const finalUserId = user_id;
    const finalClassId = class_id;
    const finalPayMethod = pay_method || payment_method || 'free';
    const finalAmount = amount || amount_paid || 0;

    if (!finalUserId || !finalClassId) {
      return new Response(JSON.stringify({ success: false, error: '사용자 ID와 클래스 ID가 모두 필요합니다.' }), { status: 400, headers: cors });
    }

    // 1. 유저 존재 확인 (FK 제약 조건 오류 방지)
    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(finalUserId).first();
    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '존재하지 않는 사용자입니다.', 
        detail: `ID: ${finalUserId} 사용자를 찾을 수 없습니다. 다시 로그인해 주세요.` 
      }), { status: 404, headers: cors });
    }

    // 2. 클래스 존재 확인
    const targetClass = await env.DB.prepare('SELECT id FROM classes WHERE id = ?').bind(finalClassId).first();
    if (!targetClass) {
      return new Response(JSON.stringify({ success: false, error: '존재하지 않는 클래스입니다.' }), { status: 404, headers: cors });
    }

    // 3. 중복 수강 체크
    const existing = await env.DB.prepare(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND class_id = ?'
    ).bind(finalUserId, finalClassId).first();

    if (existing) {
      return new Response(JSON.stringify({ success: false, error: '이미 수강 등록된 클래스입니다.' }), { status: 409, headers: cors });
    }

    // 4. 수강 등록 실행
    await env.DB.prepare(`
      INSERT INTO enrollments (user_id, class_id, pay_method, amount, applied_coupon, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(finalUserId, finalClassId, finalPayMethod, finalAmount, coupon_id || null).run();

    // 5. 쿠폰 사용 처리
    if (coupon_id) {
      await env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE coupon_code = ? AND class_id = ?')
        .bind(coupon_id, finalClassId).run();
    }

    console.log(`[API] Enrollment Success: User ${finalUserId} -> Class ${finalClassId}`);
    return new Response(JSON.stringify({ success: true, data: { user_id: finalUserId, class_id: finalClassId } }), { status: 201, headers: cors });

  } catch (err) {
    console.error('[API] Enrollment Error:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: '수강 등록 처리 중 서버 오류가 발생했습니다.', 
      detail: err.message 
    }), { status: 500, headers: cors });
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
