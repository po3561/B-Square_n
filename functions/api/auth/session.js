import { clearSessionCookie, getCurrentUser, getSessionToken } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const token = getSessionToken(request);
    if (!token) {
      return json(request, env, { success: true, data: { session: null } });
    }

    const current = await getCurrentUser(context);
    if (!current) {
      return json(request, env, { success: true, data: { session: null } }, {
        headers: { 'Set-Cookie': clearSessionCookie(request, env) },
      });
    }

    return json(request, env, {
      success: true,
      data: {
        session: {
          user: current.user,
          expires_at: current.session.expires_at,
        },
      },
    });
  } catch (err) {
    console.error('Session check error:', err);
    return json(request, env, { success: false, error: 'Session check failed.' }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const token = getSessionToken(request);
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }

    return json(request, env, { success: true, message: 'Logged out.' }, {
      headers: { 'Set-Cookie': clearSessionCookie(request, env) },
    });
  } catch (err) {
    console.error('Logout error:', err);
    return json(request, env, { success: false, error: 'Logout failed.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
