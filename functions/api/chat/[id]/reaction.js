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
      const classAuth = await requireClassManager(context, message.class_id);
      if (!classAuth.ok) return classAuth.response;
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
        updated_at: updated?.updated_at || new Date().toISOString(),
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
