import { requireAdmin, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const noticeId = url.searchParams.get('id');

  try {
    if (noticeId) {
      const notice = await env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(noticeId).first();
      if (!notice) return json(request, env, { success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });

      const likeCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?').bind(noticeId).first();
      const { results: comments } = await env.DB.prepare('SELECT * FROM notice_comments WHERE notice_id = ? ORDER BY created_at ASC').bind(noticeId).all();

      return json(request, env, {
        success: true,
        data: { ...notice, like_count: likeCount?.cnt || 0, comments: comments || [] }
      });
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM notices WHERE is_hidden = 0 ORDER BY CASE WHEN type = "important" THEN 0 ELSE 1 END, created_at DESC'
    ).all();

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: '공지 조회 오류' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    if (body.action === 'increment_views' && body.notice_id) {
      await env.DB.prepare('UPDATE notices SET views = views + 1 WHERE id = ?').bind(body.notice_id).run();
      return json(request, env, { success: true });
    }

    if (body.action === 'toggle_like' && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;
      const existing = await env.DB.prepare('SELECT * FROM notice_likes WHERE notice_id = ? AND user_id = ?').bind(body.notice_id, auth.user.id).first();
      if (existing) {
        await env.DB.prepare('DELETE FROM notice_likes WHERE notice_id = ? AND user_id = ?').bind(body.notice_id, auth.user.id).run();
      } else {
        await env.DB.prepare('INSERT INTO notice_likes (notice_id, user_id) VALUES (?, ?)').bind(body.notice_id, auth.user.id).run();
      }
      const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?').bind(body.notice_id).first();
      return json(request, env, { success: true, data: { liked: !existing, count: count?.cnt || 0 } });
    }

    if (body.action === 'add_comment' && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;
      const commentId = 'cmt_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare('INSERT INTO notice_comments (id, notice_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?)').bind(commentId, body.notice_id, auth.user.id, auth.user.name || auth.user.username || '사용자', body.content).run();
      return json(request, env, { success: true, data: { id: commentId } }, { status: 201 });
    }

    if (body.title) {
      const auth = await requireAdmin(context);
      if (!auth.ok) return auth.response;
      if (body.id) {
        await env.DB.prepare('UPDATE notices SET title = ?, content = ?, type = ?, is_hidden = ?, updated_at = datetime("now") WHERE id = ?')
          .bind(body.title, body.content || '', body.type || 'normal', body.is_hidden ? 1 : 0, body.id)
          .run();
        return json(request, env, { success: true, message: 'Updated' });
      } else {
        const id = 'ntc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
        await env.DB.prepare('INSERT INTO notices (id, title, content, type, author_name) VALUES (?, ?, ?, ?, ?)').bind(id, body.title, body.content || '', body.type || 'normal', auth.user.name || '관리자').run();
        return json(request, env, { success: true, data: { id } }, { status: 201 });
      }
    }

    return json(request, env, { success: false, error: '요청 형식 오류' }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: '공지 처리 오류', detail: err.message }, { status: 500 });
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
    await env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM notice_likes WHERE notice_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM notice_comments WHERE notice_id = ?').bind(id).run();
    return json(request, env, { success: true, message: 'Deleted' });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
