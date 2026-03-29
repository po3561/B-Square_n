import { isAtLeastRole, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureGroupChatsSchema, ensureUserChatsSchema } from './_lib/schema.js';

// GET /api/group-chats?group_id=xxx — 특정 그룹 정보 조회
// GET /api/group-chats?user_id=xxx — 사용자가 속한 그룹 목록
export async function onRequestGet(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const group_id = url.searchParams.get('group_id');
    const user_id = url.searchParams.get('user_id') || auth.user.id;

    try {
        await ensureGroupChatsSchema(env.DB);

        if (group_id) {
            const data = await env.DB.prepare('SELECT * FROM group_chats WHERE group_id = ?').bind(group_id).first();
            if (!data) return json(request, env, { success: false, error: '그룹을 찾을 수 없습니다.' }, { status: 404 });
            data.members = safeParseJSON(data.members, []);
            if (!data.members.includes(auth.user.id) && !isAtLeastRole(auth.user.role, 'admin')) {
                return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
            }
            return json(request, env, { success: true, data });
        }

        if (user_id) {
            if (user_id !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
                return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
            }
            const { results } = await env.DB.prepare(
                "SELECT * FROM group_chats WHERE members LIKE ? ORDER BY created_at DESC"
            ).bind(`%${user_id}%`).all();
            results.forEach(r => r.members = safeParseJSON(r.members, []));
            return json(request, env, { success: true, data: results });
        }

        return json(request, env, { success: false, error: 'group_id 또는 user_id 필요' }, { status: 400 });
    } catch (err) {
        return json(request, env, { success: false, error: '그룹 조회 오류', detail: err.message }, { status: 500 });
    }
}

// POST /api/group-chats — 새 그룹 생성
export async function onRequestPost(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    try {
        await ensureGroupChatsSchema(env.DB);
        await ensureUserChatsSchema(env.DB);

        const body = await request.json();
        const { name, members } = body;
        const created_by = auth.user.id;

        if (!name) {
            return json(request, env, { success: false, error: '그룹 이름과 생성자 필수' }, { status: 400 });
        }

        const group_id = 'grp_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        const membersList = Array.isArray(members) ? members : [created_by];
        if (!membersList.includes(created_by)) membersList.push(created_by);

        await env.DB.prepare(
            'INSERT INTO group_chats (group_id, name, members, created_by) VALUES (?, ?, ?, ?)'
        ).bind(group_id, name, JSON.stringify(membersList), created_by).run();

        // 각 멤버의 user_chats에 추가
        for (const memberId of membersList) {
            await env.DB.prepare(
                'INSERT OR IGNORE INTO user_chats (user_id, room_id, type, group_name) VALUES (?, ?, ?, ?)'
            ).bind(memberId, group_id, 'group', name).run();
        }

        return json(request, env, { success: true, data: { group_id } }, { status: 201 });
    } catch (err) {
        return json(request, env, { success: false, error: '그룹 생성 오류', detail: err.message }, { status: 500 });
    }
}

// PATCH /api/group-chats — 그룹 정보 수정 (멤버 추가/제거, 이름 변경 등)
export async function onRequestPatch(context) {
    const { request, env } = context;
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    try {
        await ensureGroupChatsSchema(env.DB);
        await ensureUserChatsSchema(env.DB);

        const body = await request.json();
        const { group_id, name, add_member, remove_member } = body;
        if (!group_id) return json(request, env, { success: false, error: 'group_id 필요' }, { status: 400 });

        const group = await env.DB.prepare('SELECT * FROM group_chats WHERE group_id = ?').bind(group_id).first();
        if (!group) return json(request, env, { success: false, error: '그룹 없음' }, { status: 404 });

        let members = safeParseJSON(group.members, []);
        if (!members.includes(auth.user.id) && !isAtLeastRole(auth.user.role, 'admin')) {
            return json(request, env, { success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
        }

        if (add_member && !members.includes(add_member)) {
            members.push(add_member);
            await env.DB.prepare('INSERT OR IGNORE INTO user_chats (user_id, room_id, type, group_name) VALUES (?, ?, ?, ?)').bind(add_member, group_id, 'group', group.name).run();
        }
        if (remove_member) {
            members = members.filter(m => m !== remove_member);
            await env.DB.prepare('DELETE FROM user_chats WHERE user_id = ? AND room_id = ?').bind(remove_member, group_id).run();
        }

        const updates = [];
        const binds = [];
        if (name) { updates.push('name = ?'); binds.push(name); }
        updates.push('members = ?'); binds.push(JSON.stringify(members));
        binds.push(group_id);

        await env.DB.prepare(`UPDATE group_chats SET ${updates.join(', ')} WHERE group_id = ?`).bind(...binds).run();

        return json(request, env, { success: true });
    } catch (err) {
        return json(request, env, { success: false, error: '그룹 수정 오류', detail: err.message }, { status: 500 });
    }
}

export async function onRequestOptions(context) {
    return options(context.request, context.env);
}

function safeParseJSON(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); }
    catch { return fallback; }
}
