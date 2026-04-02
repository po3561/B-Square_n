import { options } from '../../api/_lib/http.js';
import { handleOAuthCallback } from '../../api/_lib/oauth.js';

function renderBridgePage() {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Cache-Control" content="no-store">
    <title>네이버 로그인 처리 중</title>
    <script src="/login/naver_callback.js?v=20260402_05" defer></script>
  </head>
  <body>
    <p>네이버 로그인 처리를 진행 중입니다.</p>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
    },
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  if (requestUrl.searchParams.has('code') || requestUrl.searchParams.has('error')) {
    return handleOAuthCallback(context, 'naver');
  }

  return renderBridgePage();
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
