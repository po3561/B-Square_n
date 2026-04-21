// bsq_server.js - B-Square 브랜딩 공통 쉘 (클라우드플레어 D1 API 연동)
// Firebase/Supabase 없이 직접 Cloudflare D1 API 연동
// 사용 방법: window.BSQ.api('/api/classes'), await window.BSQ.shellReady / await window.BSQ.ready (auth)
(function () {
    'use strict';

    // ---- 전역 변수 ----
    let _session = null;     // 세션 정보: { user: { id, email, name, ... }, expires_at }
    let _shellReadyResolve = null;
    const shellReadyPromise = new Promise(resolve => { _shellReadyResolve = resolve; });
    let _shellReadyResolved = false;
    let _readyResolve = null;
    const readyPromise = new Promise(resolve => { _readyResolve = resolve; });
    let _readyResolved = false;
    let _authReadyPromise = null;
    let _siteSettingsPromise = null;
    let _sessionBootstrapPromise = null;
    const OPERATOR_MODE_KEY = 'bsq_operator_view_mode';
    const OPERATOR_GHOST_TOKEN = 'OPERATOR_GHOST';
    const THEME_STORAGE_KEY = 'bsq_theme';
    const LANGUAGE_STORAGE_KEY = 'bsq_language';
    const SUPPORTED_LANGUAGES = new Set(['ko', 'en', 'ja', 'zh-CN']);
    const LANGUAGE_ALIASES = new Map([
        ['zh', 'zh-CN'],
        ['zh-cn', 'zh-CN'],
        ['cn', 'zh-CN'],
        ['ko-kr', 'ko'],
        ['en-us', 'en'],
        ['en-gb', 'en'],
        ['ja-jp', 'ja'],
    ]);
    // ==================================================
    // API 베이스 URL 자동 감지 및 자격 서버 연동
    // ==================================================
    const WRANGLER_PORT = 8788;
    const _currentPort = parseInt(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
    const _isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const _isWrangler = _currentPort === WRANGLER_PORT;
    const LOCAL_FUNCTIONS_ORIGIN = 'http://127.0.0.1:8788';

    const _hasHttpOrigin = /^https?:$/i.test(window.location.protocol);
    const _runtimeOrigin = _hasHttpOrigin ? window.location.origin : '';

    function normalizeApiBase(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        try {
            return new URL(raw, window.location.href).origin;
        } catch {
            return '';
        }
    }

    function isDebugRuntime() {
        return !!window.__BSQ_DEV_MODE__ || _isWrangler || _isLocalHost || window.location.hostname.endsWith('.localhost');
    }

    function devLog(level, ...args) {
        if (!isDebugRuntime()) return;
        const fn = typeof console?.[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
        fn(...args);
    }

    window.__BSQ_DEV_LOG__ = devLog;

    const EXPLICIT_API_BASE = normalizeApiBase(window.__BSQ_API_BASE__);
    function resolveApiBaseCandidates() {
        if (EXPLICIT_API_BASE) return [EXPLICIT_API_BASE];

        const candidates = [];
        const pushCandidate = (value) => {
            const raw = String(value || '').trim();
            if (!candidates.includes(raw)) candidates.push(raw);
        };

        if (_isWrangler) {
            pushCandidate('');
        } else if (_isLocalHost) {
            pushCandidate(window.location.origin);
            pushCandidate(LOCAL_FUNCTIONS_ORIGIN);
        } else if (_hasHttpOrigin) {
            pushCandidate(window.location.origin);
        } else {
            pushCandidate(LOCAL_FUNCTIONS_ORIGIN);
        }

        return candidates;
    }

    const API_BASE_CANDIDATES = resolveApiBaseCandidates();
    const PRIMARY_API_BASE = API_BASE_CANDIDATES[0] || '';
    const PUBLIC_API_BASE = PRIMARY_API_BASE || (_hasHttpOrigin ? window.location.origin : '');
    const API_BASE_LABEL = EXPLICIT_API_BASE ? 'explicit' : (_isWrangler ? 'wrangler-dev' : (_isLocalHost ? 'local-fallback' : 'same-origin'));

    function buildRequestUrl(endpoint, baseUrl = PRIMARY_API_BASE) {
        if (!baseUrl) return endpoint;

        try {
            return new URL(endpoint, baseUrl).toString();
        } catch {
            return endpoint;
        }
    }

    function normalizeRequestBody(value) {
        if (value == null) return value;
        if (typeof value === 'string') return value;
        if (typeof FormData !== 'undefined' && value instanceof FormData) return value;
        if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
        if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return value;
        if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value;
        if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(value)) return value;
        if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return value;
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
    }

    const REQUEST_TIMEOUT_MS = 20000;

    // API 연결 상태 배너를 제거했습니다. (사용자 요청)

    // ==================================================
    // D1 API 호출 헬퍼 (Standard V2)
    // ==================================================

    // D1 API 호출 헬퍼 (Standard V2)
    async function apiCall(endpoint, methodOrOptions = 'GET', body = null, options = {}) {
        let method = 'GET';
        let finalOptions = {};

        if (typeof methodOrOptions === 'object') {
            finalOptions = methodOrOptions;
            method = (finalOptions.method || 'GET').toUpperCase();
        } else {
            method = methodOrOptions.toUpperCase();
            finalOptions = options;
        }

        if (body != null && finalOptions.body == null) {
            finalOptions.body = body;
        }
        if (finalOptions.body != null) {
            finalOptions.body = normalizeRequestBody(finalOptions.body);
        }

        const shouldBustCache = finalOptions.cacheBust !== false;
        delete finalOptions.cacheBust;

        const isKnownMissingMessage = (message) => /message not found/i.test(String(message || ''));
        const candidateBases = (method === 'GET' ? API_BASE_CANDIDATES : [PRIMARY_API_BASE]).filter((value, index, self) => self.indexOf(value) === index);
        if (!candidateBases.length) candidateBases.push('');
        const triedBases = [];

        const performFetch = async (requestUrl) => {
            const token = localStorage.getItem('bsq_token');
            const bodyValue = finalOptions.body;
            const isFormData = typeof FormData !== 'undefined' && bodyValue instanceof FormData;
            const isBinaryBody =
                (typeof Blob !== 'undefined' && bodyValue instanceof Blob) ||
                (typeof URLSearchParams !== 'undefined' && bodyValue instanceof URLSearchParams) ||
                (typeof ArrayBuffer !== 'undefined' && bodyValue instanceof ArrayBuffer) ||
                (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(bodyValue)) ||
                (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream);
            const defaultHeaders = (!bodyValue || isFormData || isBinaryBody) ? {} : { 'Content-Type': 'application/json' };
            const headers = { ...defaultHeaders, ...(finalOptions.headers || {}) };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            if (method === 'GET' && shouldBustCache) {
                const connector = requestUrl.includes('?') ? '&' : '?';
                requestUrl += `${connector}t=${Date.now()}`;
            }

            devLog('log', `[BSQ API] ${method} ${requestUrl}`);
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            let timedOut = false;
            const timeoutId = controller ? window.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, REQUEST_TIMEOUT_MS) : null;

            try {
                return await fetch(requestUrl, {
                    ...finalOptions,
                    method,
                    headers,
                    credentials: 'include',
                    signal: controller ? controller.signal : undefined,
                });
            } catch (error) {
                if (timedOut || error?.name === 'AbortError') {
                    const timeoutError = new Error(`Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`);
                    timeoutError.__bsqTimedOut = true;
                    throw timeoutError;
                }
                throw error;
            } finally {
                if (timeoutId) window.clearTimeout(timeoutId);
            }
        };

        const buildFailureResponse = (error, requestUrl, baseUrl, extra = {}) => {
            const errorMessage = String(error?.message || error || 'Unknown error');
            const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : null;
            const baseLabel = baseUrl || 'same-origin';
            const isQuietMissing = !!error?.__bsqSilent || isKnownMissingMessage(errorMessage);
            const shouldAlert = method !== 'GET' || window.__BSQ_SHOW_API_ALERTS__ === true;
            const msg = errorMessage.includes('Failed to fetch')
                ? `API connection failed at ${baseLabel}`
                : `[BSQ API] ${errorMessage}`;

            if (shouldAlert && !isQuietMissing) {
                showOnScreenAlert(msg);
            }

            if (isQuietMissing || !shouldAlert) {
                devLog('warn', msg, { endpoint, base: baseLabel, url: requestUrl, status, ...extra });
            } else {
                devLog('error', `[BSQ API] ${endpoint} fetch error:`, error, { endpoint, base: baseLabel, url: requestUrl, status, ...extra });
            }

            return {
                success: false,
                error: errorMessage,
                status,
                timed_out: !!error?.__bsqTimedOut,
                network_error: errorMessage.includes('Failed to fetch'),
                tried_bases: triedBases.slice(),
                url: requestUrl,
            };
        };

        const shouldRetryHttpError = (response, contentType, errorMessage) => {
            if (method !== 'GET') return false;
            if (response.status >= 500) return true;
            if (response.status === 405 || response.status === 502 || response.status === 503 || response.status === 504) return true;
            if (response.status === 404 && !contentType.includes('application/json')) return true;
            if (response.status === 404 && /<!doctype html>|<html/i.test(errorMessage)) return true;
            return false;
        };

        for (let index = 0; index < candidateBases.length; index += 1) {
            const baseUrl = candidateBases[index];
            const requestUrl = buildRequestUrl(endpoint, baseUrl);
            triedBases.push(baseUrl || 'same-origin');

            try {
                const response = await performFetch(requestUrl);

                if (!response.ok) {
                    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                    const errorText = await response.text();
                    let errMsg = `HTTP ${response.status}: ${response.statusText}`;

                    if (response.status === 413) {
                        errMsg = 'Payload Too Large. Please reduce the size of your request.';
                    } else if (errorText) {
                        try {
                            const errJson = JSON.parse(errorText);
                            errMsg = [errJson.error, errJson.detail].filter(Boolean).join(' / ') || errMsg;
                        } catch (e) {
                            errMsg = errorText.substring(0, 180);
                        }
                    }

                    const error = new Error(errMsg);
                    error.status = response.status;
                    error.statusText = response.statusText;
                    error.responseBody = errorText ? errorText.substring(0, 256) : '';
                    if (response.status === 404 && isKnownMissingMessage(errMsg)) {
                        error.__bsqSilent = true;
                    }

                    const hasFallback = index < candidateBases.length - 1 && method === 'GET';
                    if (hasFallback && shouldRetryHttpError(response, contentType, errMsg)) {
                        devLog('warn', '[BSQ API] HTTP fallback retry:', {
                            endpoint,
                            base: baseUrl || 'same-origin',
                            nextBase: candidateBases[index + 1] || 'same-origin',
                            status: response.status,
                        });
                        continue;
                    }

                    return buildFailureResponse(error, requestUrl, baseUrl);
                }

                let result;
                try {
                    result = await response.json();
                } catch (error) {
                    const hasFallback = index < candidateBases.length - 1 && method === 'GET';
                    if (hasFallback) {
                        devLog('warn', '[BSQ API] JSON parse fallback retry:', {
                            endpoint,
                            base: baseUrl || 'same-origin',
                            nextBase: candidateBases[index + 1] || 'same-origin',
                            error: error?.message || error,
                        });
                        continue;
                    }
                    return buildFailureResponse(error, requestUrl, baseUrl);
                }

                if (!result.success) {
                    devLog('warn', `[BSQ API] ${endpoint} warning:`, result.error, result.detail || '');
                    if (method !== 'GET') {
                        const warningText = [result.error, result.detail].filter(Boolean).join(' / ') || 'Request failed.';
                        if ((method !== 'GET' || window.__BSQ_SHOW_API_ALERTS__ === true) && !isKnownMissingMessage(warningText)) {
                            showOnScreenAlert(`[API] ${warningText}`);
                        }
                    }
                } else if (result.data) {
                    result.data = fixImageUrls(result.data);
                }

                return result;
            } catch (error) {
                const errorMessage = String(error?.message || error || 'Unknown error');
                const hasFallback = index < candidateBases.length - 1 && method === 'GET';
                if (hasFallback && (errorMessage.includes('Failed to fetch') || error?.__bsqTimedOut)) {
                    devLog('warn', '[BSQ API] network fallback retry:', {
                        endpoint,
                        base: baseUrl || 'same-origin',
                        nextBase: candidateBases[index + 1] || 'same-origin',
                        error: errorMessage,
                    });
                    continue;
                }

                return buildFailureResponse(error, requestUrl, baseUrl, {
                    network_error: errorMessage.includes('Failed to fetch'),
                });
            }
        }

        const finalError = new Error(`Request failed for ${endpoint}`);
        return buildFailureResponse(finalError, buildRequestUrl(endpoint), candidateBases[0] || '', {
            exhausted_bases: triedBases.slice(),
        });
    }

    function ensureSiteSettingsPromise() {
        if (_siteSettingsPromise) return _siteSettingsPromise;

        // Fetch once and share the result across header / shell / SEO updates.
        _siteSettingsPromise = apiCall('/api/site-settings')
            .then((result) => {
                const settings = result?.success ? (result.data || null) : null;
                window.__BSQ_SITE_SETTINGS__ = settings || null;
                return settings || null;
            })
            .catch((error) => {
                devLog('warn', '[BSQ Server] Site settings prefetch failed:', error);
                return window.__BSQ_SITE_SETTINGS__ || null;
            });

        return _siteSettingsPromise;
    }

    function refreshSiteSettingsCache() {
        _siteSettingsPromise = null;
        window.__BSQ_SITE_SETTINGS__ = null;
        return ensureSiteSettingsPromise();
    }

    function emitSessionEvent(reason = 'update') {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent('bsq_session', {
            detail: {
                reason,
                session: _session,
                user: _session?.user || null,
                timestamp: Date.now(),
            },
        }));
    }

    function normalizeLanguage(value) {
        const candidate = normalizeRequestBody(value);
        const raw = String(candidate || '').trim();
        if (!raw) return '';

        const lower = raw.toLowerCase();
        const canonical = LANGUAGE_ALIASES.get(lower) || raw;
        if (SUPPORTED_LANGUAGES.has(canonical)) return canonical;
        if (SUPPORTED_LANGUAGES.has(lower)) return lower;
        return '';
    }

    function resolveThemeName(value) {
        const theme = String(value || '').trim().toLowerCase();
        if (theme === 'light' || theme === 'dark') return theme;
        if (theme === 'system') {
            try {
                if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
                    return 'light';
                }
            } catch {
                // ignore system theme detection failures
            }
            return 'dark';
        }
        return '';
    }

    function applyPreferences({ theme, language, persistStorage = true } = {}) {
        if (typeof document === 'undefined') return null;

        const themeSync = window.__BSQ_THEME_SYNC__ || null;
        const normalizeThemeValue = themeSync?.normalizeTheme
            ? (value) => themeSync.normalizeTheme(value)
            : (value) => resolveThemeName(value) || '';
        const normalizeLanguageValue = themeSync?.normalizeLanguage
            ? (value) => themeSync.normalizeLanguage(value)
            : (value) => normalizeLanguage(value);
        const root = document.documentElement;
        const storedThemeRaw = localStorage.getItem(THEME_STORAGE_KEY);
        const hasStoredTheme = storedThemeRaw !== null && String(storedThemeRaw).trim() !== '';
        const storedTheme = hasStoredTheme ? storedThemeRaw : '';
        const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'ko';

        const requestedTheme = theme === undefined || theme === null ? '' : String(theme).trim().toLowerCase();
        const requestedLanguage = language === undefined || language === null ? '' : String(language).trim();

        const languageValue = normalizeLanguageValue(requestedLanguage) || normalizeLanguageValue(storedLanguage) || 'ko';
        const rootTheme = normalizeThemeValue(root.dataset.theme || document.body?.dataset.theme || '') || '';
        const themeValue = normalizeThemeValue(requestedTheme) || normalizeThemeValue(storedTheme) || rootTheme || 'light';

        if (themeSync?.applyAndBroadcastPreferenceState) {
            const snapshot = themeSync.applyAndBroadcastPreferenceState(themeValue, languageValue, {
                persistStorage,
            });
            window.__BSQ_PREFERENCES__ = snapshot;
            return snapshot;
        }

        root.dataset.theme = themeValue;
        root.dataset.language = languageValue;
        root.lang = languageValue;

        if (document.body) {
            document.body.dataset.theme = themeValue;
            document.body.dataset.language = languageValue;
        }

        if (persistStorage) {
            if (requestedTheme || hasStoredTheme) localStorage.setItem(THEME_STORAGE_KEY, themeValue);
            if (requestedLanguage) localStorage.setItem(LANGUAGE_STORAGE_KEY, languageValue);
        }

        window.__BSQ_PREFERENCES__ = {
            theme: themeValue,
            resolvedTheme: themeValue,
            language: languageValue,
            updatedAt: Date.now(),
        };

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('bsq_preferences', {
                detail: window.__BSQ_PREFERENCES__,
            }));
        }

        return window.__BSQ_PREFERENCES__;
    }

    function fixImageUrls(data) {
        if (!data) return data;
        if (typeof data === 'string') {
            // Base64 이미지이거나 외부 URL은 처리하지 않음
            if (data.startsWith('data:')) return data;
            // 외부 URL은 처리하지 않음
            if (data.startsWith('http')) return data;

            // uploads/ 또는 assets/ 경로로 시작하는 경우에만 현재 오리진을 붙여줌 (CDN 사용 시)
            const cleanPath = data.startsWith('/') ? data : '/' + data;
            if (cleanPath.startsWith('/uploads/') || cleanPath.startsWith('/assets/')) {
                return _runtimeOrigin + cleanPath;
            }
            return data;
        }
        if (Array.isArray(data)) {
            return data.map(item => fixImageUrls(item));
        }
        if (typeof data === 'object') {
            const fixed = {};
            for (const key in data) {
                fixed[key] = fixImageUrls(data[key]);
            }
            return fixed;
        }
        return data;
    }

    // 화면에 알림 표시 (성공/실패 알림)
    function showOnScreenAlert(msg, type = 'error') {
        if (typeof document === 'undefined') return;
        const alertBox = document.createElement('div');
        const palette = {
            success: {
                bg: 'rgba(10, 78, 60, 0.94)',
                border: 'rgba(74, 222, 128, 0.26)',
                text: '#effcf4',
            },
            warning: {
                bg: 'rgba(92, 56, 10, 0.94)',
                border: 'rgba(251, 191, 36, 0.28)',
                text: '#fff8e7',
            },
            error: {
                bg: 'rgba(71, 18, 28, 0.96)',
                border: 'rgba(248, 113, 113, 0.30)',
                text: '#fff1f2',
            },
            info: {
                bg: 'rgba(17, 24, 39, 0.94)',
                border: 'rgba(148, 163, 184, 0.22)',
                text: '#e2e8f0',
            },
        };
        const style = palette[type] || palette.error;
        alertBox.style.cssText = `
            position: fixed;
            top: calc(1rem + env(safe-area-inset-top, 0px));
            left: 50%;
            transform: translateX(-50%);
            max-width: min(92vw, 460px);
            padding: 0.88rem 1rem;
            border-radius: 16px;
            background: ${style.bg};
            color: ${style.text};
            border: 1px solid ${style.border};
            font-size: 0.92rem;
            line-height: 1.45;
            z-index: 1000000;
            box-shadow: 0 18px 40px rgba(0,0,0,0.22);
            text-align: left;
            white-space: pre-wrap;
            transition: transform 0.24s ease, opacity 0.24s ease;
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
        `;
        alertBox.setAttribute('role', 'status');
        alertBox.setAttribute('aria-live', 'polite');
        alertBox.innerText = msg;
        const mountTarget = document.body || document.documentElement;
        mountTarget.appendChild(alertBox);
        setTimeout(() => {
            alertBox.style.opacity = '0';
            alertBox.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => alertBox.remove(), 300);
        }, type === 'success' ? 2000 : 5000);
    }

    function getOperatorFallbackUser() {
        const fallbackUser = {
            id: OPERATOR_GHOST_TOKEN,
            email: 'operator@b-square.kr',
            name: '운영자',
            role: 'super_admin',
            profile_image_url: '/assets/default-avatar.svg',
        };

        try {
            const localUserStr = localStorage.getItem('bsq_user');
            if (!localUserStr) return fallbackUser;

            const localUser = JSON.parse(localUserStr);
            if (!localUser || localUser.id !== OPERATOR_GHOST_TOKEN) return fallbackUser;

            return {
                ...fallbackUser,
                ...localUser,
                id: OPERATOR_GHOST_TOKEN,
                role: 'super_admin',
                profile_image_url: localUser.profile_image_url || fallbackUser.profile_image_url,
            };
        } catch {
            return fallbackUser;
        }
    }

    function isOperatorEligibleRole(role) {
        const value = String(role || '').trim().toLowerCase();
        return value === 'operator' || value === 'admin' || value === 'super_admin';
    }

    function setOperatorViewGlobals(user) {
        window.__BSQ_DEV_MODE__ = true;
        window.__BSQ_OPERATOR_PROFILE__ = {
            ...(user || {}),
            profile_image_url: user?.profile_image_url || '/assets/default-avatar.svg',
        };
    }

    function clearOperatorViewGlobals() {
        window.__BSQ_DEV_MODE__ = false;
        delete window.__BSQ_OPERATOR_PROFILE__;
    }

    function seedSessionFromStorage() {
        try {
            const operatorModeRequested = localStorage.getItem(OPERATOR_MODE_KEY) === '1';
            const token = localStorage.getItem('bsq_token');
            const storedUserStr = localStorage.getItem('bsq_user');
            const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;

            if (!token && !operatorModeRequested) return;

            if (token === OPERATOR_GHOST_TOKEN || operatorModeRequested) {
                const fallbackUser = getOperatorFallbackUser();
                _session = { user: fallbackUser };
                setOperatorViewGlobals(fallbackUser);
                return;
            }

            if (storedUser && storedUser.id) {
                _session = { user: storedUser };
            }
        } catch {
            // Ignore storage bootstrap errors and fall back to network validation.
        }
    }

    async function runCheckSession() {
        const operatorModeRequested = localStorage.getItem(OPERATOR_MODE_KEY) === '1';
        if (operatorModeRequested && !localStorage.getItem('bsq_token')) {
            localStorage.setItem('bsq_token', OPERATOR_GHOST_TOKEN);
            if (!localStorage.getItem('bsq_user')) {
                localStorage.setItem('bsq_user', JSON.stringify(getOperatorFallbackUser()));
            }
        }

        const result = await apiCall('/api/auth/session');
        const session = result?.data?.session || null;

        if (result.success && session?.user) {
            _session = session;
            devLog('log', '[BSQ Server] 로그인 유지 확인 완료:', _session.user.email);
            localStorage.setItem('bsq_user', JSON.stringify(_session.user));

            const sessionUser = _session.user;
            const operatorModeActive = operatorModeRequested && isOperatorEligibleRole(sessionUser.role);

            if (operatorModeActive) {
                setOperatorViewGlobals(sessionUser);
            } else {
                clearOperatorViewGlobals();
                if (operatorModeRequested && !isOperatorEligibleRole(sessionUser.role)) {
                    localStorage.removeItem(OPERATOR_MODE_KEY);
                }
            }
        } else if (result.success) {
            const ghostToken = localStorage.getItem('bsq_token') === OPERATOR_GHOST_TOKEN;
            if (operatorModeRequested && ghostToken) {
                const fallbackUser = getOperatorFallbackUser();
                _session = { user: fallbackUser };
                localStorage.setItem('bsq_user', JSON.stringify(fallbackUser));
                setOperatorViewGlobals(fallbackUser);
            } else {
                localStorage.removeItem('bsq_token');
                localStorage.removeItem('bsq_user');
                if (operatorModeRequested) {
                    localStorage.removeItem(OPERATOR_MODE_KEY);
                }
                clearOperatorViewGlobals();
                _session = null;
            }
        } else {
            const ghostToken = localStorage.getItem('bsq_token') === OPERATOR_GHOST_TOKEN;
            if (operatorModeRequested && ghostToken) {
                const fallbackUser = getOperatorFallbackUser();
                _session = { user: fallbackUser };
                localStorage.setItem('bsq_user', JSON.stringify(fallbackUser));
                setOperatorViewGlobals(fallbackUser);
            } else {
                clearOperatorViewGlobals();
                _session = null;
                if (operatorModeRequested && !ghostToken) {
                    localStorage.removeItem(OPERATOR_MODE_KEY);
                }
            }
        }

        updateConnectionHub();
        const hasExplicitTheme = localStorage.getItem(THEME_STORAGE_KEY) !== null;
        applyPreferences({
            theme: hasExplicitTheme ? undefined : (_session?.user?.preferred_theme || undefined),
            language: _session?.user?.preferred_language || undefined,
        });
        emitSessionEvent('session-check');
        return _session;
    }

    async function runLogout() {
        const result = await apiCall('/api/auth/session', { method: 'DELETE' });
        localStorage.removeItem('bsq_token');
        localStorage.removeItem('bsq_user');
        localStorage.removeItem(OPERATOR_MODE_KEY);
        clearOperatorViewGlobals();
        _session = null;
        updateConnectionHub();
        applyPreferences();
        emitSessionEvent('logout');
        return result;
    }

    // ==================================================
    // 세션 관리 및 인증 관련
    // ==================================================
    async function checkSession() {
        return await runCheckSession();
    }

    function ensureSessionBootstrapPromise() {
        if (_sessionBootstrapPromise) return _sessionBootstrapPromise;
        _sessionBootstrapPromise = runCheckSession();
        return _sessionBootstrapPromise;
    }

    function resolveShellReady() {
        if (_shellReadyResolved) return;
        _shellReadyResolved = true;
        _shellReadyResolve({
            session: _session,
            userId: _session?.user?.id || null,
            userProfile: _session?.user || null
        });
    }

    function resolveAuthReady() {
        if (_readyResolved) return;
        _readyResolved = true;
        _readyResolve({
            session: _session,
            userId: _session?.user?.id || null,
            userProfile: _session?.user || null
        });
    }

    function ensureAuthReadyPromise() {
        if (_authReadyPromise) return _authReadyPromise;
        const bootstrap = ensureSessionBootstrapPromise();
        _authReadyPromise = bootstrap
            .catch((error) => {
            devLog('warn', '[BSQ Server] Session bootstrap failed:', error);
            })
            .finally(() => {
                resolveAuthReady();
            });
        return _authReadyPromise;
    }

    // ==================================================
    // [개발용] 연결 상태 허브 (Connection Hub) UI
    // ==================================================
    function updateConnectionHub() {
        if (typeof document === 'undefined') return;
        if (window.__BSQ_SHOW_CONNECTION_HUB__ !== true) {
            document.getElementById('bsqConnectionHub')?.remove();
            return;
        }
        let hub = document.getElementById('bsqConnectionHub');
        if (!hub) {
            hub = document.createElement('div');
            hub.id = 'bsqConnectionHub';
            hub.style.cssText = `
                position: fixed; bottom: 15px; right: 15px; z-index: 999999;
                background: rgba(10, 10, 20, 0.85); backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
                padding: 10px 14px; color: white; font-size: 11px; font-family: sans-serif;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 4px;
                transition: all 0.3s ease; opacity: 0.8; cursor: pointer;
            `;
            hub.onclick = () => { hub.style.opacity = hub.style.opacity === '1' ? '0.4' : '1'; };
            const mountTarget = document.body || document.documentElement;
            mountTarget.appendChild(hub);
        }

        const envText = _isWrangler ? '<span style="color:#ffa502">LOCAL (Wrangler)</span>' : '<span style="color:#2ed573">PRODUCTION (Remote)</span>';
        const userText = _session ? `<span style="color:#70a1ff">${_session.user.name || 'User'}</span>` : '<span style="color:#ff4757">Guest</span>';

        hub.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <div style="width:6px; height:6px; border-radius:50%; background:${_session ? '#2ed573' : '#ff4757'};"></div>
                <b>BSQ NETWORK</b>
            </div>
            <div style="opacity:0.7;">DB: ${envText}</div>
            <div style="opacity:0.7;">User: ${userText}</div>
        `;
    }

    // ==================================================
    // 초기화
    // ==================================================
    async function init() {
        if (!_isWrangler) {
            devLog('log', `[BSQ Server] Booting API shell with base ${API_BASE_LABEL}`);
        }

        applyPreferences();

        resolveShellReady();
        void ensureAuthReadyPromise();

        devLog('log', '[BSQ Server] Shell ready; session bootstrap continues in background', {
            loggedIn: !!_session,
            userId: _session?.user?.id || 'none'
        });

        void applySiteSettings();
    }

    // ==================================================
    // 사이트 설정 및 D1 API 연동
    // ==================================================
    async function applySiteSettings() {
        try {
            const settings = window.__BSQ_SITE_SETTINGS__ || await ensureSiteSettingsPromise();
            if (!settings) return;
            const theme = String(document.documentElement?.dataset?.theme || document.body?.dataset?.theme || 'light').toLowerCase();

            // Title
            if (settings.site_name) {
                const currentTitle = document.title || '';
                if (!currentTitle.includes(settings.site_name)) {
                    document.title = currentTitle.includes('|')
                        ? currentTitle
                        : `${currentTitle || settings.site_name} | ${settings.site_name}`;
                }
            }

            // Favicon
            const faviconUrl = theme === 'light'
                ? settings.favicon_light_url || settings.favicon_url || settings.favicon_dark_url
                : settings.favicon_dark_url || settings.favicon_url || settings.favicon_light_url;

            if (faviconUrl) {
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
                link.href = faviconUrl;
            }

            // Footer
            const footerCompanyElems = document.querySelectorAll('.footer-company-name, footer p strong');
            const footerInfoElems = document.querySelectorAll('.footer-info-text, footer .info-text');

            if (settings.company_name && footerCompanyElems.length > 0) {
                footerCompanyElems.forEach(el => el.textContent = settings.company_name);
            }

            if (footerInfoElems.length > 0) {
                const parts = [];
                if (settings.ceo_name) parts.push(`대표 ${settings.ceo_name}`);
                if (settings.biz_num) parts.push(`사업자등록번호 ${settings.biz_num}`);
                if (settings.mail_order_num) parts.push(`통신판매업신고 ${settings.mail_order_num}`);
                if (settings.cs_phone) parts.push(`고객센터 ${settings.cs_phone}`);
                if (settings.cs_email) parts.push(`이메일 ${settings.cs_email}`);

                let fullText = parts.join(' | ');
                if (settings.address) fullText += `\n주소 ${settings.address}`;
                if (fullText) footerInfoElems.forEach(el => el.innerText = fullText);
            }

            // SEO
            if (settings.seo) {
                const seo = settings.seo;
                if (seo.title) document.title = seo.title;

                const injectMeta = (name, content, isProperty = false) => {
                    if (!content) return;
                    let attr = isProperty ? 'property' : 'name';
                    let meta = document.querySelector(`meta[${attr}="${name}"]`);
                    if (!meta) {
                        meta = document.createElement('meta');
                        meta.setAttribute(attr, name);
                        document.head.appendChild(meta);
                    }
                    meta.setAttribute('content', content);
                };

                injectMeta('description', seo.description);
                injectMeta('keywords', seo.keywords);
                injectMeta('og:title', seo.title, true);
                injectMeta('og:description', seo.description, true);
                if (seo.image) injectMeta('og:image', seo.image, true);
            }
        } catch (e) { devLog('warn', '[BSQ] Site settings load skip'); }
    }

    // ---- 로그인 관련 ----
    async function login(email, password) {
        const result = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (result.success && result.token) {
            localStorage.setItem('bsq_token', result.token);
            if (result.data?.user) {
                localStorage.setItem('bsq_user', JSON.stringify(result.data.user));
            }
            await checkSession();
        }
        return result;
    }

    async function register(data) {
        const result = await apiCall('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (result.success) {
            await checkSession();
        }
        return result;
    }

    async function logout() {
        return await runLogout();
    }

    // [동기화] 이벤트 디스패치 트리거
    function triggerSync(type = 'default') {
        window.dispatchEvent(new CustomEvent('bsq_sync', { detail: { type, timestamp: Date.now() } }));
    }

    window.addEventListener('bsq_preferences', () => {
        void applySiteSettings();
    });

    window.addEventListener('bsq_sync', (event) => {
        const type = String(event?.detail?.type || '');
        if (type === 'site-settings') {
            void refreshSiteSettingsCache().then(() => applySiteSettings());
        }
    });

    // ---- 공개 API ----
    seedSessionFromStorage();
    applyPreferences();

    window.BSQ = {
        shellReady: shellReadyPromise,
        ready: readyPromise,
        apiBaseUrl: PUBLIC_API_BASE,
        get siteSettingsReady() {
            return ensureSiteSettingsPromise();
        },

        get session() {
            return _session;
        },
        get userId() {
            return _session?.user?.id || null;
        },
        get userProfile() {
            return _session?.user || null;
        },
        get isLoggedIn() { return !!_session; },

        // D1 API 호출
        api: apiCall,

        // 사용자 환경설정
        applyPreferences,

        // 로그인 관련
        login,
        register,
        logout,
        checkSession,
        triggerSync,
        sessionBootstrapPromise: ensureSessionBootstrapPromise(),
    };

    // ---- 즉시 실행 시작 ----
    resolveShellReady();
    void ensureAuthReadyPromise();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
