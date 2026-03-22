import { requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureDmMessagesSchema } from '../_lib/schema.js';

function getPathParts(params) {
  if (Array.isArray(params.path)) return params.path;
  if (typeof params.path === 'string') return params.path.split('/').filter(Boolean);
  return [];
}

function normalizeMessage(row) {
  let reactions = {};
  try {
    reactions = row.reactions ? JSON.parse(row.reactions) : {};
  } catch {}

  return {
    ...row,
    content: row.content || row.message || '',
    message: row.content || row.message || '',
    text: row.content || row.message || '',
    reactions,
  };
}

function buildSinceClause(since) {
  if (!since) {
    return { sql: '', bind: null };
  }

  const numeric = Number(since);
  if (!Number.isFinite(numeric)) {
    return { sql: '', bind: null };
  }

  if (numeric > 9999999999) {
    return {
      sql: " AND (strftime('%s', created_at) * 1000) > ?",
      bind: numeric,
    };
  }

  return {
    sql: ' AND id > ?',
    bind: numeric,
  };
}

async function streamMessages(context, roomId, roomType, initialSince) {
  const { env } = context;
  const encoder = new TextEncoder();
  let since = initialSince || '0';

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      while (true) {
        const sinceClause = buildSinceClause(since);
        let query = `
          SELECT *
          FROM dm_messages
          WHERE room_id = ?
            AND room_type = ?
        `;
        const binds = [roomId, roomType];

        if (sinceClause.sql) {
          query += sinceClause.sql;
          binds.push(sinceClause.bind);
        }

        query += ' ORDER BY id ASC LIMIT 100';

        try {
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          for (const row of results || []) {
            since = String((new Date(row.created_at).getTime()) || row.id);
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(normalizeMessage(row))}\n\n`));
          }
          controller.enqueue(encoder.encode(`event: ping\ndata: {"ts":${Date.now()}}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`));
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
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
    return json(request, env, { success: false, error: '유효하지 않은 DM 경로입니다.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const roomType = url.searchParams.get('room_type') || 'dm';

  try {
    await ensureDmMessagesSchema(env.DB);

    if (request.method === 'GET' && subResource === 'stream') {
      const since = url.searchParams.get('since') || '0';
      return streamMessages(context, roomId, roomType, since);
    }

    if (request.method === 'GET') {
      const since = url.searchParams.get('since') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 200);
      const sinceClause = buildSinceClause(since);
      let query = `
        SELECT *
        FROM dm_messages
        WHERE room_id = ?
          AND room_type = ?
      `;
      const binds = [roomId, roomType];

      if (sinceClause.sql) {
        query += sinceClause.sql;
        binds.push(sinceClause.bind);
      }

      query += ' ORDER BY id ASC LIMIT ?';
      binds.push(limit);

      const { results } = await env.DB.prepare(query).bind(...binds).all();
      return json(request, env, { success: true, data: (results || []).map(normalizeMessage) });
    }

    if (request.method === 'POST' && subResource && extra === 'reaction') {
      const messageId = subResource;
      const body = await request.json();
      const emoji = body.emoji;

      if (!emoji) {
        return json(request, env, { success: false, error: 'emoji가 필요합니다.' }, { status: 400 });
      }

      const message = await env.DB.prepare('SELECT reactions FROM dm_messages WHERE id = ? AND room_id = ?').bind(messageId, roomId).first();
      if (!message) {
        return json(request, env, { success: false, error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
      }

      let reactions = {};
      try {
        reactions = message.reactions ? JSON.parse(message.reactions) : {};
      } catch {}

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

      return json(request, env, { success: true, data: { id: messageId, reactions } });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const content = body.content || body.message || body.text || '';

      if (!content && !body.file_data && !body.image_url && body.type !== 'gathering_card') {
        return json(request, env, { success: false, error: 'message가 필요합니다.' }, { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO dm_messages (
          room_id, room_type, class_id, sender_id, user_name, user_avatar,
          content, message, type, reply_to, reply_text, reply_user,
          image_url, file_name, file_size, file_data,
          gather_title, gather_time, gather_place, min_capacity, max_capacity, current_count, status,
          is_pinned, reactions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        roomId,
        body.room_type || roomType,
        body.room_type === 'class' ? roomId : null,
        auth.user.id,
        body.user_name || auth.user.name || auth.user.username || '사용자',
        body.user_avatar || auth.user.profile_image_url || '',
        content,
        content,
        body.type || 'text',
        body.reply_to || null,
        body.reply_text || null,
        body.reply_user || null,
        body.image_url || null,
        body.file_name || null,
        body.file_size || null,
        body.file_data || null,
        body.gather_title || null,
        body.gather_time || null,
        body.gather_place || null,
        body.min_capacity || null,
        body.max_capacity || null,
        body.current_count || 0,
        body.status || null,
        body.is_pinned ? 1 : 0,
        JSON.stringify(body.reactions || {})
      ).run();

      const inserted = await env.DB.prepare(`
        SELECT *
        FROM dm_messages
        WHERE room_id = ?
          AND sender_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).bind(roomId, auth.user.id).first();

      await env.DB.prepare(`
        UPDATE user_chats
        SET last_message = ?, last_message_at = datetime('now')
        WHERE room_id = ?
      `).bind((content || body.file_name || '첨부파일').substring(0, 100), roomId).run().catch(() => null);

      return json(request, env, { success: true, data: normalizeMessage(inserted) }, { status: 201 });
    }

    if (request.method === 'PATCH' && subResource) {
      const body = await request.json();
      const content = body.content || body.message || '';
      if (!content) {
        return json(request, env, { success: false, error: 'content가 필요합니다.' }, { status: 400 });
      }

      await env.DB.prepare(`
        UPDATE dm_messages
        SET content = ?, message = ?, is_edited = 1, updated_at = datetime('now')
        WHERE id = ? AND room_id = ? AND sender_id = ?
      `).bind(content, content, subResource, roomId, auth.user.id).run();

      return json(request, env, { success: true });
    }

    if (request.method === 'DELETE' && subResource) {
      await env.DB.prepare(`
        DELETE FROM dm_messages
        WHERE id = ? AND room_id = ? AND sender_id = ?
      `).bind(subResource, roomId, auth.user.id).run();

      return json(request, env, { success: true });
    }

    return json(request, env, { success: false, error: '지원하지 않는 메서드입니다.' }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: 'DM 처리 중 오류가 발생했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}
