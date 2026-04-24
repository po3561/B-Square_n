import { requireSession } from '../_lib/auth.js';
import { createCorsHeaders, json, options } from '../_lib/http.js';
import { ensureDmMessagesSchema, ensureUserChatsSchema } from '../_lib/schema.js';

function getPathParts(params) {
  if (Array.isArray(params.path)) return params.path;
  if (typeof params.path === 'string') return params.path.split('/').filter(Boolean);
  return [];
}

function parseReactions(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function trimText(value) {
  return String(value ?? '').trim();
}

async function readJsonObject(request) {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function toSQLiteTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

async function ensureRoomAccess(context, auth, roomId, roomType) {
  const { env, request } = context;
  const userId = String(auth.user.id || '').trim();
  const normalizedRoomId = trimText(roomId);
  const normalizedRoomType = trimText(roomType || 'dm').toLowerCase() || 'dm';
  const role = String(auth.user.role || '').trim().toLowerCase();
  const privilegedRoles = ['operator', 'admin', 'super_admin', 'super-admin', 'superadmin', 'root', 'owner', 'manager', 'operator_admin', 'ops'];

  if (!normalizedRoomId) {
    return {
      ok: false,
      response: json(request, env, { success: false, error: 'room_id is required' }, { status: 400 }),
    };
  }

  if (privilegedRoles.includes(role)) {
    return { ok: true, roomType: normalizedRoomType };
  }

  const membership = await env.DB.prepare(`
    SELECT 1
    FROM user_chats
    WHERE user_id = ? AND room_id = ? AND type = ?
    LIMIT 1
  `).bind(userId, normalizedRoomId, normalizedRoomType).first().catch(() => null);

  if (membership) {
    return { ok: true, roomType: normalizedRoomType };
  }

  if (normalizedRoomType === 'class') {
    const participant = await env.DB.prepare(`
      SELECT 1
      FROM class_participants
      WHERE class_id = ? AND user_id = ?
      LIMIT 1
    `).bind(normalizedRoomId, userId).first().catch((error) => {
      const message = String(error?.message || '');
      if (/no such table/i.test(message)) return null;
      throw error;
    });

    if (participant) {
      return { ok: true, roomType: normalizedRoomType };
    }
  }

  return {
    ok: false,
    response: json(request, env, { success: false, error: '채팅방 접근 권한이 필요합니다.' }, { status: 403 }),
  };
}

function normalizeMessage(row) {
  if (!row) return null;
  return {
    ...row,
    content: row.content || row.message || '',
    message: row.content || row.message || '',
    text: row.content || row.message || '',
    file_data: row.image_url ?? row.file_data ?? null,
    reactions: parseReactions(row.reactions),
  };
}

async function refreshRoomPreviewIfLatest(env, roomId, roomType, messageId, previewText) {
  const normalizedRoomId = trimText(roomId);
  const normalizedRoomType = trimText(roomType || 'dm').toLowerCase() || 'dm';
  const normalizedMessageId = trimText(messageId);
  if (!normalizedRoomId || !normalizedMessageId) return;

  const latest = await env.DB.prepare(`
    SELECT id
    FROM dm_messages
    WHERE room_id = ? AND room_type = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).bind(normalizedRoomId, normalizedRoomType).first().catch(() => null);

  if (!latest || String(latest.id) !== normalizedMessageId) return;

  const nextPreview = trimText(previewText || '').substring(0, 100) || 'attachment';
  await env.DB.prepare(`
    UPDATE user_chats
    SET last_message = ?
    WHERE room_id = ? AND type = ?
  `).bind(nextPreview, normalizedRoomId, normalizedRoomType).run().catch(() => null);
}

function buildSinceClause(since) {
  if (!since) {
    return { sql: '', bind: null, orderSql: 'ORDER BY created_at ASC, id ASC' };
  }

  const numeric = Number(since);
  if (!Number.isFinite(numeric)) {
    return { sql: '', bind: null, orderSql: 'ORDER BY created_at ASC, id ASC' };
  }

  const timestamp = toSQLiteTimestamp(numeric);
  if (!timestamp) {
    return { sql: '', bind: null, orderSql: 'ORDER BY created_at ASC, id ASC' };
  }

  return {
    sql: ' AND updated_at > ?',
    bind: timestamp,
    orderSql: 'ORDER BY updated_at ASC, id ASC',
  };
}

function buildDmMessageSelect(whereSql = '', orderSql = '', limitSql = '') {
  return `
    SELECT ${DM_MESSAGE_COLUMNS}
    FROM dm_messages
    WHERE room_id = ?
      AND room_type = ?${whereSql}
    ${orderSql}
    ${limitSql}
  `;
}

function buildLatestDmMessageSelect(limitSql = '') {
  return `
    SELECT ${DM_MESSAGE_COLUMNS}
    FROM (
      SELECT ${DM_MESSAGE_COLUMNS}
      FROM dm_messages
      WHERE room_id = ?
        AND room_type = ?
      ORDER BY created_at DESC, id DESC
      ${limitSql}
    ) AS latest_messages
    ORDER BY created_at ASC, id ASC
  `;
}

const DM_MESSAGE_COLUMNS = `
  id,
  room_id,
  room_type,
  class_id,
  sender_id,
  user_name,
  user_avatar,
  content,
  message,
  type,
  reply_to,
  reply_text,
  reply_user,
  image_url,
  file_name,
  file_size,
  gather_title,
  gather_time,
  gather_place,
  min_capacity,
  max_capacity,
  current_count,
  status,
  is_edited,
  is_pinned,
  reactions,
  created_at,
  updated_at
`;

async function streamMessages(context, roomId, roomType, initialSince) {
  const { env, request } = context;
  const encoder = new TextEncoder();
  let since = initialSince || '0';
  let cancelled = false;
  const abort = () => { cancelled = true; };

  if (request?.signal?.aborted) {
    cancelled = true;
  }

  try {
    request?.signal?.addEventListener('abort', abort, { once: true });
  } catch {}

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      while (!cancelled) {
        const sinceClause = buildSinceClause(since);
        let query = `
          SELECT ${DM_MESSAGE_COLUMNS}
          FROM dm_messages
          WHERE room_id = ?
            AND room_type = ?
        `;
        const binds = [roomId, roomType];

        if (sinceClause.sql) {
          query += sinceClause.sql;
          binds.push(sinceClause.bind);
        }

        query += ` ${sinceClause.orderSql} LIMIT 100`;

        try {
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          for (const row of results || []) {
            since = String((new Date(row.updated_at || row.created_at).getTime()) || row.id);
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(normalizeMessage(row))}\n\n`));
          }
          controller.enqueue(encoder.encode(`event: ping\ndata: {"ts":${Date.now()}}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`));
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      try {
        controller.close();
      } catch {}
    },
    cancel() {
      abort();
    },
  });

  return new Response(stream, {
    headers: createCorsHeaders(request, env, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    }),
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await Promise.all([
    ensureDmMessagesSchema(env.DB),
    ensureUserChatsSchema(env.DB),
  ]);

  const pathParts = getPathParts(params);
  const roomId = pathParts[0];
  const resource = pathParts[1];
  const subResource = pathParts[2];
  const extra = pathParts[3];

  if (!roomId || resource !== 'messages') {
    return json(request, env, { success: false, error: 'Invalid DM route' }, { status: 400 });
  }

  const url = new URL(request.url);
  const roomType = (trimText(url.searchParams.get('room_type')) || 'dm').toLowerCase();
  const pinnedOnly = ['1', 'true', 'yes'].includes((url.searchParams.get('pinned_only') || '').toLowerCase());
  const wantsStream = isTruthyFlag(url.searchParams.get('stream'));

  const access = await ensureRoomAccess(context, auth, roomId, roomType);
  if (!access.ok) return access.response;

  try {
    if (request.method === 'GET' && (subResource === 'stream' || wantsStream)) {
      const since = url.searchParams.get('since') || '0';
      return streamMessages(context, roomId, access.roomType, since);
    }

    if (request.method === 'GET') {
      const since = url.searchParams.get('since') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 50, 100);
      const sinceClause = buildSinceClause(since);
      const binds = [roomId, roomType];
      let query = '';

      if (pinnedOnly) {
        query = buildDmMessageSelect(' AND is_pinned = 1', 'ORDER BY updated_at DESC, id DESC', 'LIMIT ?');
      } else if (sinceClause.sql) {
        query = buildDmMessageSelect(sinceClause.sql, sinceClause.orderSql, 'LIMIT ?');
        binds.push(sinceClause.bind);
      } else {
        query = buildLatestDmMessageSelect('LIMIT ?');
      }

      binds.push(limit + 1);

      const { results } = await env.DB.prepare(query).bind(...binds).all();
      const rows = (results || []).map(normalizeMessage);
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      return json(request, env, {
        success: true,
        data,
        meta: {
          limit,
          count: data.length,
          has_more: hasMore,
        },
      });
    }

    if (request.method === 'POST' && subResource && extra === 'reaction') {
      const messageId = subResource;
      const body = await readJsonObject(request);
      const emoji = String(body.emoji || '').trim();

      if (!emoji) {
        return json(request, env, { success: false, error: 'emoji is required' }, { status: 400 });
      }

      const message = await env.DB.prepare('SELECT reactions FROM dm_messages WHERE id = ? AND room_id = ? AND room_type = ?')
        .bind(messageId, roomId, access.roomType)
        .first();
      if (!message) {
        return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
      }

      let reactions = {};
      try {
        reactions = message.reactions ? JSON.parse(message.reactions) : {};
      } catch {
        reactions = {};
      }

      reactions[emoji] = reactions[emoji] || [];
      if (reactions[emoji].includes(auth.user.id)) {
        reactions[emoji] = reactions[emoji].filter((id) => id !== auth.user.id);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(auth.user.id);
      }

      await env.DB.prepare(`
        UPDATE dm_messages
        SET reactions = ?, updated_at = datetime('now')
        WHERE id = ? AND room_id = ? AND room_type = ?
      `).bind(JSON.stringify(reactions), messageId, roomId, access.roomType).run();

      const updated = await env.DB.prepare(`SELECT ${DM_MESSAGE_COLUMNS} FROM dm_messages WHERE id = ? AND room_id = ? AND room_type = ?`)
        .bind(messageId, roomId, access.roomType)
        .first();
      if (!updated) {
        return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
      }

      return json(request, env, { success: true, data: { ...normalizeMessage(updated), reactions } });
    }

    if (request.method === 'POST') {
      const body = await readJsonObject(request);
      const content = trimText(body.content || body.message || body.text || '');
      const resolvedRoomType = (trimText(body.room_type) || access.roomType).toLowerCase();
      const resolvedClassId = resolvedRoomType === 'class' ? roomId : (trimText(body.class_id) || null);
      const attachmentUrl = trimText(body.image_url || body.file_data || '') || null;

      if (!content && !attachmentUrl && body.type !== 'gathering_card') {
        return json(request, env, { success: false, error: 'message or attachment is required' }, { status: 400 });
      }

      const insertResult = await env.DB.prepare(`
        INSERT INTO dm_messages (
          room_id, room_type, class_id, sender_id, user_name, user_avatar,
          content, message, type, reply_to, reply_text, reply_user,
          image_url, file_name, file_size,
          gather_title, gather_time, gather_place, min_capacity, max_capacity, current_count, status,
          is_pinned, reactions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        roomId,
        resolvedRoomType,
        resolvedClassId,
        auth.user.id,
        trimText(body.user_name) || trimText(auth.user.name) || trimText(auth.user.username) || 'User',
        trimText(body.user_avatar) || trimText(auth.user.profile_image_url) || '',
        content,
        content,
        trimText(body.type) || 'text',
        trimText(body.reply_to) || null,
        trimText(body.reply_text) || null,
        trimText(body.reply_user) || null,
        attachmentUrl,
        trimText(body.file_name) || null,
        Number.isFinite(Number(body.file_size)) ? Number(body.file_size) : null,
        trimText(body.gather_title) || null,
        trimText(body.gather_time) || null,
        trimText(body.gather_place) || null,
        Number.isFinite(Number(body.min_capacity)) ? Number(body.min_capacity) : null,
        Number.isFinite(Number(body.max_capacity)) ? Number(body.max_capacity) : null,
        Number.isFinite(Number(body.current_count)) ? Number(body.current_count) : 0,
        trimText(body.status) || null,
        isTruthyFlag(body.is_pinned) ? 1 : 0,
        typeof body.reactions === 'string' ? body.reactions : JSON.stringify(body.reactions || {}),
      ).run();

      const insertedId = insertResult?.meta?.last_row_id ?? null;
      let inserted = null;
      if (insertedId != null) {
        inserted = await env.DB.prepare(`
          SELECT ${DM_MESSAGE_COLUMNS}
          FROM dm_messages
          WHERE id = ?
        `).bind(insertedId).first();
      }
      if (!inserted) {
        inserted = await env.DB.prepare(`
          SELECT ${DM_MESSAGE_COLUMNS}
          FROM dm_messages
          WHERE room_id = ? AND room_type = ?
          ORDER BY id DESC
          LIMIT 1
        `).bind(roomId, resolvedRoomType).first();
      }
      if (!inserted) {
        return json(request, env, { success: false, error: 'Failed to create message' }, { status: 500 });
      }

      await env.DB.prepare(`
        UPDATE user_chats
        SET last_message = ?, last_message_at = datetime('now'),
            unread_count = CASE
              WHEN user_id = ? THEN 0
              ELSE COALESCE(unread_count, 0) + 1
            END
        WHERE room_id = ?
      `).bind((content || body.file_name || 'attachment').substring(0, 100), auth.user.id, roomId).run().catch(() => null);

      const responseData = normalizeMessage(inserted);
      if (body.client_id) responseData.client_id = String(body.client_id);

      return json(request, env, { success: true, data: responseData }, { status: 201 });
    }

    if (request.method === 'PATCH' && subResource) {
      const body = await readJsonObject(request);
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const hasContent = content.length > 0;
      const hasPinState = body.is_pinned !== undefined;

      if (!hasContent && !hasPinState) {
        return json(request, env, { success: false, error: 'content or is_pinned is required' }, { status: 400 });
      }

      if (hasContent) {
        await env.DB.prepare(`
          UPDATE dm_messages
          SET content = ?, message = ?, is_edited = 1, updated_at = datetime('now')
          WHERE id = ? AND room_id = ? AND room_type = ? AND sender_id = ?
        `).bind(content, content, subResource, roomId, access.roomType, auth.user.id).run();
      }

      if (hasPinState) {
        await env.DB.prepare(`
          UPDATE dm_messages
          SET is_pinned = ?, updated_at = datetime('now')
          WHERE id = ? AND room_id = ? AND room_type = ?
        `).bind(isTruthyFlag(body.is_pinned) ? 1 : 0, subResource, roomId, access.roomType).run();
      }

      const updated = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ? AND room_id = ? AND room_type = ?
      `).bind(subResource, roomId, access.roomType).first();
      if (!updated) {
        return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
      }

      if (hasContent) {
        await refreshRoomPreviewIfLatest(env, roomId, access.roomType, subResource, content);
      }

      return json(request, env, { success: true, data: normalizeMessage(updated) });
    }

    if (request.method === 'DELETE' && subResource) {
      const existing = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ? AND room_id = ? AND room_type = ?
      `).bind(subResource, roomId, access.roomType).first();
      if (!existing) {
        return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
      }

      const isOwner = String(existing.sender_id) === String(auth.user.id);
      const privilegedRoles = ['operator', 'admin', 'super_admin', 'super-admin', 'superadmin', 'root', 'owner', 'manager', 'operator_admin', 'ops'];
      if (!isOwner && !privilegedRoles.includes(String(auth.user.role || '').trim().toLowerCase())) {
        return json(request, env, { success: false, error: 'Permission denied' }, { status: 403 });
      }

      const deletedText = '메시지가 삭제되었습니다.';
      await env.DB.prepare(`
        UPDATE dm_messages
        SET content = ?, message = ?, type = 'deleted',
            reply_to = NULL, reply_text = NULL, reply_user = NULL,
            image_url = NULL, file_name = NULL, file_size = NULL, file_data = NULL,
            gather_title = NULL, gather_time = NULL, gather_place = NULL,
            min_capacity = NULL, max_capacity = NULL, current_count = 0, status = NULL,
            is_edited = 1, is_pinned = 0, reactions = '{}', updated_at = datetime('now')
        WHERE id = ? AND room_id = ? AND room_type = ?
      `).bind(deletedText, deletedText, subResource, roomId, access.roomType).run();

      const updated = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ? AND room_id = ? AND room_type = ?
      `).bind(subResource, roomId, access.roomType).first();

      await refreshRoomPreviewIfLatest(env, roomId, access.roomType, subResource, deletedText);

      return json(request, env, { success: true, data: updated ? normalizeMessage(updated) : null });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: 'Failed to process DM request',
      detail: error.message,
    }, { status: 500 });
  }
}
