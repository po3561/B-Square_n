// functions/api/contacts.js — 연락처 CRUD API
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// GET /api/contacts?user_id=xxx — 사용자의 연락처 목록
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');

    if (!user_id) {
        return new Response(JSON.stringify({ success: false, error: 'user_id 필요' }), { status: 400, headers: cors });
    }

    try {
        const { results } = await env.DB.prepare(
            'SELECT c.*, u.name as real_name, u.profile_image_url FROM contacts c LEFT JOIN users u ON c.target_user_id = u.id WHERE c.user_id = ? AND c.status = ? ORDER BY c.added_at DESC'
        ).bind(user_id, 'active').all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '연락처 조회 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// POST /api/contacts — 연락처 추가
export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const body = await request.json();
        const { user_id, target_user_id, name, avatar, source_class_id, memo } = body;

        if (!user_id || !target_user_id) {
            return new Response(JSON.stringify({ success: false, error: 'user_id, target_user_id 필요' }), { status: 400, headers: cors });
        }

        // 이미 존재하는지 확인
        const existing = await env.DB.prepare(
            'SELECT * FROM contacts WHERE user_id = ? AND target_user_id = ?'
        ).bind(user_id, target_user_id).first();

        if (existing) {
            // 차단 해제 등
            await env.DB.prepare(
                'UPDATE contacts SET status = ?, name = COALESCE(?, name), memo = COALESCE(?, memo) WHERE user_id = ? AND target_user_id = ?'
            ).bind('active', name, memo, user_id, target_user_id).run();
            return new Response(JSON.stringify({ success: true, message: '연락처 업데이트됨' }), { headers: cors });
        }

        await env.DB.prepare(
            'INSERT INTO contacts (user_id, target_user_id, name, avatar, source_class_id, memo) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(user_id, target_user_id, name || null, avatar || null, source_class_id || null, memo || null).run();

        return new Response(JSON.stringify({ success: true }), { status: 201, headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '연락처 추가 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// PATCH /api/contacts — 연락처 수정 (차단, 메모 등)
export async function onRequestPatch(context) {
    const { request, env } = context;
    try {
        const body = await request.json();
        const { user_id, target_user_id, status, memo, name } = body;

        if (!user_id || !target_user_id) {
            return new Response(JSON.stringify({ success: false, error: 'user_id, target_user_id 필요' }), { status: 400, headers: cors });
        }

        const updates = [];
        const binds = [];
        if (status !== undefined) { updates.push('status = ?'); binds.push(status); }
        if (memo !== undefined) { updates.push('memo = ?'); binds.push(memo); }
        if (name !== undefined) { updates.push('name = ?'); binds.push(name); }

        if (updates.length === 0) {
            return new Response(JSON.stringify({ success: false, error: '수정할 항목 없음' }), { status: 400, headers: cors });
        }

        binds.push(user_id, target_user_id);
        await env.DB.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE user_id = ? AND target_user_id = ?`).bind(...binds).run();

        return new Response(JSON.stringify({ success: true }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '연락처 수정 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

// DELETE /api/contacts — 연락처 삭제
export async function onRequestDelete(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const target_user_id = url.searchParams.get('target_user_id');

    if (!user_id || !target_user_id) {
        return new Response(JSON.stringify({ success: false, error: 'user_id, target_user_id 필요' }), { status: 400, headers: cors });
    }

    try {
        await env.DB.prepare('DELETE FROM contacts WHERE user_id = ? AND target_user_id = ?').bind(user_id, target_user_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '연락처 삭제 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    } });
}
