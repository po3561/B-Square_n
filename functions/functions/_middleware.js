import { createCorsHeaders, options } from './api/_lib/http.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  const corsHeaders = createCorsHeaders(request, env);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
