import { isAtLeastRole, requireClassManager, requireSession } from '../../_lib/auth.js';
import { json, options } from '../../_lib/http.js';

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

async function hasClassReactionAccess(context, auth, classId) {
  const { env, request } = context;
  const normalizedClassId = trimText(classId);
  const userId = String(auth.user.id || '').trim();
  const role = String(auth.user.role || '').trim().toLowerCase();
  const privilegedRoles = ['operator', 'admin', 'super_admin', 'super-admin', 'superadmin', 'root', 'owner', 'manager', 'operator_admin', 'ops'];

  if (!normalizedClassId) {
    return {
      ok: false,
      response: json(request, env, { success: false, error: 'class_id is required' }, { status: 400 }),
    };
  }

  if (privilegedRoles.includes(role)) {
    return { ok: true };
  }

  const member = await env.DB.prepare(`
    SELECT 1
    FROM user_chats
    WHERE user_id = ? AND room_id = ? AND type = 'class'
    LIMIT 1
  `).bind(userId, normalizedClassId).first().catch(() => null);

  if (member) {
    return { ok: true };
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
    return { ok: true };
  }

  const manager = await requireClassManager(context, normalizedClassId);
  if (!manager.ok) {
    return { ok: false, response: manager.response };
  }

  return { ok: true };
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

  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return json(request, env, { success: false, error: 'method not allowed' }, { status: 405 });
  }

  try {
    const message = await env.DB.prepare(
      'SELECT id, class_id, user_id, reactions FROM chat_messages WHERE id = ?'
    ).bind(messageId).first();
    if (!message) {
      return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
    }

    const isOwner = String(message.user_id) === String(auth.user.id);
    if (!isOwner && !isAtLeastRole(auth.user.role, 'admin')) {
      const access = await hasClassReactionAccess(context, auth, message.class_id);
      if (!access.ok) return access.response;
    }

    const body = await readJsonObject(request);
    const emoji = String(body.emoji || body.reaction || '').trim();
    if (!emoji) {
      return json(request, env, { success: false, error: 'emoji is required' }, { status: 400 });
    }

    const reactions = parseReactions(message.reactions);
    reactions[emoji] = Array.isArray(reactions[emoji]) ? reactions[emoji].map((value) => String(value)) : [];

    const userId = String(auth.user.id);
    const idx = reactions[emoji].indexOf(userId);
    if (idx >= 0) {
      reactions[emoji].splice(idx, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    await env.DB.prepare(
      "UPDATE chat_messages SET reactions = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(reactions), messageId).run();

    const updated = await env.DB.prepare(
      'SELECT id, class_id, user_id, reactions, updated_at FROM chat_messages WHERE id = ?'
    ).bind(messageId).first();
    if (!updated) {
      return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
    }

    return json(request, env, {
      success: true,
      data: {
        id: messageId,
        reactions,
        updated_at: serializeUtcTimestamp(updated?.updated_at) || new Date().toISOString(),
      },
    });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: 'Failed to process reaction',
      detail: error.message,
    }, { status: 500 });
  }
}
