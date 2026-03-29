import { requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

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

function normalizeMessage(row) {
  return {
    ...row,
    content: row.content || row.message || '',
    message: row.content || row.message || '',
    text: row.content || row.message || '',
    file_data: row.image_url ?? row.file_data ?? null,
    reactions: parseReactions(row.reactions),
  };
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const pathParts = getPathParts(params);
  const roomId = pathParts[0];
  const resource = pathParts[1];
  const subResource = pathParts[2];
  const extra = pathParts[3];

  if (!roomId || resource !== 'messages') {
    return json(request, env, { success: false, error: 'Invalid DM route' }, { status: 400 });
  }

  const url = new URL(request.url);
  const roomType = url.searchParams.get('room_type') || 'dm';
  const pinnedOnly = ['1', 'true', 'yes'].includes((url.searchParams.get('pinned_only') || '').toLowerCase());

  try {
    if (request.method === 'GET' && subResource === 'stream') {
      const since = url.searchParams.get('since') || '0';
      return streamMessages(context, roomId, roomType, since);
    }

    if (request.method === 'GET') {
      const since = url.searchParams.get('since') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 50, 100);
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

      if (pinnedOnly) {
        query += ' AND is_pinned = 1';
        query += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
      } else {
        query += ` ${sinceClause.orderSql} LIMIT ?`;
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
      const body = await request.json();
      const emoji = String(body.emoji || '').trim();

      if (!emoji) {
        return json(request, env, { success: false, error: 'emoji is required' }, { status: 400 });
      }

      const message = await env.DB.prepare('SELECT reactions FROM dm_messages WHERE id = ? AND room_id = ?')
        .bind(messageId, roomId)
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
        WHERE id = ? AND room_id = ?
      `).bind(JSON.stringify(reactions), messageId, roomId).run();

      const updated = await env.DB.prepare(`SELECT ${DM_MESSAGE_COLUMNS} FROM dm_messages WHERE id = ? AND room_id = ?`)
        .bind(messageId, roomId)
        .first();

      return json(request, env, { success: true, data: { ...normalizeMessage(updated), reactions } });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const content = trimText(body.content || body.message || body.text || '');
      const resolvedRoomType = trimText(body.room_type) || roomType;
      const resolvedClassId = resolvedRoomType === 'class' ? roomId : (trimText(body.class_id) || null);
      const attachmentUrl = trimText(body.image_url || body.file_data || '') || null;
      const messageId = 'dm_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

      if (!content && !attachmentUrl && body.type !== 'gathering_card') {
        return json(request, env, { success: false, error: 'message or attachment is required' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO dm_messages (
          id, room_id, room_type, class_id, sender_id, user_name, user_avatar,
          content, message, type, reply_to, reply_text, reply_user,
          image_url, file_name, file_size,
          gather_title, gather_time, gather_place, min_capacity, max_capacity, current_count, status,
          is_pinned, reactions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        messageId,
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

      const inserted = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ?
      `).bind(messageId).first();

      await env.DB.prepare(`
        UPDATE user_chats
        SET last_message = ?, last_message_at = datetime('now')
        WHERE room_id = ?
      `).bind((content || body.file_name || 'attachment').substring(0, 100), roomId).run().catch(() => null);

      const responseData = normalizeMessage(inserted);
      if (body.client_id) responseData.client_id = String(body.client_id);

      return json(request, env, { success: true, data: responseData }, { status: 201 });
    }

    if (request.method === 'PATCH' && subResource) {
      const body = await request.json();
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
          WHERE id = ? AND room_id = ? AND sender_id = ?
        `).bind(content, content, subResource, roomId, auth.user.id).run();
      }

      if (hasPinState) {
        await env.DB.prepare(`
          UPDATE dm_messages
          SET is_pinned = ?, updated_at = datetime('now')
          WHERE id = ? AND room_id = ?
        `).bind(isTruthyFlag(body.is_pinned) ? 1 : 0, subResource, roomId).run();
      }

      const updated = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ? AND room_id = ?
      `).bind(subResource, roomId).first();

      return json(request, env, { success: true, data: normalizeMessage(updated) });
    }

    if (request.method === 'DELETE' && subResource) {
      await env.DB.prepare(`
        DELETE FROM dm_messages
        WHERE id = ? AND room_id = ? AND sender_id = ?
      `).bind(subResource, roomId, auth.user.id).run();

      return json(request, env, { success: true });
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
