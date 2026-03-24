import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureUserChatsSchema } from './_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id') || auth.user.id;
  const type = url.searchParams.get('type');

  if (user_id !== auth.user.id && auth.user.role !== 'admin') {
    return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  try {
    await ensureUserChatsSchema(env.DB);

    let query = 'SELECT * FROM user_chats WHERE user_id = ?';
    const binds = [user_id];

    if (type) {
      query += ' AND type = ?';
      binds.push(type);
    }

    query += ' ORDER BY last_message_at DESC';

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: '채팅방 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureUserChatsSchema(env.DB);

    const body = await request.json();
    const {
      type,
      room_id,
      target_user_id,
      target_name,
      target_avatar,
      class_name,
      class_image,
      class_category,
      group_name,
      is_instructor,
    } = body;

    const user_id = auth.user.id;

    if (type === 'class') {
      const classRoomId = room_id || target_user_id;
      if (!classRoomId) {
        return json(request, env, { success: false, error: 'room_id가 필요합니다.' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO user_chats (
          user_id, room_id, type, class_name, class_image, class_category, is_instructor
        ) VALUES (?, ?, 'class', ?, ?, ?, ?)
      `).bind(
        user_id,
        classRoomId,
        class_name || target_name || '클래스',
        class_image || target_avatar || '',
        class_category || '',
        is_instructor ? 1 : 0
      ).run();

      return json(request, env, { success: true, data: { room_id: classRoomId } }, { status: 201 });
    }

    if (type === 'group') {
      if (!room_id) {
        return json(request, env, { success: false, error: 'room_id가 필요합니다.' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO user_chats (
          user_id, room_id, type, group_name
        ) VALUES (?, ?, 'group', ?)
      `).bind(user_id, room_id, group_name || target_name || '그룹').run();

      return json(request, env, { success: true, data: { room_id } }, { status: 201 });
    }

    if (!target_user_id) {
      return json(request, env, { success: false, error: 'target_user_id가 필요합니다.' }, { status: 400 });
    }

    const ids = [String(user_id), String(target_user_id)].sort();
    const dmRoomId = `dm_${ids.join('_')}`;

    const [targetUser, myUser] = await Promise.all([
      env.DB.prepare('SELECT id, name, profile_image_url FROM users WHERE id = ?').bind(target_user_id).first(),
      env.DB.prepare('SELECT id, name, profile_image_url FROM users WHERE id = ?').bind(user_id).first(),
    ]);

    if (!myUser) {
      return json(request, env, { success: false, error: '내 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!targetUser) {
      return json(request, env, { success: false, error: '대화 상대를 찾을 수 없습니다.' }, { status: 404 });
    }

    const existing = await env.DB.prepare(
      'SELECT 1 FROM user_chats WHERE user_id = ? AND room_id = ?'
    ).bind(user_id, dmRoomId).first();

    if (existing) {
      return json(request, env, {
        success: true,
        data: { room_id: dmRoomId },
        message: '이미 존재하는 채팅방입니다.',
      });
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      user_id,
      dmRoomId,
      'dm',
      target_name || targetUser.name || '사용자',
      target_avatar || targetUser.profile_image_url || ''
    ).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      target_user_id,
      dmRoomId,
      'dm',
      myUser.name || '사용자',
      myUser.profile_image_url || ''
    ).run();

    return json(request, env, { success: true, data: { room_id: dmRoomId } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: 'DM 방 생성 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id') || auth.user.id;
  const room_id = url.searchParams.get('room_id');

  if (!room_id) {
    return json(request, env, { success: false, error: 'room_id가 필요합니다.' }, { status: 400 });
  }

  if (user_id !== auth.user.id && auth.user.role !== 'admin') {
    return json(request, env, { success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
  }

  try {
    await ensureUserChatsSchema(env.DB);
    await env.DB.prepare('DELETE FROM user_chats WHERE user_id = ? AND room_id = ?').bind(user_id, room_id).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: '채팅방 삭제 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
