import { requireClassManager, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureClassesSchema } from './_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');
  const class_id = url.searchParams.get('class_id');
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureClassesSchema(env.DB);

  try {
    if (user_id && class_id) {
      if (auth.user.id !== user_id && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
      }
      const enrollment = await env.DB.prepare(
        'SELECT * FROM enrollments WHERE user_id = ? AND class_id = ?'
      ).bind(user_id, class_id).first();

      return json(request, env, {
        success: true,
        data: { enrolled: !!enrollment, enrollment }
      });
    }

    if (class_id && !user_id) {
      const classAuth = await requireClassManager(context, class_id);
      if (!classAuth.ok) return classAuth.response;

      const { results } = await env.DB.prepare(`
        SELECT e.*, u.name, u.username, u.profile_image_url, u.phone, u.role, u.email
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.class_id = ?
        ORDER BY e.enrolled_at ASC
      `).bind(class_id).all();

      return json(request, env, { success: true, data: { enrollments: results } });
    }

    if (user_id) {
      if (auth.user.id !== user_id && auth.user.role !== 'admin') {
        return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
      }
      const { results } = await env.DB.prepare(`
        SELECT e.*, c.title, c.category, c.image_url, c.creator_id AS instructor_id
        FROM enrollments e
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC
      `).bind(user_id).all();

      return json(request, env, { success: true, data: { enrollments: results } });
    }

    return json(request, env, { success: false, error: 'user_id 파라미터가 필요합니다.' }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: '수강 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    console.log('[API] Enrollment Request:', body);
    const { class_id, payment_method, pay_method, amount_paid, amount, coupon_id } = body;

    const finalUserId = auth.user.id;
    const finalClassId = class_id;
    const finalPayMethod = pay_method || payment_method || 'free';
    const finalAmount = amount || amount_paid || 0;

    if (!finalUserId || !finalClassId) {
      return json(request, env, { success: false, error: '사용자 ID와 클래스 ID가 모두 필요합니다.' }, { status: 400 });
    }

    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(finalUserId).first();
    if (!user) {
      return json(request, env, {
        success: false,
        error: '존재하지 않는 사용자입니다.',
        detail: `ID: ${finalUserId} 사용자를 찾을 수 없습니다. 다시 로그인해 주세요.`
      }, { status: 404 });
    }

    const targetClass = await env.DB.prepare('SELECT id FROM classes WHERE id = ?').bind(finalClassId).first();
    if (!targetClass) {
      return json(request, env, { success: false, error: '존재하지 않는 클래스입니다.' }, { status: 404 });
    }

    const existing = await env.DB.prepare(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND class_id = ?'
    ).bind(finalUserId, finalClassId).first();

    if (existing) {
      return json(request, env, { success: false, error: '이미 수강 등록된 클래스입니다.' }, { status: 409 });
    }

    await env.DB.prepare(`
      INSERT INTO enrollments (user_id, class_id, pay_method, amount, applied_coupon, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(finalUserId, finalClassId, finalPayMethod, finalAmount, coupon_id || null).run();

    if (coupon_id) {
      await env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE coupon_code = ? AND class_id = ?')
        .bind(coupon_id, finalClassId).run();
    }

    console.log(`[API] Enrollment Success: User ${finalUserId} -> Class ${finalClassId}`);
    return json(request, env, { success: true, data: { user_id: finalUserId, class_id: finalClassId } }, { status: 201 });

  } catch (err) {
    console.error('[API] Enrollment Error:', err);
    return json(request, env, {
      success: false,
      error: '수강 등록 처리 중 서버 오류가 발생했습니다.',
      detail: err.message
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
