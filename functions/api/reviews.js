import { requireClassManager, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureClassesSchema } from './_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  if (!class_id) return json(request, env, { success: false, error: 'class_id 필요' }, { status: 400 });

  try {
    await ensureClassesSchema(env.DB);

    const { results } = await env.DB.prepare(
      'SELECT * FROM reviews WHERE class_id = ? ORDER BY created_at DESC'
    ).bind(class_id).all();

    const avg = results.length > 0 ? (results.reduce((sum, r) => sum + (r.rating || 5), 0) / results.length).toFixed(1) : null;

    return json(request, env, { success: true, data: results, summary: { count: results.length, avg_rating: avg } });
  } catch (err) {
    return json(request, env, { success: false, error: '리뷰 조회 오류' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureClassesSchema(env.DB);

    const body = await request.json();

    if (body.action === 'reply' && body.review_id && body.reply) {
      const review = await env.DB.prepare('SELECT class_id FROM reviews WHERE push_key = ?').bind(body.review_id).first();
      if (!review) {
        return json(request, env, { success: false, error: '리뷰를 찾을 수 없습니다.' }, { status: 404 });
      }
      const classAuth = await requireClassManager(context, review.class_id);
      if (!classAuth.ok) return classAuth.response;
      await env.DB.prepare('UPDATE reviews SET instructor_reply = ? WHERE push_key = ?').bind(body.reply, body.review_id).run();
      return json(request, env, { success: true });
    }

    const { class_id, user_name, rating, content } = body;
    if (!class_id || !content) {
      return json(request, env, { success: false, error: '필수 항목 누락' }, { status: 400 });
    }

    const push_key = 'rv_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    await env.DB.prepare(
      'INSERT INTO reviews (push_key, class_id, user_id, user_name, rating, content) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(push_key, class_id, auth.user.id, user_name || auth.user.name || auth.user.username || '수강생', rating || 5, content).run();

    return json(request, env, { success: true, data: { id: push_key } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: '리뷰 처리 오류' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
