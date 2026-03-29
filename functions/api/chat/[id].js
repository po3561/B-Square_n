import { isAtLeastRole, requireClassManager, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

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

  return normalized;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const messageId = params?.id;
  if (!messageId) {
    return json(request, env, { success: false, error: 'message id is required' }, { status: 400 });
  }

  try {
    const message = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
      .bind(messageId)
      .first();
    if (!message) {
      return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
    }

    const isOwner = String(message.user_id) === String(auth.user.id);
    if (!isOwner && !isAtLeastRole(auth.user.role, 'admin')) {
      const classAuth = await requireClassManager(context, message.class_id);
      if (!classAuth.ok) return classAuth.response;
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const body = await request.json();
      const content = String(body.message || body.content || '').trim();
      if (!content) {
        return json(request, env, { success: false, error: 'message is required' }, { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE chat_messages SET message = ?, is_edited = 1, updated_at = datetime('now') WHERE id = ?"
      ).bind(content, messageId).run();

      const updated = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
        .bind(messageId)
        .first();

      const responseData = normalizeChatMessage(updated);
      if (body.client_id) responseData.client_id = String(body.client_id);

      return json(request, env, { success: true, data: responseData });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(messageId).run();
      return json(request, env, { success: true });
    }

    return json(request, env, { success: false, error: 'method not allowed' }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: 'Failed to process chat message',
      detail: error.message,
    }, { status: 500 });
  }
}
