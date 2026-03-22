import { requireSession } from './_lib/auth.js';
import { json, options } from './_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const after = url.searchParams.get('after'); // 폴링: 마지막 메시지 ID 이후
  const pinned_only = url.searchParams.get('pinned_only') === 'true';

  if (!class_id) return json(request, env, { success: false, error: 'class_id 필요' }, { status: 400 });

  try {
    let results;
    if (pinned_only) {
      // 고정된 메시지들만 전송
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? AND is_pinned = 1 ORDER BY created_at DESC'
      ).bind(class_id).all());
    } else if (after) {
      // 마지막 메시지 이후의 새 메시지만 가져오기 (폴링)
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? AND created_at > (SELECT created_at FROM chat_messages WHERE id = ?) ORDER BY created_at ASC LIMIT ?'
      ).bind(class_id, after, limit).all());
    } else {
      ({ results } = await env.DB.prepare(
        'SELECT * FROM chat_messages WHERE class_id = ? ORDER BY created_at DESC LIMIT ?'
      ).bind(class_id, limit).all());
      results = results.reverse(); // 최신순 → 시간순
    }

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: '채팅 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { class_id, user_name, user_avatar, message, type } = body;

    if (!class_id || !message) {
      return json(request, env, { success: false, error: '필수 항목 누락' }, { status: 400 });
    }

    const id = 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    await env.DB.prepare(
      'INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, class_id, auth.user.id, user_name || auth.user.name || auth.user.username || '사용자', user_avatar || auth.user.profile_image_url || '', message, type || 'text').run();

    return json(request, env, { success: true, data: { id } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: '메시지 전송 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, is_pinned } = body;

    if (!id) {
      return json(request, env, { success: false, error: '메시지 ID 필요' }, { status: 400 });
    }

    // 해당 클래스의 다른 메시지들은 핀 해제 (현재 1개만 고정하는 정책인 경우)
    // 만약 여러 개 고정을 허용하려면 이 부분 수정 필요. 
    // 여기서는 "마지막 고정된 것이 상단바에 노출"되도록 하거나 "하나만 고정"하도록 처리.
    // 사용자 요청은 "메시지를 고정하면 사라지지 말고" 이므로 여러 개 가능할 수도 있지만, 
    // 보통 상단바는 하나이므로 최신 핀을 우선함.
    
    await env.DB.prepare(
      'UPDATE chat_messages SET is_pinned = ? WHERE id = ?'
    ).bind(is_pinned ? 1 : 0, id).run();

    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: '핀 상태 변경 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
