import { isAtLeastRole, requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureUserChatsSchema } from './_lib/schema.js';

function trimText(value) {
  return String(value ?? '').trim();
}

function parseIntOrDefault(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function buildPageMeta(limit, offset, count, hasMore) {
  return {
    limit,
    offset,
    count,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
}

const USER_CHAT_COLUMNS = `
  user_id,
  room_id,
  type,
  class_name,
  class_image,
  class_category,
  total_enrolled,
  group_name,
  is_instructor,
  unread_count,
  last_message,
  last_message_at
`;

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureUserChatsSchema(env.DB);

  const url = new URL(request.url);
  const targetUserId = trimText(url.searchParams.get('user_id') || auth.user.id);
  const type = trimText(url.searchParams.get('type'));
  const limit = parseIntOrDefault(url.searchParams.get('limit'), 50, 100);
  const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  if (targetUserId !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
    return json(request, env, { success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    let query = `SELECT ${USER_CHAT_COLUMNS} FROM user_chats WHERE user_id = ?`;
    const binds = [targetUserId];

    if (type) {
      query += ' AND type = ?';
      binds.push(type);
    }

    query += ' ORDER BY last_message_at DESC, room_id DESC LIMIT ? OFFSET ?';
    binds.push(limit + 1, offset);

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    const rows = results || [];
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return json(request, env, {
      success: true,
      data,
      meta: buildPageMeta(limit, offset, data.length, hasMore),
    });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to load chats', detail: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureUserChatsSchema(env.DB);

  try {
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
    } = body || {};

    const userId = auth.user.id;

    if (type === 'class') {
      const classRoomId = trimText(room_id || target_user_id);
      if (!classRoomId) {
        return json(request, env, { success: false, error: 'room_id is required' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO user_chats (
          user_id, room_id, type, class_name, class_image, class_category, is_instructor
        ) VALUES (?, ?, 'class', ?, ?, ?, ?)
      `).bind(
        userId,
        classRoomId,
        trimText(class_name) || trimText(target_name) || 'Class',
        trimText(class_image) || trimText(target_avatar) || '',
        trimText(class_category) || '',
        isTruthyFlag(is_instructor) ? 1 : 0,
      ).run();

      return json(request, env, { success: true, data: { room_id: classRoomId } }, { status: 201 });
    }

    if (type === 'group') {
      const groupRoomId = trimText(room_id);
      if (!groupRoomId) {
        return json(request, env, { success: false, error: 'room_id is required' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO user_chats (
          user_id, room_id, type, group_name
        ) VALUES (?, ?, 'group', ?)
      `).bind(userId, groupRoomId, trimText(group_name) || trimText(target_name) || 'Group').run();

      return json(request, env, { success: true, data: { room_id: groupRoomId } }, { status: 201 });
    }

    const resolvedTargetUserId = trimText(target_user_id);
    if (!resolvedTargetUserId) {
      return json(request, env, { success: false, error: 'target_user_id is required' }, { status: 400 });
    }

    const ids = [String(userId), String(resolvedTargetUserId)].sort();
    const dmRoomId = `dm_${ids.join('_')}`;

    const [targetUser, myUser] = await Promise.all([
      env.DB.prepare('SELECT id, name, profile_image_url FROM users WHERE id = ? LIMIT 1').bind(resolvedTargetUserId).first(),
      env.DB.prepare('SELECT id, name, profile_image_url FROM users WHERE id = ? LIMIT 1').bind(userId).first(),
    ]);

    if (!myUser) {
      return json(request, env, { success: false, error: 'Current user not found' }, { status: 404 });
    }

    if (!targetUser) {
      return json(request, env, { success: false, error: 'Target user not found' }, { status: 404 });
    }

    const existing = await env.DB.prepare(
      'SELECT 1 FROM user_chats WHERE user_id = ? AND room_id = ? LIMIT 1'
    ).bind(userId, dmRoomId).first();

    if (existing) {
      return json(request, env, {
        success: true,
        data: { room_id: dmRoomId },
        message: 'Chat room already exists',
      });
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userId,
      dmRoomId,
      'dm',
      trimText(target_name) || trimText(targetUser.name) || 'User',
      trimText(target_avatar) || trimText(targetUser.profile_image_url) || '',
    ).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      resolvedTargetUserId,
      dmRoomId,
      'dm',
      trimText(myUser.name) || 'User',
      trimText(myUser.profile_image_url) || '',
    ).run();

    return json(request, env, { success: true, data: { room_id: dmRoomId } }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to create chat', detail: error.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureUserChatsSchema(env.DB);

  const url = new URL(request.url);
  const targetUserId = trimText(url.searchParams.get('user_id') || auth.user.id);
  const roomId = trimText(url.searchParams.get('room_id'));

  if (!roomId) {
    return json(request, env, { success: false, error: 'room_id is required' }, { status: 400 });
  }

  if (targetUserId !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
    return json(request, env, { success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    const result = await env.DB.prepare('DELETE FROM user_chats WHERE user_id = ? AND room_id = ?').bind(targetUserId, roomId).run();
    if ((result.meta?.changes || 0) === 0) {
      return json(request, env, { success: false, error: 'Chat not found' }, { status: 404 });
    }

    return json(request, env, { success: true });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to delete chat', detail: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
