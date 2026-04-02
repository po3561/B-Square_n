import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureDmMessagesSchema, ensureUserChatsSchema } from './_lib/schema.js';

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

function normalizeDmMessage(row) {
  if (!row) return row;
  return {
    ...row,
    content: row.content || row.message || '',
    message: row.content || row.message || '',
    text: row.content || row.message || '',
    file_data: row.file_data || row.image_url || null,
    reactions: parseReactions(row.reactions),
  };
}

const DM_MESSAGE_COLUMNS = `
  id,
  room_id,
  room_type,
  sender_id,
  user_name,
  user_avatar,
  content,
  message,
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureDmMessagesSchema(env.DB);

  const url = new URL(request.url);
  const roomId = url.searchParams.get('room_id');
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 200);

  if (!roomId) {
    return json(request, env, { success: false, error: 'room_id is required' }, { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT ${DM_MESSAGE_COLUMNS}
      FROM dm_messages
      WHERE room_id = ? AND room_type = 'dm'
      ORDER BY id ASC
      LIMIT ?
    `).bind(roomId, limit).all();

    return json(request, env, { success: true, data: (results || []).map(normalizeDmMessage) });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to load DM messages', detail: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await Promise.all([
    ensureDmMessagesSchema(env.DB),
    ensureUserChatsSchema(env.DB),
  ]);

  try {
    const body = await request.json();
    const roomId = String(body.room_id || '').trim();
    const content = String(body.content || body.message || body.text || '').trim();
    const attachmentUrl = body.image_url || body.file_data || null;
    const roomType = String(body.room_type || 'dm').trim() || 'dm';
    const messageType = String(body.type || 'text').trim() || 'text';

    if (!roomId || (!content && !attachmentUrl)) {
      return json(request, env, { success: false, error: 'room_id and content are required' }, { status: 400 });
    }

    const insertResult = await env.DB.prepare(`
      INSERT INTO dm_messages (
        room_id, room_type, sender_id, user_name, user_avatar,
        content, message, type, image_url, file_name, file_size,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      roomId,
      roomType,
      auth.user.id,
      auth.user.name || auth.user.username || 'User',
      auth.user.profile_image_url || '',
      content,
      content,
      messageType,
      attachmentUrl,
      body.file_name || null,
      Number.isFinite(Number(body.file_size)) ? Number(body.file_size) : null,
    ).run();

    const insertedId = insertResult?.meta?.last_row_id ?? null;
    let message = null;
    if (insertedId != null) {
      message = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE id = ?
      `).bind(insertedId).first();
    }
    if (!message) {
      message = await env.DB.prepare(`
        SELECT ${DM_MESSAGE_COLUMNS}
        FROM dm_messages
        WHERE room_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).bind(roomId).first();
    }

    await env.DB.prepare(
      'UPDATE user_chats SET last_message = ?, last_message_at = CURRENT_TIMESTAMP WHERE room_id = ?'
    ).bind(content.substring(0, 100) || 'attachment', roomId).run();

    const responseData = normalizeDmMessage(message);
    if (body.client_id) responseData.client_id = String(body.client_id);

    return json(request, env, { success: true, data: responseData }, { status: 201 });
  } catch (error) {
    return json(request, env, { success: false, error: 'Failed to send DM message', detail: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
