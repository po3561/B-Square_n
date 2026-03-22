const LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:8788',
  'http://localhost:8788',
]);

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getAllowedOrigin(request, env) {
  const requestOrigin = normalizeOrigin(request.headers.get('Origin'));
  const requestUrlOrigin = normalizeOrigin(request.url);
  const appOrigin = normalizeOrigin(env.APP_BASE_URL || env.PUBLIC_APP_URL || '');

  if (!requestOrigin) return appOrigin || requestUrlOrigin || 'http://localhost:8788';
  if (LOCAL_ORIGINS.has(requestOrigin)) return requestOrigin;
  if (appOrigin && requestOrigin === appOrigin) return requestOrigin;
  if (requestUrlOrigin && requestOrigin === requestUrlOrigin) return requestOrigin;
  if (requestOrigin.endsWith('.pages.dev')) return requestOrigin;

  return appOrigin || requestUrlOrigin || 'http://localhost:8788';
}

export function createCorsHeaders(request, env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(request, env),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra,
  };
}

export function json(request, env, payload, init = {}) {
  const headers = createCorsHeaders(request, env, {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  });

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function options(request, env, extra = {}) {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(request, env, extra),
  });
}
