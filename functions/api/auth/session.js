import { clearSessionCookie, getCurrentUser, getSessionToken } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const token = getSessionToken(request);
    if (!token) {
      return json(request, env, { success: true, data: { session: null } });
    }

    const current = await getCurrentUser(context);

    if (!current) {
      return json(request, env, { success: true, data: { session: null } }, {
        headers: { 'Set-Cookie': clearSessionCookie(request) }
      });
    }

    return json(request, env, {
      success: true,
      data: {
        session: {
          user: current.user,
          expires_at: current.session.expires_at
        }
      }
    });

  } catch (err) {
    console.error('Session check error:', err);
    return json(request, env, { success: false, error: '세션 확인 중 오류' }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const token = getSessionToken(request);
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }

    return json(request, env, { success: true, message: '로그아웃 완료' }, {
      headers: { 'Set-Cookie': clearSessionCookie(request) }
    });
  } catch (err) {
    return json(request, env, { success: false, error: '로그아웃 처리 중 오류' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
