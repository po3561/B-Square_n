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
    return json(request, env, { success: false, error: 'message id 필요' }, { status: 400 });
  }

  try {
    await ensureChatMessagesSchema(env.DB);

    const message = await env.DB.prepare(
      'SELECT * FROM chat_messages WHERE id = ?'
    ).bind(messageId).first();

    if (!message) {
      return json(request, env, { success: false, error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const isOwner = message.user_id === auth.user.id;
    if (!isOwner && auth.user.role !== 'admin') {
      const classAuth = await requireClassManager(context, message.class_id);
      if (!classAuth.ok) return classAuth.response;
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const body = await request.json();
      const content = body.message || body.content || '';
      if (!content) {
        return json(request, env, { success: false, error: 'message가 필요합니다.' }, { status: 400 });
      }

      await env.DB.prepare(
        'UPDATE chat_messages SET message = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(content, messageId).run();

      return json(request, env, { success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare(
        'DELETE FROM chat_messages WHERE id = ?'
      ).bind(messageId).run();

      return json(request, env, { success: true });
    }

    return json(request, env, { success: false, error: '지원하지 않는 메서드입니다.' }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: '채팅 처리 중 오류가 발생했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}
