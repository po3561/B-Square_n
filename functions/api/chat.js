import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureChatMessagesSchema, ensureClassesSchema } from './_lib/schema.js';

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
        sql: " AND (strftime('%s', created_at) * 1000) > ?",
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

function buildStreamResponse(controller, encoder, message, kind = 'message') {
  controller.enqueue(encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(message)}\n\n`));
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
        let query = `
          SELECT *
          FROM chat_messages
          WHERE class_id = ?
        `;
        const binds = [classId];

        if (clause.sql) {
          query += clause.sql;
          binds.push(clause.bind);
        }

        query += ' ORDER BY created_at ASC, id ASC LIMIT 100';

        try {
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          for (const row of results || []) {
            const normalized = normalizeChatMessage(row);
            const ts = new Date(normalized.created_at || Date.now()).getTime();
            if (ts > lastSince) lastSince = ts;
            buildStreamResponse(controller, encoder, normalized, 'message');
          }
          buildStreamResponse(controller, encoder, { ts: Date.now() }, 'ping');
        } catch (error) {
          buildStreamResponse(controller, encoder, { error: error.message }, 'error');
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
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 200);
  const after = url.searchParams.get('after');
  const since = url.searchParams.get('since');
  const pinnedOnly = ['1', 'true', 'yes'].includes((url.searchParams.get('pinned_only') || '').toLowerCase());
  const stream = ['1', 'true', 'yes'].includes((url.searchParams.get('stream') || '').toLowerCase());

  if (!classId) {
    return json(request, env, { success: false, error: 'class_id 필요' }, { status: 400 });
  }

  try {
    await ensureChatMessagesSchema(env.DB);

    if (stream) {
      return streamMessages(context, classId, since);
    }

    let results;
    if (pinnedOnly) {
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? AND is_pinned = 1 ORDER BY created_at DESC LIMIT ?'
      ).bind(classId, limit).all());
    } else {
      const clause = buildSinceClause(since, after);
      let query = `
        SELECT *
        FROM chat_messages
        WHERE class_id = ?
      `;
      const binds = [classId];

      if (clause.sql) {
        query += clause.sql;
        binds.push(clause.bind);
      }

      query += ' ORDER BY created_at ASC, id ASC LIMIT ?';
      binds.push(limit);

      ({ results } = await env.DB.prepare(query).bind(...binds).all());
    }

    return json(request, env, { success: true, data: (results || []).map(normalizeChatMessage) });
  } catch (err) {
    return json(request, env, { success: false, error: '채팅 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureChatMessagesSchema(env.DB);

    const body = await request.json();
    const classId = body.class_id;
    const message = body.message || body.content || body.text || body.file_name || '';

    if (!classId || (!message && !body.file_data && !body.image_url)) {
      return json(request, env, { success: false, error: '필수 항목 누락' }, { status: 400 });
    }

    const id = 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const replyData = body.reply_data ? JSON.stringify(body.reply_data) : null;
    const reactions = body.reactions ? JSON.stringify(body.reactions) : '{}';

    await env.DB.prepare(
      'INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, reply_to, reply_data, type, image_url, file_name, file_size, file_data, is_pinned, reactions, is_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      classId,
      auth.user.id,
      body.user_name || auth.user.name || auth.user.username || '사용자',
      body.user_avatar || auth.user.profile_image_url || '',
      message,
      body.reply_to || null,
      replyData,
      body.type || 'text',
      body.image_url || null,
      body.file_name || null,
      body.file_size || null,
      body.file_data || null,
      body.is_pinned ? 1 : 0,
      reactions,
      0
    ).run();

    const inserted = await env.DB.prepare(
      'SELECT * FROM chat_messages WHERE class_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
    ).bind(classId, auth.user.id).first();

    return json(request, env, { success: true, data: normalizeChatMessage(inserted) }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: '메시지 전송 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureChatMessagesSchema(env.DB);

    const body = await request.json();
    const { id, is_pinned } = body;

    if (!id) {
      return json(request, env, { success: false, error: '메시지 ID 필요' }, { status: 400 });
    }

    await env.DB.prepare('UPDATE chat_messages SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(is_pinned ? 1 : 0, id)
      .run();

    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: '핀 상태 변경 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
