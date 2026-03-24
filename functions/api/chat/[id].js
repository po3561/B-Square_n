import { requireClassManager, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureChatMessagesSchema } from '../_lib/schema.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  const messageId = params?.id;
  if (!messageId) {
    return json(request, env, { success: false, error: 'message id required' }, { status: 400 });
  }

  try {
    await ensureChatMessagesSchema(env.DB);

    const message = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(messageId).first();
    if (!message) {
      return json(request, env, { success: false, error: 'message not found' }, { status: 404 });
    }

    const isOwner = String(message.user_id) === String(auth.user.id);
    if (!isOwner && auth.user.role !== 'admin') {
      const classAuth = await requireClassManager(context, message.class_id);
      if (!classAuth.ok) return classAuth.response;
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const body = await request.json();
      const content = String(body.message || body.content || '').trim();
      if (!content) {
        return json(request, env, { success: false, error: 'message required' }, { status: 400 });
      }

      await env.DB.prepare(
        "UPDATE chat_messages SET message = ?, is_edited = 1, updated_at = datetime('now') WHERE id = ?"
      ).bind(content, messageId).run();

      const updated = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(messageId).first();
      return json(request, env, { success: true, data: updated });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(messageId).run();
      return json(request, env, { success: true });
    }

    return json(request, env, { success: false, error: 'method not allowed' }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: 'chat message processing failed',
      detail: error.message,
    }, { status: 500 });
  }
}
