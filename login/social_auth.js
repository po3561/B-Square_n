(function () {
  'use strict';

  const PROVIDERS = [
    {
      id: 'kakao',
      label: '카카오',
      glyph: 'K',
      toneClass: 'social-auth-provider--kakao',
      startPath: '/auth/kakao/start',
      action: {
        login: '카카오로 로그인',
        signup: '카카오로 본인 인증',
        recovery: '카카오로 계정 확인',
      },
    },
    {
      id: 'naver',
      label: '네이버',
      glyph: 'N',
      toneClass: 'social-auth-provider--naver',
      startPath: '/auth/naver/start',
      action: {
        login: '네이버로 로그인',
        signup: '네이버로 본인 인증',
        recovery: '네이버로 계정 확인',
      },
    },
    {
      id: 'google',
      label: '구글',
      glyph: 'G',
      toneClass: 'social-auth-provider--google',
      startPath: '/auth/google/start',
      action: {
        login: '구글로 로그인',
        signup: '구글로 본인 인증',
        recovery: '구글로 계정 확인',
      },
    },
  ];

  const KAKAO_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.0/kakao.min.js';
  const KAKAO_SDK_SCOPE = 'profile_nickname,profile_image,account_email';

  const ERROR_MESSAGES = {
    provider_unavailable: '현재 선택한 소셜 로그인은 준비 중입니다.',
    callback_missing_code: '소셜 인증 정보를 받지 못했습니다. 다시 시도해 주세요.',
    state_mismatch: '보안 검증에 실패했습니다. 다시 시도해 주세요.',
    state_expired: '인증 시간이 만료되었습니다. 다시 시도해 주세요.',
    access_denied: '로그인이 취소되었습니다.',
    consent_required: '권한 동의가 필요합니다. 다시 시도해 주세요.',
    login_required: '계정 선택이 필요합니다. 다시 시도해 주세요.',
    invalid_scope: '카카오 로그인 요청 범위가 올바르지 않습니다. 다시 시도해 주세요.',
    invalid_client: '카카오 인증 설정이 올바르지 않습니다. 관리자 설정을 확인해 주세요.',
    invalid_grant: '카카오 인증 코드가 만료되었거나 이미 사용되었습니다. 다시 시도해 주세요.',
    invalid_request: '카카오 로그인 요청이 올바르지 않습니다. 다시 시도해 주세요.',
    unauthorized_client: '카카오 앱 인증 권한이 허용되지 않았습니다.',
    redirect_uri_mismatch: '카카오 callback 주소가 등록된 값과 일치하지 않습니다.',
    server_error: '카카오 인증 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    temporarily_unavailable: '카카오 인증 서버가 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    token_exchange_failed: '인증 서버와의 연결에 실패했습니다.',
    provider_fetch_failed: '소셜 로그인 서버와 통신에 실패했습니다.',
    user_info_failed: '사용자 정보를 가져오지 못했습니다.',
    session_create_failed: '서비스 세션 생성에 실패했습니다.',
    oauth_failed: '소셜 로그인 처리에 실패했습니다.',
    provider_error: '소셜 로그인 중 오류가 발생했습니다.',
    account_exists: '이미 연결된 계정입니다. 이메일 로그인 또는 해당 소셜 계정으로 로그인해 주세요.',
    signup_required: '소셜 인증은 완료되었습니다. 아래 정보 입력을 계속해 주세요.',
    account_not_found: '연결된 계정을 찾지 못했습니다. 이메일 입력 또는 다른 소셜 계정을 시도해 주세요.',
  };

  function getBaseOrigin() {
    const candidates = [
      window.location.origin && window.location.origin !== 'null' ? window.location.origin : '',
      window.BSQ?.apiBaseUrl || '',
      document.querySelector('meta[name="bsq-api-base"]')?.content || '',
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (!value) continue;
      try {
        return new URL(value).origin;
      } catch {
        // continue
      }
    }

    return 'https://b-square-web.pages.dev';
  }

  function toAbsoluteUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return new URL('/index.html', getBaseOrigin()).toString();
    if (/^https?:\/\//i.test(raw)) return raw;
    return new URL(raw, getBaseOrigin()).toString();
  }

  async function apiGet(path) {
    if (window.BSQ?.api) {
      return window.BSQ.api(path, { cacheBust: false });
    }

    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    return response.json().catch(() => ({}));
  }

  async function apiPost(path, body) {
    if (window.BSQAuthAPI?.postJson) {
      return window.BSQAuthAPI.postJson(path, body);
    }

    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return response.json().catch(() => ({}));
  }

  function normalizeProviderRecord(providerId, payload) {
    if (payload === true) {
      return {
        id: providerId,
        enabled: true,
        available: true,
        start_url: `/auth/${providerId}/start`,
      };
    }

    const record = payload && typeof payload === 'object' ? payload : {};
    const available = record.available !== false && record.enabled !== false;

    return {
      id: providerId,
      enabled: record.enabled !== false,
      available,
      hidden: record.hidden === true,
      reason: String(record.reason || record.message || '').trim(),
      start_url: record.start_url || record.startUrl || `/auth/${providerId}/start`,
      callback_url: record.callback_url || record.callbackUrl || `/auth/${providerId}/callback`,
      logout_url: record.logout_url || record.logoutUrl || null,
      missing_fields: Array.isArray(record.missing_fields) ? record.missing_fields : [],
      public_key: String(record.public_key || record.publicKey || '').trim(),
      token_url: String(record.token_url || record.tokenUrl || '').trim(),
    };
  }

  function normalizeProviderPayload(result) {
    const source = result?.data?.providers || result?.providers || result?.data || null;
    if (!source) return null;

    if (Array.isArray(source)) {
      return source.reduce((accumulator, item) => {
        const providerId = String(item?.id || item?.provider || '').trim().toLowerCase();
        if (!providerId) return accumulator;
        accumulator[providerId] = normalizeProviderRecord(providerId, item);
        return accumulator;
      }, {});
    }

    if (typeof source === 'object') {
      return Object.entries(source).reduce((accumulator, [providerId, item]) => {
        accumulator[String(providerId).trim().toLowerCase()] = normalizeProviderRecord(providerId, item);
        return accumulator;
      }, {});
    }

    return null;
  }

  async function fetchProviders() {
    const endpoints = [
      '/api/auth/providers',
      '/api/auth/social/providers',
      '/api/auth/oauth/providers',
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await apiGet(endpoint);
        const providers = normalizeProviderPayload(result);
        if (providers) return providers;
      } catch (error) {
        console.warn('[BSQ SocialAuth] provider fetch failed:', endpoint, error);
      }
    }

    return PROVIDERS.reduce((accumulator, provider) => {
      accumulator[provider.id] = normalizeProviderRecord(provider.id, {
        enabled: false,
        available: false,
        reason: '소셜 로그인 준비 중입니다.',
        start_url: provider.startPath,
      });
      return accumulator;
    }, {});
  }

  let providersCachePromise = null;
  let kakaoSdkPromise = null;
  let kakaoSdkInitKey = '';

  function resolveRoots(target) {
    if (!target) {
      return Array.from(document.querySelectorAll('[data-social-auth]'));
    }

    if (typeof target === 'string') {
      const matched = document.querySelector(target);
      return matched ? [matched] : [];
    }

    if (target && typeof target === 'object' && target.nodeType === 1) {
      return [target];
    }

    if (typeof target?.length === 'number') {
      return Array.from(target).filter(Boolean);
    }

    return [];
  }

  async function loadProviders() {
    if (!providersCachePromise) {
      providersCachePromise = fetchProviders();
    }

    return providersCachePromise;
  }

  function loadKakaoSdk() {
    if (kakaoSdkPromise) return kakaoSdkPromise;

    kakaoSdkPromise = new Promise((resolve) => {
      if (window.Kakao) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = KAKAO_SDK_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return kakaoSdkPromise;
  }

  async function ensureKakaoSdk(publicKey) {
    const key = String(publicKey || '').trim();
    if (!key) return false;

    const loaded = await loadKakaoSdk();
    if (!loaded || !window.Kakao) return false;

    try {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(key);
        kakaoSdkInitKey = key;
        return true;
      }

      if (kakaoSdkInitKey && kakaoSdkInitKey !== key) {
        return false;
      }

      kakaoSdkInitKey = key;
      return true;
    } catch {
      return false;
    }
  }

  async function startKakaoSdkAuthorize(providerRecord, context, returnTo) {
    const publicKey = String(providerRecord?.public_key || '').trim();
    if (!publicKey) return false;

    const ready = await ensureKakaoSdk(publicKey);
    if (!ready || !window.Kakao?.Auth?.authorize) return false;

    const startUrl = new URL(providerRecord?.start_url || '/auth/kakao/start', getBaseOrigin());
    startUrl.searchParams.set('flow', normalizeContext(context));
    if (returnTo) startUrl.searchParams.set('return_to', returnTo);
    startUrl.searchParams.set('format', 'json');

    const response = await fetch(startUrl.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) {
      throw new Error(String(payload?.message || payload?.error || 'kakao_sdk_bootstrap_failed'));
    }

    const data = payload.data || {};
    const redirectUri = String(data.redirect_uri || providerRecord?.callback_url || '/auth/kakao/callback').trim();
    const state = String(data.state || '').trim();
    const authorizeUrl = String(data.authorize_url || '').trim();

    try {
      window.Kakao.Auth.authorize({
        redirectUri,
        scope: KAKAO_SDK_SCOPE,
        state,
      });
      return true;
    } catch (error) {
      console.warn('[BSQ SocialAuth] Kakao SDK authorize failed, falling back to direct redirect:', error);
      if (authorizeUrl) {
        window.location.assign(authorizeUrl);
        return true;
      }
      return false;
    }
  }

  function normalizeContext(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'signup' || raw === 'recovery') return raw;
    return 'login';
  }

  function buildFallbackProviders() {
    return PROVIDERS.reduce((accumulator, provider) => {
      accumulator[provider.id] = normalizeProviderRecord(provider.id, {
        enabled: false,
        available: false,
        reason: '소셜 로그인 준비 중입니다.',
        start_url: provider.startPath,
      });
      return accumulator;
    }, {});
  }

  function getDefaultReturnPath(context) {
    if (context === 'signup') return '/login/signup.html';
    if (context === 'recovery') return '/login/find_account.html';
    return '/index.html';
  }

  function ensureRecoveryHash(returnTo, context) {
    const raw = String(returnTo || '').trim();
    if (!raw || context !== 'recovery') return raw;

    try {
      const url = new URL(raw, getBaseOrigin());
      if (!url.hash) url.hash = 'social';
      return url.toString();
    } catch {
      return raw.includes('#') ? raw : `${raw}#social`;
    }
  }

  function buildStartUrl(provider, context, returnTo) {
    const url = new URL(provider.startPath, getBaseOrigin());
    url.searchParams.set('flow', normalizeContext(context));
    if (returnTo) url.searchParams.set('return_to', returnTo);
    return url.toString();
  }

  function readQueryError() {
    const url = new URL(window.location.href);
    const provider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
    const code = String(
      url.searchParams.get('oauth_error') ||
      url.searchParams.get('social_error') ||
      url.searchParams.get('auth_error') ||
      '',
    ).trim();
    const message = String(
      url.searchParams.get('message') ||
      url.searchParams.get('error_description') ||
      '',
    ).trim();

    if (!provider && !code && !message) return null;
    return { provider, code, message };
  }

  function mapErrorMessage(info, context) {
    if (!info) return '';

    const providerLabel = PROVIDERS.find((item) => item.id === info.provider)?.label || '소셜 로그인';
    const mappedMessage = info.message || ERROR_MESSAGES[info.code] || ERROR_MESSAGES.provider_error;

    if (context === 'signup' && info.code === 'signup_required') {
      return '소셜 인증이 완료되었습니다. 아래 정보를 입력해 가입을 계속해 주세요.';
    }

    if (context === 'recovery' && info.code === 'account_not_found') {
      return '연결된 계정을 찾지 못했습니다. 이메일로 찾기를 이용해 주세요.';
    }

    return `${providerLabel}: ${mappedMessage}`;
  }

  function setBanner(message, type = 'info') {
    document.querySelectorAll('[data-auth-banner]').forEach((el) => {
      if (!message) {
        el.hidden = true;
        el.textContent = '';
        el.removeAttribute('data-state');
        el.classList.remove('is-info', 'is-warning', 'is-error');
        return;
      }

      el.hidden = false;
      el.dataset.state = type;
      el.classList.remove('is-info', 'is-warning', 'is-error');
      el.classList.add(`is-${type}`);
      el.textContent = message;
    });
  }

  function clearQueryParams() {
    const url = new URL(window.location.href);
    ['provider', 'oauth_error', 'social_error', 'auth_error', 'message', 'error_description'].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function setRootMessage(root, message, type = 'info') {
    const target = root.querySelector('[data-social-auth-message]');
    if (!target) return;

    if (!message) {
      target.hidden = true;
      target.textContent = '';
      target.removeAttribute('data-state');
      target.classList.remove('is-info', 'is-warning', 'is-error');
      return;
    }

    target.hidden = false;
    target.dataset.state = type;
    target.classList.remove('is-info', 'is-warning', 'is-error');
    target.classList.add(`is-${type}`);
    target.textContent = message;
  }

  function setRootHint(root, message) {
    const target = root.querySelector('[data-social-auth-hint]');
    if (!target) return;
    target.textContent = message || '';
  }

  function setLoading(root, isLoading) {
    root.classList.toggle('is-busy', Boolean(isLoading));
  }

  function buildProviderButton(provider, record, context, unavailableMode) {
    const isAvailable = record.available !== false && record.enabled !== false;
    if (unavailableMode === 'hide' && !isAvailable) {
      return null;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `social-auth-provider ${provider.toneClass}`;
    button.dataset.provider = provider.id;
    button.dataset.startUrl = record.start_url || provider.startPath;
    button.dataset.available = isAvailable ? 'true' : 'false';
    button.disabled = !isAvailable;
    button.innerHTML = `
      <span class="social-auth-provider__icon" aria-hidden="true">${provider.glyph}</span>
      <span class="social-auth-provider__content">
        <span class="social-auth-provider__label">${provider.label}</span>
        <span class="social-auth-provider__caption">${provider.action[context] || provider.action.login}</span>
      </span>
      <span class="social-auth-provider__state">${isAvailable ? '연결 가능' : '준비 중'}</span>
    `;

    if (!isAvailable && record.reason) {
      button.title = record.reason;
      button.setAttribute('aria-label', `${provider.action[context] || provider.action.login} - ${record.reason}`);
    }

    return button;
  }

  function resolveContextAndReturnTo(root) {
    const context = normalizeContext(root.dataset.socialContext || root.dataset.context || 'login');
    const explicitReturn = String(root.dataset.socialReturn || root.dataset.returnTo || '').trim();
    const returnTo = ensureRecoveryHash(explicitReturn || getDefaultReturnPath(context), context);
    return { context, returnTo };
  }

  function renderRoot(root, providers) {
    const list = root.querySelector('[data-social-auth-list]');
    if (!list) return { rendered: 0, available: 0 };

    const unavailableMode = String(root.dataset.unavailableMode || 'disable').toLowerCase();
    const { context, returnTo } = resolveContextAndReturnTo(root);

    list.replaceChildren();

    let rendered = 0;
    let available = 0;

    for (const provider of PROVIDERS) {
      const record = providers[provider.id] || normalizeProviderRecord(provider.id, {
        enabled: false,
        available: false,
        reason: '소셜 로그인 준비 중입니다.',
        start_url: provider.startPath,
      });

      const button = buildProviderButton(provider, record, context, unavailableMode);
      if (!button) continue;

      button.addEventListener('click', async () => {
        if (button.disabled) {
          setRootMessage(root, record.reason || '현재 사용할 수 없는 소셜 로그인입니다.', 'warning');
          return;
        }

        setLoading(root, true);
        setRootMessage(root, `${provider.label} 인증 화면으로 이동합니다.`, 'info');

        try {
          sessionStorage.setItem('bsq_social_last_provider', provider.id);
        } catch {
          // sessionStorage is optional
        }

        try {
          if (provider.id === 'kakao' && record.public_key) {
            const sdkStarted = await startKakaoSdkAuthorize(record, context, returnTo);
            if (sdkStarted) return;
          }
        } catch (error) {
          console.warn('[BSQ SocialAuth] Kakao SDK login failed, falling back to redirect:', error);
          setRootMessage(root, '카카오 인증을 이어가는 중입니다. 설정을 확인한 뒤 다시 시도해 주세요.', 'warning');
        }

        window.location.assign(buildStartUrl(provider, context, returnTo));
      });

      list.appendChild(button);
      rendered += 1;
      if (record.available !== false && record.enabled !== false) available += 1;
    }

    return { rendered, available };
  }

  async function initRoot(root) {
    const { context } = resolveContextAndReturnTo(root);
    const queryError = readQueryError();

    if (queryError) {
      const message = mapErrorMessage(queryError, context);
      const state = queryError.code === 'signup_required' ? 'info' : (queryError.code === 'account_not_found' ? 'warning' : 'error');
      setBanner(message, state);
      setRootMessage(root, message, state);
      clearQueryParams();
    }

    const fallbackProviders = buildFallbackProviders();
    const { rendered, available } = renderRoot(root, fallbackProviders);

    if (!rendered) {
      root.hidden = true;
      return;
    }

    if (available > 0) {
      if (context === 'signup') {
        setRootHint(root, '카카오, 네이버, 구글 인증을 마친 뒤 아래 가입 정보를 입력하세요.');
      } else if (context === 'recovery') {
        setRootHint(root, '소셜 계정으로 본인 확인 후 연결된 계정 복구를 진행할 수 있습니다.');
      } else {
        setRootHint(root, '카카오, 네이버, 구글 계정으로 빠르게 시작할 수 있습니다.');
      }
    } else {
      setRootHint(root, '현재는 준비 중입니다. 이메일 로그인 또는 기존 계정 복구를 이용해 주세요.');
      if (!queryError) {
        setRootMessage(root, '소셜 로그인 설정을 확인하는 중입니다.', 'warning');
      }
    }

    void loadProviders()
      .then((resolvedProviders) => {
        if (!root.isConnected) return;
        renderRoot(root, resolvedProviders || fallbackProviders);
      })
      .catch(() => {
        // keep fallback buttons visible
      });
  }

  async function init(options = {}) {
    const roots = resolveRoots(options.root);
    if (!roots.length) return;

    for (const root of roots) {
      await initRoot(root);
    }
  }

  window.BSQSocialAuth = {
    init,
    refresh: async (options = {}) => {
      providersCachePromise = null;
      return init(options);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
})();
