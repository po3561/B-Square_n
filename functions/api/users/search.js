import { requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const db = env.DB;
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return json(request, env, { success: true, data: [] });
  }

  try {
    const sql = `
      SELECT id, name, username, email, profile_image_url 
      FROM users 
      WHERE id != ?
        AND (name LIKE ? OR username LIKE ? OR email LIKE ?)
      LIMIT 20
    `;
    const searchTerm = `%${query}%`;
    const { results } = await db.prepare(sql).bind(auth.user.id, searchTerm, searchTerm, searchTerm).all();

    return json(request, env, { success: true, data: results });
  } catch (error) {
    console.error('[API /users/search GET] Error:', error);
    return json(request, env, { success: false, error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
