// GET /api/notices — 공지 목록
// POST /api/notices — 공지 작성 (관리자)
// PUT /api/notices/views — 조회수 증가
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const noticeId = url.searchParams.get('id');

  try {
    // 단일 공지 조회
    if (noticeId) {
      const notice = await env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(noticeId).first();
      if (!notice) return new Response(JSON.stringify({ success: false, error: '공지를 찾을 수 없습니다.' }), { status: 404, headers: cors });

      // 좋아요 수
      const likeCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?').bind(noticeId).first();
      // 댓글
      const { results: comments } = await env.DB.prepare('SELECT * FROM notice_comments WHERE notice_id = ? ORDER BY created_at ASC').bind(noticeId).all();

      return new Response(JSON.stringify({
        success: true,
        data: { ...notice, like_count: likeCount?.cnt || 0, comments: comments || [] }
      }), { headers: cors });
    }

    // 전체 목록
    const { results } = await env.DB.prepare(
      'SELECT * FROM notices WHERE is_hidden = 0 ORDER BY CASE WHEN type = "important" THEN 0 ELSE 1 END, created_at DESC'
    ).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '공지 조회 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();

    // 조회수 증가 요청
    if (body.action === 'increment_views' && body.notice_id) {
      await env.DB.prepare('UPDATE notices SET views = views + 1 WHERE id = ?').bind(body.notice_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    }

    // 좋아요 토글
    if (body.action === 'toggle_like' && body.notice_id && body.user_id) {
      const existing = await env.DB.prepare('SELECT * FROM notice_likes WHERE notice_id = ? AND user_id = ?').bind(body.notice_id, body.user_id).first();
      if (existing) {
        await env.DB.prepare('DELETE FROM notice_likes WHERE notice_id = ? AND user_id = ?').bind(body.notice_id, body.user_id).run();
      } else {
        await env.DB.prepare('INSERT INTO notice_likes (notice_id, user_id) VALUES (?, ?)').bind(body.notice_id, body.user_id).run();
      }
      const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?').bind(body.notice_id).first();
      return new Response(JSON.stringify({ success: true, data: { liked: !existing, count: count?.cnt || 0 } }), { headers: cors });
    }

    // 댓글 작성
    if (body.action === 'add_comment' && body.notice_id && body.user_id) {
      const commentId = 'cmt_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare('INSERT INTO notice_comments (id, notice_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?)').bind(commentId, body.notice_id, body.user_id, body.user_name || '사용자', body.content).run();
      return new Response(JSON.stringify({ success: true, data: { id: commentId } }), { status: 201, headers: cors });
    }

    // 공지 생성
    if (body.title) {
      const id = 'ntc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      await env.DB.prepare('INSERT INTO notices (id, title, content, type, author_name) VALUES (?, ?, ?, ?, ?)').bind(id, body.title, body.content || '', body.type || 'normal', body.author_name || '관리자').run();
      return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: '요청 형식 오류' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '공지 처리 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
