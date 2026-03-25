import { requireAdmin, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureBoardCompatSchema, normalizeNotice } from './_lib/board_compat.js';

const LIST_RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
};

function toTextId(value) {
  return String(value || '').trim();
}

function parseIncludeHidden(url) {
  const raw = toTextId(url.searchParams.get('include_hidden'));
  return raw === '1' || raw.toLowerCase() === 'true';
}

function uniqueStrings(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const v = toTextId(item);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function buildOrEquals(column, count) {
  return Array.from({ length: count }, () => `${column} = ?`).join(' OR ');
}

async function findNoticeRow(db, idOrPushKey) {
  const key = toTextId(idOrPushKey);
  if (!key) return null;
  return await db.prepare('SELECT * FROM notices WHERE id = ? OR push_key = ?').bind(key, key).first();
}

function normalizeNoticeComment(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.id || row.push_key || null;
  return {
    ...row,
    id,
    push_key: row.push_key || id || null,
    notice_id: row.notice_id || null,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const noticeId = url.searchParams.get('id');
  const includeHidden = parseIncludeHidden(url);

  try {
    await ensureBoardCompatSchema(env.DB);

    if (noticeId) {
      const notice = await findNoticeRow(env.DB, noticeId);
      if (!notice) {
        return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
      }

      if (Number(notice.is_hidden || 0) === 1 && !includeHidden) {
        return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
      }

      if (includeHidden) {
        const auth = await requireAdmin(context);
        if (!auth.ok) return auth.response;
      }

      const noticeKeys = uniqueStrings([notice.id, notice.push_key, noticeId]);
      const likesWhere = buildOrEquals('notice_id', noticeKeys.length);
      const commentsWhere = buildOrEquals('notice_id', noticeKeys.length);

      const [likeCount, commentsResult] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as cnt FROM notice_likes WHERE ${likesWhere}`).bind(...noticeKeys).first(),
        env.DB.prepare(`SELECT * FROM notice_comments WHERE ${commentsWhere} ORDER BY created_at ASC`).bind(...noticeKeys).all(),
      ]);

      return json(request, env, {
        success: true,
        data: {
          ...normalizeNotice(notice),
          like_count: likeCount?.cnt || 0,
          comments: Array.isArray(commentsResult?.results)
            ? commentsResult.results.map((comment) => normalizeNoticeComment(comment)).filter(Boolean)
            : [],
        },
      });
    }

    if (includeHidden) {
      const auth = await requireAdmin(context);
      if (!auth.ok) return auth.response;

      const { results } = await env.DB.prepare(
        'SELECT * FROM notices ORDER BY CASE WHEN type = \"important\" THEN 0 ELSE 1 END, created_at DESC'
      ).all();

      return json(
        request,
        env,
        {
          success: true,
          data: Array.isArray(results) ? results.map((row) => normalizeNotice(row)).filter(Boolean) : [],
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM notices WHERE is_hidden = 0 ORDER BY CASE WHEN type = "important" THEN 0 ELSE 1 END, created_at DESC'
    ).all();

    return json(
      request,
      env,
      {
        success: true,
        data: Array.isArray(results) ? results.map((row) => normalizeNotice(row)).filter(Boolean) : [],
      },
      { headers: LIST_RESPONSE_HEADERS },
    );
  } catch (err) {
    return json(request, env, { success: false, error: '공지 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureBoardCompatSchema(env.DB);
    const body = await request.json();

    if (body.action === 'increment_views' && body.notice_id) {
      const notice = await findNoticeRow(env.DB, body.notice_id);
      if (!notice) {
        return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
      }

      await env.DB.prepare(
        'UPDATE notices SET views = COALESCE(views, 0) + 1, updated_at = datetime(\"now\") WHERE id = ? OR push_key = ?'
      )
        .bind(notice.id || body.notice_id, notice.push_key || body.notice_id)
        .run();
      return json(request, env, { success: true });
    }

    if (body.action === 'toggle_like' && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;

      const notice = await findNoticeRow(env.DB, body.notice_id);
      if (!notice) {
        return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
      }

      const noticeKeys = uniqueStrings([notice.id, notice.push_key, body.notice_id]);
      const where = buildOrEquals('notice_id', noticeKeys.length);

      const existing = await env.DB.prepare(
        `SELECT notice_id FROM notice_likes WHERE user_id = ? AND (${where}) LIMIT 1`
      ).bind(auth.user.id, ...noticeKeys).first();

      if (existing) {
        await env.DB.prepare(`DELETE FROM notice_likes WHERE user_id = ? AND (${where})`)
          .bind(auth.user.id, ...noticeKeys)
          .run();
      } else {
        // Clean up any legacy like row first, then write to canonical id.
        await env.DB.prepare(`DELETE FROM notice_likes WHERE user_id = ? AND (${where})`)
          .bind(auth.user.id, ...noticeKeys)
          .run();
        await env.DB.prepare('INSERT INTO notice_likes (notice_id, user_id, value) VALUES (?, ?, 1)')
          .bind(notice.id || notice.push_key || body.notice_id, auth.user.id)
          .run();
      }

      const count = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM notice_likes WHERE ${where}`)
        .bind(...noticeKeys)
        .first();

      return json(request, env, { success: true, data: { liked: !existing, count: count?.cnt || 0 } });
    }

    if (body.action === 'add_comment' && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;

      const notice = await findNoticeRow(env.DB, body.notice_id);
      if (!notice) {
        return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
      }

      const commentId = 'cmt_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare(`
        INSERT INTO notice_comments (id, push_key, notice_id, user_id, user_name, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        commentId,
        commentId,
        notice.id || notice.push_key || body.notice_id,
        auth.user.id,
        auth.user.name || auth.user.username || '사용자',
        body.content || '',
      ).run();

      return json(request, env, { success: true, data: { id: commentId } }, { status: 201 });
    }

    if (body.title) {
      const auth = await requireAdmin(context);
      if (!auth.ok) return auth.response;

      const noticeId = toTextId(body.id || body.push_key || '');
      if (noticeId) {
        const result = await env.DB.prepare(`
          UPDATE notices
          SET title = ?, content = ?, type = ?, is_hidden = ?, updated_at = datetime("now"),
              push_key = COALESCE(push_key, id)
          WHERE id = ? OR push_key = ?
        `)
          .bind(body.title, body.content || '', body.type || 'normal', body.is_hidden ? 1 : 0, noticeId, noticeId)
          .run();

        if (result?.meta?.changes === 0) {
          return json(request, env, { success: false, error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
        }
        return json(request, env, { success: true, message: 'Updated' });
      }

      const newId = 'ntc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare(`
        INSERT INTO notices (id, push_key, title, content, type, author_name, views, is_hidden)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(
        newId,
        newId,
        body.title,
        body.content || '',
        body.type || 'normal',
        auth.user.name || '관리자',
        body.is_hidden ? 1 : 0,
      ).run();

      return json(request, env, { success: true, data: { id: newId } }, { status: 201 });
    }

    return json(request, env, { success: false, error: '잘못된 요청입니다.' }, { status: 400 });
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
    await ensureBoardCompatSchema(env.DB);
    const notice = await findNoticeRow(env.DB, id);
    const targetId = notice?.id || toTextId(id);
    const targetPushKey = notice?.push_key || toTextId(id);

    await env.DB.prepare('DELETE FROM notices WHERE id = ? OR push_key = ?').bind(targetId, targetPushKey).run();
    await env.DB.prepare('DELETE FROM notice_likes WHERE notice_id = ? OR notice_id = ?').bind(targetId, targetPushKey).run();
    await env.DB.prepare('DELETE FROM notice_comments WHERE notice_id = ? OR notice_id = ?').bind(targetId, targetPushKey).run();
    return json(request, env, { success: true, message: 'Deleted' });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
