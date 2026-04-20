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

function trimText(value) {
  return String(value ?? '').trim();
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
    created_at: serializeUtcTimestamp(row.created_at),
    updated_at: serializeUtcTimestamp(row.updated_at),
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
      const body = await readJsonObject(request);
      const content = trimText(body.message || body.content || '');
      if (!content) {
        return json(request, env, { success: false, error: 'message is required' }, { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE chat_messages SET message = ?, is_edited = 1, updated_at = datetime('now') WHERE id = ?"
      ).bind(content, messageId).run();

      const updated = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
        .bind(messageId)
        .first();
      if (!updated) {
        return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
      }

      const responseData = normalizeChatMessage(updated);
      if (body.client_id) responseData.client_id = String(body.client_id);

      return json(request, env, { success: true, data: responseData });
    }

    if (request.method === 'DELETE') {
      const deletedText = '메시지가 삭제되었습니다.';
      await env.DB.prepare(`
        UPDATE chat_messages
        SET content = ?, message = ?, type = 'deleted',
            reply_to = NULL, reply_data = NULL,
            image_url = NULL, file_name = NULL, file_size = NULL, file_data = NULL,
            is_pinned = 0, is_edited = 1, reactions = '{}', updated_at = datetime('now')
        WHERE id = ?
      `).bind(deletedText, deletedText, messageId).run();

      const updated = await env.DB.prepare(`SELECT ${CHAT_MESSAGE_COLUMNS} FROM chat_messages WHERE id = ?`)
        .bind(messageId)
        .first();
      return json(request, env, { success: true, data: updated ? normalizeChatMessage(updated) : null });
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
