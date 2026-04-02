(function () {
  'use strict';

  const TOKEN_ENDPOINT = '/auth/naver/token';
  const FALLBACK_LOGIN = '/login/login.html';

  function readAuthParams() {
    const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const queryParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

    for (const [key, value] of queryParams.entries()) {
      if (!hashParams.has(key) && value !== undefined) {
        hashParams.set(key, value);
      }
    }

    return hashParams;
  }

  function redirectWithError(code, message) {
    const url = new URL(FALLBACK_LOGIN, window.location.origin);
    url.searchParams.set('provider', 'naver');
    if (code) url.searchParams.set('oauth_error', code);
    if (message) url.searchParams.set('message', message);
    window.location.replace(url.toString());
  }

  async function postToken(payload) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    const redirectTo = String(json?.data?.redirect_to || json?.redirect_to || '').trim();

    if (redirectTo) {
      window.location.replace(redirectTo);
      return;
    }

    if (!response.ok || json?.success === false) {
      throw new Error(json?.message || json?.error || 'naver_callback_failed');
    }

    window.location.replace(FALLBACK_LOGIN);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const params = readAuthParams();
    const payload = {
      access_token: String(params.get('access_token') || '').trim(),
      state: String(params.get('state') || '').trim(),
      error: String(params.get('error') || '').trim(),
      error_description: String(params.get('error_description') || '').trim(),
    };

    if (!payload.access_token && !payload.error) {
      redirectWithError('callback_missing_code', '네이버 로그인 정보를 확인할 수 없습니다.');
      return;
    }

    postToken(payload).catch((error) => {
      redirectWithError('oauth_failed', error?.message || '네이버 로그인 처리에 실패했습니다.');
    });
  });
})();
