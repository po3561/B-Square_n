(function () {
  'use strict';

  const PROVIDERS = [
    {
      id: 'kakao',
      label: '카카오',
      actionLabel: '카카오로 계속하기',
      startPath: '/auth/kakao/start',
      toneClass: 'social-btn--kakao',
      glyph: 'K',
    },
    {
      id: 'naver',
      label: '네이버',
      actionLabel: '네이버로 계속하기',
      startPath: '/auth/naver/start',
      toneClass: 'social-btn--naver',
      glyph: 'N',
    },
    {
      id: 'google',
      label: '구글',
      actionLabel: '구글로 계속하기',
      startPath: '/auth/google/start',
      toneClass: 'social-btn--google',
      glyph: 'G',
    },
  ];

  const ERROR_MESSAGES = {
    provider_unavailable: '소셜 로그인 환경이 아직 준비되지 않았습니다.',
    callback_missing_code: '소셜 로그인 응답이 올바르지 않습니다.',
    state_mismatch: '보안 검증에 실패했습니다. 다시 시도해주세요.',
    state_expired: '로그인 시도가 만료되었습니다. 다시 시도해주세요.',
    access_denied: '로그인이 취소되었습니다.',
    consent_required: '계정 연결이 필요합니다. 다시 시도해주세요.',
    login_required: '계정 선택이 필요합니다. 다시 시도해주세요.',
    token_exchange_failed: '인증 서버와의 연결에 실패했습니다.',
    user_info_failed: '사용자 정보를 불러오지 못했습니다.',
    session_create_failed: '세션 생성에 실패했습니다.',
    oauth_failed: '소셜 로그인 처리에 실패했습니다.',
    provider_error: '소셜 로그인 중 오류가 발생했습니다.',
  };

  function getBaseOrigin() {
    const candidates = [
      window.location.origin && window.location.origin !== 'null' ? window.location.origin : '',
      window.BSQ?.apiBaseUrl || '',
      document.querySelector('meta[name="bsq-api-base"]')?.content || '',
    ];

    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (!raw) continue;
      try {
        return new URL(raw).origin;
      } catch {
        // keep trying
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
    };
  }

  function normalizeProviderPayload(result) {
    const source = result?.data?.providers || result?.providers || result?.data || null;
    if (!source) return null;

    if (Array.isArray(source)) {
      return source.reduce((acc, item) => {
        const providerId = String(item?.id || item?.provider || '').trim().toLowerCase();
        if (!providerId) return acc;
        acc[providerId] = normalizeProviderRecord(providerId, item);
        return acc;
      }, {});
    }

    if (typeof source === 'object') {
      return Object.entries(source).reduce((acc, [providerId, item]) => {
        acc[String(providerId).trim().toLowerCase()] = normalizeProviderRecord(providerId, item);
        return acc;
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
        console.warn('[BSQ SocialAuth] provider config fetch failed:', endpoint, error);
      }
    }

    return PROVIDERS.reduce((acc, provider) => {
      acc[provider.id] = normalizeProviderRecord(provider.id, {
        enabled: false,
        available: false,
        reason: '소셜 로그인 준비 중입니다.',
        start_url: provider.startPath,
      });
      return acc;
    }, {});
  }

  let providersCachePromise = null;

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

  function mapErrorMessage(info) {
    if (!info) return '';
    const providerLabel = PROVIDERS.find((item) => item.id === info.provider)?.label || '소셜 로그인';
    const mapped = info.message || ERROR_MESSAGES[info.code] || ERROR_MESSAGES.provider_error;
    return `${providerLabel}: ${mapped}`;
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

  function buildProviderButton(provider, record, unavailableMode) {
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
        <span class="social-auth-provider__caption">${provider.actionLabel}</span>
      </span>
      <span class="social-auth-provider__state">${isAvailable ? '연결 가능' : '준비 중'}</span>
    `;

    if (!isAvailable && record.reason) {
      button.title = record.reason;
      button.setAttribute('aria-label', `${provider.actionLabel} - ${record.reason}`);
    }

    return button;
  }

  function renderRoot(root, providers) {
    const list = root.querySelector('[data-social-auth-list]');
    if (!list) return { rendered: 0, available: 0 };

    const unavailableMode = String(root.dataset.unavailableMode || 'disable').toLowerCase();
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

      const button = buildProviderButton(provider, record, unavailableMode);
      if (!button) continue;

      button.addEventListener('click', () => {
        if (button.disabled) {
          setRootMessage(root, record.reason || '현재 사용할 수 없는 소셜 로그인입니다.', 'warning');
          return;
        }

        setRootMessage(root, `${provider.label} 로그인으로 이동합니다.`, 'info');
        try {
          sessionStorage.setItem('bsq_social_last_provider', provider.id);
        } catch {
          // sessionStorage is optional
        }

        window.location.assign(toAbsoluteUrl(button.dataset.startUrl || provider.startPath));
      });

      list.appendChild(button);
      rendered += 1;
      if (record.available !== false && record.enabled !== false) available += 1;
    }

    return { rendered, available };
  }

  async function initRoot(root, providers) {
    const queryError = readQueryError();
    if (queryError) {
      setBanner(mapErrorMessage(queryError), 'error');
      setRootMessage(root, mapErrorMessage(queryError), 'error');
      clearQueryParams();
    }

    const { rendered, available } = renderRoot(root, providers);

    if (!rendered) {
      root.hidden = true;
      return;
    }

    if (available > 0) {
      setRootHint(root, '카카오, 네이버, 구글 중 사용 가능한 계정으로 바로 시작할 수 있습니다.');
    } else {
      setRootHint(root, '현재는 준비 중입니다. 일반 로그인은 그대로 사용할 수 있습니다.');
      if (!queryError) {
        setRootMessage(root, '소셜 로그인 환경을 확인하는 중입니다.', 'warning');
      }
    }
  }

  async function init(options = {}) {
    const roots = resolveRoots(options.root);
    if (!roots.length) return;

    const providers = await loadProviders();

    for (const root of roots) {
      await initRoot(root, providers);
    }
  }

  async function bootstrap() {
    return init();
  }

  window.BSQSocialAuth = {
    init,
    refresh: async (options = {}) => {
      providersCachePromise = null;
      return init(options);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    void bootstrap();
  }
})();
