import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const url = new URL(request.url);
    const username = (url.searchParams.get('username') || '').trim();

    if (username.length < 2) {
      return json(request, env, { success: false, error: 'Username must be at least 2 characters.' }, { status: 400 });
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();

    return json(request, env, {
      success: true,
      data: {
        available: !existing,
        message: existing ? 'Username is already in use.' : 'Username is available.',
      },
    });
  } catch (err) {
    console.error('Check-username error:', err);
    return json(request, env, { success: false, error: 'Username check failed.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
