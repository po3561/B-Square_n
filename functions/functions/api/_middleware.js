import { createCorsHeaders, json, options } from './_lib/http.js';

export async function onRequest(context) {
  const { request, env, next } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  try {
    const response = await next();
    const headers = new Headers(response.headers);
    const corsHeaders = createCorsHeaders(request, env);
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    console.error('[Middleware Error]:', err);
    return json(request, env, {
      success: false,
      error: '서버 내부 오류가 발생했습니다.',
      detail: err.message,
    }, { status: 500 });
  }
}
