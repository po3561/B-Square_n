import { isAtLeastRole, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureContactsSchema } from './_lib/schema.js';

// GET /api/contacts?user_id=xxx — 사용자의 연락처 목록
export async function onRequestGet(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id') || auth.user.id;

    if (user_id !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
    }

    try {
        await ensureContactsSchema(env.DB);

        const { results } = await env.DB.prepare(
            'SELECT c.*, u.name as real_name, u.profile_image_url FROM contacts c LEFT JOIN users u ON c.target_user_id = u.id WHERE c.user_id = ? AND c.status = ? ORDER BY c.added_at DESC'
        ).bind(user_id, 'active').all();

        return json(request, env, { success: true, data: results });
    } catch (err) {
        return json(request, env, { success: false, error: '연락처 조회 오류', detail: err.message }, { status: 500 });
    }
}

// POST /api/contacts — 연락처 추가
export async function onRequestPost(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    try {
        await ensureContactsSchema(env.DB);

        const body = await request.json();
        const { target_user_id, name, avatar, source_class_id, memo } = body;
        const user_id = auth.user.id;

        if (!target_user_id) {
            return json(request, env, { success: false, error: 'target_user_id 필요' }, { status: 400 });
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
            return json(request, env, { success: true, message: '연락처 업데이트됨' });
        }

        await env.DB.prepare(
            'INSERT INTO contacts (user_id, target_user_id, name, avatar, source_class_id, memo) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(user_id, target_user_id, name || null, avatar || null, source_class_id || null, memo || null).run();

        return json(request, env, { success: true }, { status: 201 });
    } catch (err) {
        return json(request, env, { success: false, error: '연락처 추가 오류', detail: err.message }, { status: 500 });
    }
}

// PATCH /api/contacts — 연락처 수정 (차단, 메모 등)
export async function onRequestPatch(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    try {
        await ensureContactsSchema(env.DB);

        const body = await request.json();
        const { target_user_id, status, memo, name } = body;
        const user_id = auth.user.id;

        if (!target_user_id) {
            return json(request, env, { success: false, error: 'target_user_id 필요' }, { status: 400 });
        }

        const updates = [];
        const binds = [];
        if (status !== undefined) { updates.push('status = ?'); binds.push(status); }
        if (memo !== undefined) { updates.push('memo = ?'); binds.push(memo); }
        if (name !== undefined) { updates.push('name = ?'); binds.push(name); }

        if (updates.length === 0) {
            return json(request, env, { success: false, error: '수정할 항목 없음' }, { status: 400 });
        }

        binds.push(user_id, target_user_id);
        await env.DB.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE user_id = ? AND target_user_id = ?`).bind(...binds).run();

        return json(request, env, { success: true });
    } catch (err) {
        return json(request, env, { success: false, error: '연락처 수정 오류', detail: err.message }, { status: 500 });
    }
}

// DELETE /api/contacts — 연락처 삭제
export async function onRequestDelete(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id') || auth.user.id;
    const target_user_id = url.searchParams.get('target_user_id');

    if (!target_user_id) {
        return json(request, env, { success: false, error: 'target_user_id 필요' }, { status: 400 });
    }

    if (user_id !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
        return json(request, env, { success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    try {
        await ensureContactsSchema(env.DB);

        await env.DB.prepare('DELETE FROM contacts WHERE user_id = ? AND target_user_id = ?').bind(user_id, target_user_id).run();
        return json(request, env, { success: true });
    } catch (err) {
        return json(request, env, { success: false, error: '연락처 삭제 오류', detail: err.message }, { status: 500 });
    }
}

export async function onRequestOptions(context) {
    return options(context.request, context.env);
}
