import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';

function parseMaybeJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeChatMessage(row) {
  if (!row) return row;

  const replyData = parseMaybeJson(row.reply_data, null);
  const reactions = parseMaybeJson(row.reactions, {});
  const content = row.content || row.message || row.text || '';
  const normalized = {
    ...row,
    content,
    message: row.message || content,
    text: row.text || content,
    file_data: row.file_data || row.image_url || null,
    reply_data: replyData || null,
    reactions: reactions && typeof reactions === 'object' ? reactions : {},
    edited: row.edited || row.is_edited === 1 || row.is_edited === true,
  };

  if (normalized.reply_data && typeof normalized.reply_data === 'object') {
    normalized.reply_to = normalized.reply_to || normalized.reply_data.id || null;
    normalized.reply_text = normalized.reply_text || normalized.reply_data.message || normalized.reply_data.content || '';
    normalized.reply_user = normalized.reply_user || normalized.reply_data.user_name || normalized.reply_data.sender_name || '';
  }

  if ((normalized.type === 'gathering' || normalized.type === 'gathering_card') && content && !normalized.gather_title) {
    const payload = parseMaybeJson(content, null);
    if (payload && typeof payload === 'object') {
      normalized.gather_title = payload.title || payload.gather_title || '';
      normalized.gather_time = payload.gathering_at || payload.gather_time || '';
      normalized.gather_place = payload.location || payload.gather_place || '';
      normalized.capacity_min = payload.capacity_min || payload.min_capacity || normalized.capacity_min || null;
      normalized.min_capacity = payload.min_capacity || payload.capacity_min || normalized.min_capacity || null;
      normalized.capacity_max = payload.capacity_max || payload.max_capacity || normalized.capacity_max || null;
      normalized.max_capacity = payload.max_capacity || payload.capacity_max || normalized.max_capacity || null;
      normalized.current_count = payload.current_count || normalized.current_count || 0;
      normalized.status = payload.status || normalized.status || 'open';
      normalized.type = 'gathering_card';
    }
  }

  return normalized;
}

function buildSinceClause(since, after) {
  const hasSince = since !== undefined && since !== null && String(since).trim() !== '';
  if (hasSince) {
    const numeric = Number(since);
    if (Number.isFinite(numeric)) {
      return {
        sql: " AND (strftime('%s', COALESCE(updated_at, created_at)) * 1000) > ?",
        bind: numeric,
      };
    }
  }

  const hasAfter = after !== undefined && after !== null && String(after).trim() !== '';
  if (hasAfter) {
    return {
      sql: ' AND created_at > (SELECT created_at FROM chat_messages WHERE id = ?)',
      bind: String(after),
    };
  }

  return { sql: '', bind: null };
}

const CHAT_MESSAGE_COLUMNS = `
  id,
  class_id,
  user_id,
  user_name,
  user_avatar,
  message,
  reply_to,
  reply_data,
  type,
  image_url,
  file_name,
  file_size,
  is_pinned,
  is_edited,
  reactions,
  created_at,
  updated_at
`;

function buildChatMessageSelect(whereSql = '', orderSql = '', limitSql = '') {
  return `
    SELECT ${CHAT_MESSAGE_COLUMNS}
    FROM chat_messages
    WHERE class_id = ?${whereSql}
    ${orderSql}
    ${limitSql}
  `;
}

async function streamMessages(context, classId, since) {
  const { env } = context;
  const encoder = new TextEncoder();
  let lastSince = Number(since) || 0;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      while (true) {
        const clause = buildSinceClause(lastSince, null);
        let query = buildChatMessageSelect(clause.sql, 'ORDER BY created_at ASC, id ASC', 'LIMIT 100');
        const binds = [classId];

        if (clause.sql) {
          binds.push(clause.bind);
        }

        try {
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          for (const row of results || []) {
            const normalized = normalizeChatMessage(row);
            const ts = new Date(normalized.updated_at || normalized.created_at || Date.now()).getTime();
            if (ts > lastSince) lastSince = ts;
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(normalized)}\n\n`));
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const classId = url.searchParams.get('class_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 100, 200);
  const after = url.searchParams.get('after');
  const since = url.searchParams.get('since');
  const pinnedOnly = ['1', 'true', 'yes'].includes((url.searchParams.get('pinned_only') || '').toLowerCase());
  const stream = ['1', 'true', 'yes'].includes((url.searchParams.get('stream') || '').toLowerCase());

  if (!classId) {
    return json(request, env, { success: false, error: 'class_id is required' }, { status: 400 });
  }

  try {
    if (stream) {
      return streamMessages(context, classId, since);
    }

    let results;
    if (pinnedOnly) {
      const query = buildChatMessageSelect(' AND is_pinned = 1', 'ORDER BY COALESCE(updated_at, created_at) DESC, id DESC', 'LIMIT ?');
      ({ results } = await env.DB.prepare(query).bind(classId, limit).all());
    } else {
      const clause = buildSinceClause(since, after);
      const query = buildChatMessageSelect(clause.sql, 'ORDER BY created_at ASC, id ASC', 'LIMIT ?');
      const binds = [classId];

      if (clause.sql) {
        binds.push(clause.bind);
      }

      binds.push(limit);
      ({ results } = await env.DB.prepare(query).bind(...binds).all());
    }

    return json(request, env, { success: true, data: (results || []).map(normalizeChatMessage) });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to load chat messages', detail: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const classId = body.class_id;
    const message = body.message || body.content || body.text || body.file_name || '';
    const attachmentUrl = body.image_url || body.file_data || null;

    if (!classId || (!message && !attachmentUrl)) {
      return json(request, env, { success: false, error: 'message or attachment is required' }, { status: 400 });
    }

    const id = 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const replyData = body.reply_data ? JSON.stringify(body.reply_data) : null;
    const reactions = body.reactions ? JSON.stringify(body.reactions) : '{}';

    await env.DB.prepare(
      'INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, reply_to, reply_data, type, image_url, file_name, file_size, is_pinned, reactions, is_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      classId,
      auth.user.id,
      body.user_name || auth.user.name || auth.user.username || 'User',
      body.user_avatar || auth.user.profile_image_url || '',
      message,
      body.reply_to || null,
      replyData,
      body.type || 'text',
      attachmentUrl,
      body.file_name || null,
      body.file_size || null,
      body.is_pinned ? 1 : 0,
      reactions,
      0,
    ).run();

    const inserted = await env.DB.prepare(
      `SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`
    ).bind(id).first();

    const responseData = normalizeChatMessage(inserted);
    if (body.client_id) responseData.client_id = String(body.client_id);

    return json(request, env, { success: true, data: responseData }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to send message', detail: error.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, is_pinned } = body;

    if (!id) {
      return json(request, env, { success: false, error: 'message id is required' }, { status: 400 });
    }

    await env.DB.prepare('UPDATE chat_messages SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(is_pinned ? 1 : 0, id)
      .run();

    const updated = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
      .bind(id)
      .first();

    return json(request, env, { success: true, data: normalizeChatMessage(updated) });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to update message', detail: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
