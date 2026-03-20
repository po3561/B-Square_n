// functions/api/user-chats.js — 사용자의 채팅방 목록 CRUD API
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// GET /api/user-chats?user_id=xxx — 사용자의 모든 채팅방 목록
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const type = url.searchParams.get('type'); // 'dm', 'group', 'class' 필터 (optional)

    if (!user_id) {
        return new Response(JSON.stringify({ success: false, error: 'user_id 필요' }), { status: 400, headers: cors });
    }

    try {
        let query = 'SELECT * FROM user_chats WHERE user_id = ?';
        const binds = [user_id];
        
        if (type) {
            query += ' AND type = ?';
            binds.push(type);
        }

        query += ' ORDER BY last_message_at DESC';

        const { results } = await env.DB.prepare(query).bind(...binds).all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '채팅방 조회 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// POST /api/user-chats — 새 DM 채팅방 생성
export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const body = await request.json();
        const { user_id, target_user_id, target_name, target_avatar } = body;

        if (!user_id || !target_user_id) {
            return new Response(JSON.stringify({ success: false, error: 'user_id, target_user_id 필요' }), { status: 400, headers: cors });
        }

        // room_id 생성 (두 사용자 ID를 정렬하여 고유 ID)
        const ids = [user_id, target_user_id].sort();
        const room_id = 'dm_' + ids.join('_');

        // 이미 존재하는지 확인
        const existing = await env.DB.prepare(
            'SELECT * FROM user_chats WHERE user_id = ? AND room_id = ?'
        ).bind(user_id, room_id).first();

        if (existing) {
            return new Response(JSON.stringify({ success: true, data: { room_id }, message: '이미 존재하는 채팅방' }), { headers: cors });
        }

        // 양쪽 사용자에게 채팅방 추가
        // 상대방 정보 조회
        const targetUser = await env.DB.prepare('SELECT name, profile_image_url FROM users WHERE id = ?').bind(target_user_id).first();
        const myUser = await env.DB.prepare('SELECT name, profile_image_url FROM users WHERE id = ?').bind(user_id).first();

        await env.DB.prepare(
            'INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image) VALUES (?, ?, ?, ?, ?)'
        ).bind(user_id, room_id, 'dm', target_name || targetUser?.name || '사용자', target_avatar || targetUser?.profile_image_url || '').run();

        await env.DB.prepare(
            'INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image) VALUES (?, ?, ?, ?, ?)'
        ).bind(target_user_id, room_id, 'dm', myUser?.name || '사용자', myUser?.profile_image_url || '').run();

        return new Response(JSON.stringify({ success: true, data: { room_id } }), { status: 201, headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'DM 방 생성 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// DELETE /api/user-chats — 채팅방 나가기
export async function onRequestDelete(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const room_id = url.searchParams.get('room_id');

    if (!user_id || !room_id) {
        return new Response(JSON.stringify({ success: false, error: 'user_id, room_id 필요' }), { status: 400, headers: cors });
    }

    try {
        await env.DB.prepare('DELETE FROM user_chats WHERE user_id = ? AND room_id = ?').bind(user_id, room_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '채팅방 삭제 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    } });
}
