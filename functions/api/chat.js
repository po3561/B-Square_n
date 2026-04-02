import { requireSession } from './_lib/auth.js';
import { createCorsHeaders, json, options } from './_lib/http.js';
import { ensureChatMessagesSchema } from './_lib/schema.js';

function parseMaybeJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
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
    file_data: row.image_url ?? row.file_data ?? null,
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

const ROLE_RANK = {
  user: 0,
  student: 0,
  member: 0,
  instructor: 1,
  operator: 2,
  admin: 3,
  super_admin: 3,
};

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return 'user';
  if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
  if (['manager', 'operator_admin', 'ops'].includes(value)) return 'operator';
  if (['teacher', 'lecturer'].includes(value)) return 'instructor';
  return value in ROLE_RANK ? value : 'user';
}

function isAtLeastRole(role, minimumRole) {
  return (ROLE_RANK[normalizeRole(role)] ?? 0) >= (ROLE_RANK[normalizeRole(minimumRole)] ?? 0);
}

function hasSubInstructorAccess(rawValue, userId) {
  const targetId = String(userId || '').trim();
  if (!targetId) return false;

  const matches = (value) => String(value || '').trim() === targetId;

  if (Array.isArray(rawValue)) {
    return rawValue.some((item) => matches(item?.id ?? item?.user_id ?? item));
  }

  const rawText = String(rawValue || '').trim();
  if (!rawText) return false;

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed.some((item) => matches(item?.id ?? item?.user_id ?? item));
    }
  } catch {
    // fall through to delimited string matching
  }

  return rawText
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .some(matches);
}

async function checkClassChatAccess(context, auth, classId, { managerOnly = false } = {}) {
  const { env, request } = context;
  const normalizedClassId = trimText(classId);
  if (!normalizedClassId) {
    return {
      ok: false,
      response: json(request, env, { success: false, error: 'class_id is required' }, { status: 400 }),
    };
  }

  const cls = await env.DB.prepare(`
    SELECT id, creator_id, sub_instructors
    FROM classes
    WHERE id = ?
  `).bind(normalizedClassId).first();

  if (!cls) {
    return {
      ok: false,
      response: json(request, env, { success: false, error: '대상을 찾을 수 없습니다.' }, { status: 404 }),
    };
  }

  const userId = String(auth.user.id || '').trim();
  const isManager =
    isAtLeastRole(auth.user.role, 'operator') ||
    cls.creator_id === userId ||
    hasSubInstructorAccess(cls.sub_instructors, userId);

  if (isManager) {
    return { ok: true, auth };
  }

  if (managerOnly) {
    return {
      ok: false,
      response: json(request, env, { success: false, error: '클래스 관리 권한이 필요합니다.' }, { status: 403 }),
    };
  }

  const classRoom = await env.DB.prepare(`
    SELECT 1
    FROM user_chats
    WHERE user_id = ? AND room_id = ? AND type = 'class'
    LIMIT 1
  `).bind(userId, normalizedClassId).first().catch(() => null);

  if (classRoom) {
    return { ok: true, auth };
  }

  const participant = await env.DB.prepare(`
    SELECT 1
    FROM class_participants
    WHERE class_id = ? AND user_id = ?
    LIMIT 1
  `).bind(normalizedClassId, userId).first().catch((error) => {
    const message = String(error?.message || '');
    if (/no such table/i.test(message)) return null;
    throw error;
  });

  if (participant) {
    return { ok: true, auth };
  }

  return {
    ok: false,
    response: json(request, env, { success: false, error: '클래스 채팅 참여 권한이 필요합니다.' }, { status: 403 }),
  };
}

function buildSinceClause(since, after) {
  const hasSince = since !== undefined && since !== null && String(since).trim() !== '';
  if (hasSince) {
    const numeric = Number(since);
    if (Number.isFinite(numeric)) {
      const timestamp = toSQLiteTimestamp(numeric);
      if (!timestamp) {
        return {
          sql: '',
          bind: null,
          orderSql: 'ORDER BY created_at ASC, id ASC',
        };
      }

      return {
        sql: ' AND updated_at > ?',
        bind: timestamp,
        orderSql: 'ORDER BY updated_at ASC, id ASC',
      };
    }
  }

  const hasAfter = after !== undefined && after !== null && String(after).trim() !== '';
  if (hasAfter) {
    return {
      sql: ' AND created_at > (SELECT created_at FROM chat_messages WHERE id = ?)',
      bind: String(after),
      orderSql: 'ORDER BY created_at ASC, id ASC',
    };
  }

  return { sql: '', bind: null, orderSql: 'ORDER BY created_at ASC, id ASC' };
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
  const { env, request } = context;
  const encoder = new TextEncoder();
  let lastSince = Number(since) || 0;
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
        const clause = buildSinceClause(lastSince, null);
        let query = buildChatMessageSelect(clause.sql, clause.orderSql, 'LIMIT 100');
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureChatMessagesSchema(env.DB);

  const url = new URL(request.url);
    const classId = url.searchParams.get('class_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 50, 100);
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
      const query = buildChatMessageSelect(' AND is_pinned = 1', 'ORDER BY updated_at DESC, id DESC', 'LIMIT ?');
      ({ results } = await env.DB.prepare(query).bind(classId, limit + 1).all());
    } else {
      const clause = buildSinceClause(since, after);
      const query = buildChatMessageSelect(clause.sql, clause.orderSql, 'LIMIT ?');
      const binds = [classId];

      if (clause.sql) {
        binds.push(clause.bind);
      }

      binds.push(limit + 1);
      ({ results } = await env.DB.prepare(query).bind(...binds).all());
    }

    const rows = (results || []).map(normalizeChatMessage);
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
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to load chat messages', detail: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureChatMessagesSchema(env.DB);

  try {
    const body = await readJsonObject(request);
    const classId = trimText(body.class_id);
    const message = trimText(body.message || body.content || body.text || body.file_name || '');
    const attachmentUrl = trimText(body.image_url || body.file_data || '') || null;

    if (!classId || (!message && !attachmentUrl)) {
      return json(request, env, { success: false, error: 'message or attachment is required' }, { status: 400 });
    }

    const id = 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const replyData = typeof body.reply_data === 'string'
      ? body.reply_data
      : (body.reply_data ? JSON.stringify(body.reply_data) : null);
    const reactions = typeof body.reactions === 'string'
      ? body.reactions
      : JSON.stringify(body.reactions || {});

    await env.DB.prepare(
      'INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, reply_to, reply_data, type, image_url, file_name, file_size, is_pinned, reactions, is_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      classId,
      auth.user.id,
      trimText(body.user_name) || trimText(auth.user.name) || trimText(auth.user.username) || 'User',
      trimText(body.user_avatar) || trimText(auth.user.profile_image_url) || '',
      message,
      trimText(body.reply_to) || null,
      replyData,
      trimText(body.type) || 'text',
      attachmentUrl,
      trimText(body.file_name) || null,
      Number.isFinite(Number(body.file_size)) ? Number(body.file_size) : null,
      isTruthyFlag(body.is_pinned) ? 1 : 0,
      reactions,
      0,
    ).run();

    const inserted = await env.DB.prepare(
      `SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`
    ).bind(id).first();
    if (!inserted) {
      return json(request, env, { success: false, error: 'Failed to create message' }, { status: 500 });
    }

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
  await ensureChatMessagesSchema(env.DB);

  try {
    const body = await readJsonObject(request);
    const id = trimText(body.id);
    const hasPinState = Object.prototype.hasOwnProperty.call(body, 'is_pinned');
    const isPinned = body.is_pinned;

    if (!id) {
      return json(request, env, { success: false, error: 'message id is required' }, { status: 400 });
    }
    if (!hasPinState) {
      return json(request, env, { success: false, error: 'is_pinned is required' }, { status: 400 });
    }

    await env.DB.prepare('UPDATE chat_messages SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(isTruthyFlag(isPinned) ? 1 : 0, id)
      .run();

    const updated = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
      .bind(id)
      .first();
    if (!updated) {
      return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
    }

    return json(request, env, { success: true, data: normalizeChatMessage(updated) });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to update message', detail: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
