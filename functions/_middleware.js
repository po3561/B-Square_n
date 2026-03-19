// functions/_middleware.js — 전역 CORS 미들웨어
// Live Server(5500) 등 다른 포트에서 Wrangler(8788)로 API 호출 시 CORS 허용

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get('Origin') || '*';

  // Preflight (OPTIONS) 요청 즉시 응답
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-BSQ-Dev-Mode',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 실제 요청 → 다음 핸들러 실행 후 CORS 헤더 삽입
  const response = await context.next();

  // 응답 복제 후 CORS 헤더 추가
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', origin);
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-BSQ-Dev-Mode');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
