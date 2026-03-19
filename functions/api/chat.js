// GET /api/chat — 채팅 메시지 목록
// POST /api/chat — 채팅 메시지 전송
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const after = url.searchParams.get('after'); // 폴링: 마지막 메시지 ID 이후

  if (!class_id) return new Response(JSON.stringify({ success: false, error: 'class_id 필요' }), { status: 400, headers: cors });

  try {
    let results;
    if (after) {
      // 마지막 메시지 이후의 새 메시지만 가져오기 (폴링)
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? AND created_at > (SELECT created_at FROM chat_messages WHERE id = ?) ORDER BY created_at ASC LIMIT ?'
      ).bind(class_id, after, limit).all());
    } else {
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? ORDER BY created_at DESC LIMIT ?'
      ).bind(class_id, limit).all());
      results = results.reverse(); // 최신순 → 시간순
    }

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '채팅 조회 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { class_id, user_id, user_name, user_avatar, message, type } = body;

    if (!class_id || !user_id || !message) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목 누락' }), { status: 400, headers: cors });
    }

    const id = 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    await env.DB.prepare(
      'INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, class_id, user_id, user_name || '사용자', user_avatar || '', message, type || 'text').run();

    return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '메시지 전송 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
