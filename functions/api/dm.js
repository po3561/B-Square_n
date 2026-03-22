import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureDmMessagesSchema } from './_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const room_id = url.searchParams.get('room_id');
  const limit = parseInt(url.searchParams.get('limit')) || 100;

  if (!room_id) {
    return json(request, env, { success: false, error: 'room_id 필요' }, { status: 400 });
  }

  try {
    await ensureDmMessagesSchema(env.DB);

    const { results } = await env.DB.prepare(
      "SELECT * FROM dm_messages WHERE room_id = ? AND room_type = 'dm' ORDER BY id ASC LIMIT ?"
    ).bind(room_id, limit).all();

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: 'DM 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureDmMessagesSchema(env.DB);

    const body = await request.json();
    const { room_id, text, image_url } = body;

    if (!room_id || !text) {
      return json(request, env, { success: false, error: '필수 항목 누락 (room_id, text)' }, { status: 400 });
    }

    await env.DB.prepare(
      "INSERT INTO dm_messages (room_id, room_type, sender_id, user_name, user_avatar, content, message, type, image_url, created_at, updated_at) VALUES (?, 'dm', ?, ?, ?, ?, ?, 'text', ?, datetime('now'), datetime('now'))"
    ).bind(room_id, auth.user.id, auth.user.name || auth.user.username || '사용자', auth.user.profile_image_url || '', text, text, image_url || null).run();

    await env.DB.prepare(
      'UPDATE user_chats SET last_message = ?, last_message_at = CURRENT_TIMESTAMP WHERE room_id = ?'
    ).bind(text.substring(0, 100), room_id).run();

    const message = await env.DB.prepare("SELECT * FROM dm_messages WHERE room_id = ? AND room_type = 'dm' ORDER BY id DESC LIMIT 1").bind(room_id).first();
    return json(request, env, { success: true, data: message }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: 'DM 전송 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
    return options(context.request, context.env);
}
