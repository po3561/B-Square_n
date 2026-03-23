import { requireAdmin } from './_lib/auth.js';
import { json, options } from './_lib/http.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM faqs ORDER BY created_at DESC'
    ).all();

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: 'FAQ 조회 오류' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, question, answer, is_hidden } = body;

    if (!question || !answer) {
      return json(request, env, { success: false, error: 'Question and answer are required' }, { status: 400 });
    }

    if (id) {
      // 수정
      await env.DB.prepare('UPDATE faqs SET question = ?, answer = ?, is_hidden = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(question, answer, is_hidden ? 1 : 0, id)
        .run();
      return json(request, env, { success: true, message: 'Updated' });
    } else {
      const newId = 'faq_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare('INSERT INTO faqs (id, question, answer, is_hidden) VALUES (?, ?, ?, ?)')
        .bind(newId, question, answer, is_hidden ? 1 : 0)
        .run();
      return json(request, env, { success: true, data: { id: newId } }, { status: 201 });
    }
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return json(request, env, { success: false, error: 'ID is required' }, { status: 400 });

  try {
    await env.DB.prepare('DELETE FROM faqs WHERE id = ?').bind(id).run();
    return json(request, env, { success: true, message: 'Deleted' });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
