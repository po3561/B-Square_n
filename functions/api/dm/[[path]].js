// Catch-all for /api/dm/[room_id]/messages
// Handles: GET /api/dm/{room_id}/messages?since=X
//          POST /api/dm/{room_id}/messages

export async function onRequest(context) {
  const { request, env, params } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const pathParts = params.path || [];
  const room_id = pathParts[0];

  if (!room_id) {
    return new Response(JSON.stringify({ success: false, error: 'room_id 필요' }), { status: 400, headers: cors });
  }

  try {
    // DM 테이블 자동 생성
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS dm_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        user_name TEXT DEFAULT '',
        user_avatar TEXT DEFAULT '',
        content TEXT,
        message TEXT,
        type TEXT DEFAULT 'text',
        reply_to TEXT,
        reply_text TEXT,
        reply_user TEXT,
        is_edited INTEGER DEFAULT 0,
        is_pinned INTEGER DEFAULT 0,
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const since = url.searchParams.get('since') || '0';
      const limit = parseInt(url.searchParams.get('limit')) || 100;

      let results;
      if (since === '0' || since === '') {
        ({ results } = await env.DB.prepare(
          'SELECT * FROM dm_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ?'
        ).bind(room_id, limit).all());
      } else {
        ({ results } = await env.DB.prepare(
          'SELECT * FROM dm_messages WHERE room_id = ? AND id > ? ORDER BY created_at ASC LIMIT ?'
        ).bind(room_id, parseInt(since), limit).all());
      }

      // content/message 통합 — 프론트에서 content 또는 message 사용
      const normalized = (results || []).map(r => ({
        ...r,
        content: r.content || r.message || '',
        message: r.content || r.message || '',
        text: r.content || r.message || ''
      }));

      return new Response(JSON.stringify({ success: true, data: normalized }), { headers: cors });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      // 프론트엔드 호환: content, message, text 어느 것이든 받음
      const messageText = body.content || body.message || body.text || '';
      const sender_id = body.sender_id || '';
      const user_name = body.user_name || '';
      const user_avatar = body.user_avatar || '';
      const type = body.type || 'text';
      const reply_to = body.reply_to || null;
      const reply_text = body.reply_text || null;
      const reply_user = body.reply_user || null;
      const image_url = body.image_url || null;

      if (!sender_id || !messageText) {
        return new Response(JSON.stringify({ success: false, error: 'sender_id, message 필수' }), { status: 400, headers: cors });
      }

      await env.DB.prepare(
        'INSERT INTO dm_messages (room_id, sender_id, user_name, user_avatar, content, message, type, reply_to, reply_text, reply_user, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(room_id, sender_id, user_name, user_avatar, messageText, messageText, type, reply_to, reply_text, reply_user, image_url).run();

      // user_chats 업데이트
      try {
        await env.DB.prepare(
          'UPDATE user_chats SET last_message = ?, last_message_at = datetime(\'now\') WHERE room_id = ?'
        ).bind(messageText.substring(0, 100), room_id).run();
      } catch(e) {}

      return new Response(JSON.stringify({ success: true, message: '전송 완료' }), { status: 201, headers: cors });
    }

    if (request.method === 'PATCH') {
      // 메시지 수정
      const msgId = pathParts[2]; // /api/dm/{room_id}/messages/{msg_id}
      const body = await request.json();
      const newContent = body.content || body.message || '';

      if (msgId && newContent) {
        await env.DB.prepare(
          'UPDATE dm_messages SET content = ?, message = ?, is_edited = 1 WHERE id = ? AND room_id = ?'
        ).bind(newContent, newContent, msgId, room_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      return new Response(JSON.stringify({ success: false, error: 'msg_id, content 필수' }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: '지원하지 않는 메서드' }), { status: 405, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'DM 오류', detail: err.message }), { status: 500, headers: cors });
  }
}
