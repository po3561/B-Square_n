// functions/api/dm.js — DM 메시지 CRUD API (1:1 채팅)
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// GET /api/dm?room_id=xxx — 특정 DM 방의 메시지 목록
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const room_id = url.searchParams.get('room_id');
    const limit = parseInt(url.searchParams.get('limit')) || 100;

    if (!room_id) {
        return new Response(JSON.stringify({ success: false, error: 'room_id 필요' }), { status: 400, headers: cors });
    }

    try {
        const { results } = await env.DB.prepare(
            'SELECT * FROM dm WHERE room_id = ? ORDER BY timestamp ASC LIMIT ?'
        ).bind(room_id, limit).all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'DM 조회 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// POST /api/dm — DM 메시지 전송
export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const body = await request.json();
        const { room_id, sender_id, text, image_url } = body;

        if (!room_id || !sender_id || !text) {
            return new Response(JSON.stringify({ success: false, error: '필수 항목 누락 (room_id, sender_id, text)' }), { status: 400, headers: cors });
        }

        const push_key = 'dm_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

        await env.DB.prepare(
            'INSERT INTO dm (push_key, room_id, sender_id, text, image_url) VALUES (?, ?, ?, ?, ?)'
        ).bind(push_key, room_id, sender_id, text, image_url || null).run();

        // user_chats에 last_message 업데이트
        await env.DB.prepare(
            'UPDATE user_chats SET last_message = ?, last_message_at = CURRENT_TIMESTAMP WHERE room_id = ?'
        ).bind(text.substring(0, 100), room_id).run();

        return new Response(JSON.stringify({ success: true, data: { push_key } }), { status: 201, headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'DM 전송 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    } });
}
