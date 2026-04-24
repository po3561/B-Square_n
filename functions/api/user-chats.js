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

function serializeUtcTimestamp(value) {
  const text = trimText(value);
  if (!text) return text;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    return `${text.replace(' ', 'T')}Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    return `${text}Z`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  const text = trimText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeStringList(value) {
  return Array.from(new Set(parseJsonArray(value).map((item) => trimText(item)).filter(Boolean)));
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

function buildSqlPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

async function attachDmTargetMetadata(db, rows, currentUserId) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const dmRows = normalizedRows.filter((row) => trimText(row?.type).toLowerCase() === 'dm' && trimText(row?.room_id));
  if (!dmRows.length) return normalizedRows;

  const roomIds = Array.from(new Set(dmRows.map((row) => trimText(row.room_id)).filter(Boolean)));
  if (!roomIds.length) return normalizedRows;

  const roomPlaceholders = buildSqlPlaceholders(roomIds.length);
  const peerQuery = `
    SELECT room_id, user_id AS target_id, class_name AS stored_target_name, class_image AS stored_target_avatar
    FROM user_chats
    WHERE type = 'dm'
      AND room_id IN (${roomPlaceholders})
      AND user_id != ?
  `;
  const { results: peerRows = [] } = await db.prepare(peerQuery).bind(...roomIds, currentUserId).all();
  const peerByRoomId = new Map((peerRows || []).map((row) => [trimText(row?.room_id), row]));

  const targetIds = Array.from(new Set((peerRows || []).map((row) => trimText(row?.target_id)).filter(Boolean)));
  let userById = new Map();
  if (targetIds.length) {
    const userPlaceholders = buildSqlPlaceholders(targetIds.length);
    const { results: userRows = [] } = await db.prepare(`
      SELECT id, email, name, username, profile_image_url
      FROM users
      WHERE id IN (${userPlaceholders})
    `).bind(...targetIds).all();
    userById = new Map((userRows || []).map((row) => [trimText(row?.id), row]));
  }

  return normalizedRows.map((row) => {
    if (trimText(row?.type).toLowerCase() !== 'dm') return row;

    const roomId = trimText(row?.room_id);
    const peer = peerByRoomId.get(roomId);
    const targetId = trimText(peer?.target_id);
    const targetUser = userById.get(targetId);
    const targetName = trimText(
      targetUser?.name
      || targetUser?.username
      || row?.target_name
      || row?.class_name
      || peer?.stored_target_name
      || 'User'
    );
    const targetAvatar = trimText(
      targetUser?.profile_image_url
      || row?.target_avatar
      || row?.class_image
      || peer?.stored_target_avatar
      || ''
    );

    return {
      ...row,
      target_id: targetId,
      target_user_id: targetId,
      target_email: trimText(targetUser?.email),
      target_name: targetName,
      target_avatar: targetAvatar,
    };
  });
}

async function loadUserChatPreferences(db, userId) {
  const user = await db.prepare(`
    SELECT chat_folders_json
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first();

  return {
    folders: normalizeStringList(user?.chat_folders_json),
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
  is_pinned,
  is_muted,
  folder_name,
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

    const [{ results }, chatPreferences] = await Promise.all([
      env.DB.prepare(query).bind(...binds).all(),
      loadUserChatPreferences(env.DB, targetUserId),
    ]);
    const rows = results || [];
    const hasMore = rows.length > limit;
    const slicedRows = hasMore ? rows.slice(0, limit) : rows;
    const hydratedRows = await attachDmTargetMetadata(env.DB, slicedRows, targetUserId);
    const data = hydratedRows.map((row) => ({
      ...row,
      last_message_at: serializeUtcTimestamp(row?.last_message_at),
    }));
    return json(request, env, {
      success: true,
      data,
      meta: {
        ...buildPageMeta(limit, offset, data.length, hasMore),
        chat_preferences: chatPreferences,
      },
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

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureUserChatsSchema(env.DB);

  try {
    const body = await request.json();
    const targetUserId = trimText(body?.user_id || auth.user.id);
    const roomId = trimText(body?.room_id);
    const type = trimText(body?.type).toLowerCase();
    const hasUnreadCount = Object.prototype.hasOwnProperty.call(body || {}, 'unread_count');
    const hasPinnedState = Object.prototype.hasOwnProperty.call(body || {}, 'is_pinned');
    const hasMutedState = Object.prototype.hasOwnProperty.call(body || {}, 'is_muted');
    const hasFolderName = Object.prototype.hasOwnProperty.call(body || {}, 'folder_name');
    const hasFolders = Object.prototype.hasOwnProperty.call(body || {}, 'folders');
    const wantsRoomUpdate = hasUnreadCount || hasPinnedState || hasMutedState || hasFolderName;

    if (!wantsRoomUpdate && !hasFolders) {
      return json(
        request,
        env,
        { success: false, error: 'unread_count, is_pinned, is_muted, folder_name, or folders is required' },
        { status: 400 },
      );
    }

    if (wantsRoomUpdate && !roomId) {
      return json(request, env, { success: false, error: 'room_id is required' }, { status: 400 });
    }

    if (targetUserId !== auth.user.id && !isAtLeastRole(auth.user.role, 'admin')) {
      return json(request, env, { success: false, error: 'Permission denied' }, { status: 403 });
    }

    const normalizedFolders = hasFolders ? normalizeStringList(body.folders) : null;
    let chatPreferences = null;
    if (hasFolders) {
      const userUpdate = await env.DB.prepare(`
        UPDATE users
        SET chat_folders_json = ?
        WHERE id = ?
      `).bind(JSON.stringify(normalizedFolders), targetUserId).run();

      if ((userUpdate.meta?.changes || 0) === 0 && !wantsRoomUpdate) {
        return json(request, env, { success: false, error: 'User not found' }, { status: 404 });
      }

      chatPreferences = { folders: normalizedFolders };
    }

    let updated = null;
    if (wantsRoomUpdate) {
      const assignments = [];
      const binds = [];

      if (hasUnreadCount) {
        assignments.push('unread_count = ?');
        binds.push(Math.max(Number.parseInt(body.unread_count, 10) || 0, 0));
      }
      if (hasPinnedState) {
        assignments.push('is_pinned = ?');
        binds.push(isTruthyFlag(body.is_pinned) ? 1 : 0);
      }
      if (hasMutedState) {
        assignments.push('is_muted = ?');
        binds.push(isTruthyFlag(body.is_muted) ? 1 : 0);
      }
      if (hasFolderName) {
        assignments.push('folder_name = ?');
        binds.push(trimText(body.folder_name) || null);
      }

      let query = `UPDATE user_chats SET ${assignments.join(', ')} WHERE user_id = ? AND room_id = ?`;
      binds.push(targetUserId, roomId);

      if (type) {
        query += ' AND type = ?';
        binds.push(type);
      }

      const result = await env.DB.prepare(query).bind(...binds).run();
      if ((result.meta?.changes || 0) === 0) {
        return json(request, env, { success: false, error: 'Chat not found' }, { status: 404 });
      }

      updated = await env.DB.prepare(`
        SELECT ${USER_CHAT_COLUMNS}
        FROM user_chats
        WHERE user_id = ? AND room_id = ?
        LIMIT 1
      `).bind(targetUserId, roomId).first();
    }

    if (!chatPreferences) {
      chatPreferences = await loadUserChatPreferences(env.DB, targetUserId);
    }

    return json(request, env, {
      success: true,
      data: updated || null,
      meta: {
        chat_preferences: chatPreferences,
      },
    });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to update chat', detail: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
