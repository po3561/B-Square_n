import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const user_id = url.searchParams.get('user_id') || auth.user.id;

  if (user_id !== auth.user.id && auth.user.role !== 'admin') {
    return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM user_passes WHERE user_id = ? AND status = 'active'
    `).bind(user_id).all();

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: '수강권 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
