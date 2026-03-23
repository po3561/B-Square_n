// bsq_server.js - B-Square 餓λ쵐釉???뺤쒔 筌뤴뫀諭?(??뽯땾 Cloudflare D1 API 筌뤴뫀諭?
// Firebase/Supabase ?袁⑹읈 ??볤탢. 筌뤴뫀諭??怨쀬뵠?怨뺣뮉 D1 API(/api/*)?????퉸 筌ｌ꼶??
// ???쒑린? window.BSQ.api('/api/classes'), await window.BSQ.ready
(function () {
    'use strict';

    // ---- ?怨밴묶 ----
    let _session = null;     // 嚥≪뮄????紐꾨?{ user: { id, email, name, ... }, expires_at }
    let _readyResolve = null;
    const readyPromise = new Promise(resolve => { _readyResolve = resolve; });
    // ==================================================
    // API 踰좎씠??URL ?먮룞 媛먯? 諛??먭꺽 ?쒕쾭 ?곕룞
    // ==================================================
    const PRODUCTION_API_URL = 'https://b-square-web.pages.dev';
    const WRANGLER_PORT = 8788;
    const _currentPort = parseInt(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
    const _isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const _isWrangler = _currentPort === WRANGLER_PORT;

    const _hasHttpOrigin = /^https?:$/i.test(window.location.protocol);
    const _runtimeOrigin = _hasHttpOrigin ? window.location.origin : '';

    const API_BASE = (() => {
        const explicitBase = window.__BSQ_API_BASE__;
        if (explicitBase) {
            return String(explicitBase).replace(/\/+$/, '');
        }
        if (_isWrangler) return '';
        if (_isLocalHost) return `http://${window.location.hostname}:8788`;
        if (_hasHttpOrigin) return window.location.origin;
        return '';
    })();

    // API ?곌껐 ?곹깭 諛곕꼫瑜??쒓굅?덉뒿?덈떎. (?ъ슜???붿껌)

    // ==================================================
    // D1 API ?몄텧 ?ы띁 (Standard V2)
    // ==================================================

    // ???筌왖 野껋럥以??癒?짗 癰귣똻??(?怨? 野껋럥以?-> ??? 野껋럥以?
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

        if (body && !finalOptions.body) {
            finalOptions.body = JSON.stringify(body);
        }

        const candidateBases = [];
        const pushBase = (value) => {
            const normalized = String(value || '').trim().replace(/\/+$/, '');
            if (!normalized) return;
            if (!candidateBases.includes(normalized)) candidateBases.push(normalized);
        };

        pushBase(API_BASE);
        if (_hasHttpOrigin) pushBase(window.location.origin);
        pushBase('http://127.0.0.1:8788');
        pushBase('http://localhost:8788');
        pushBase(PRODUCTION_API_URL);

        const performFetch = async (baseUrl) => {
            let requestUrl = baseUrl ? (baseUrl + endpoint) : endpoint;
            const token = localStorage.getItem('bsq_token');
            const isFormData = typeof FormData !== 'undefined' && finalOptions.body instanceof FormData;
            const defaultHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };
            const headers = { ...defaultHeaders, ...(finalOptions.headers || {}) };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            if (method === 'GET') {
                const connector = requestUrl.includes('?') ? '&' : '?';
                requestUrl += `${connector}t=${Date.now()}`;
            }

            console.log(`[BSQ API] ${method} ${requestUrl}`);
            return fetch(requestUrl, {
                ...finalOptions,
                method,
                headers,
                credentials: 'include'
            });
        };

        let lastError = null;

        for (const baseUrl of candidateBases) {
            try {
                const response = await performFetch(baseUrl);

                if (!response.ok) {
                    const errorText = await response.text();
                    let errMsg = `HTTP ${response.status}: ${response.statusText}`;

                    if (response.status === 413) {
                        errMsg = 'Payload Too Large. Please reduce the size of your request.';
                    } else if (errorText) {
                        try {
                            const errJson = JSON.parse(errorText);
                            errMsg = errJson.error || errMsg;
                        } catch (e) {
                            errMsg = errorText.substring(0, 100);
                        }
                    }
                    throw new Error(errMsg);
                }

                const result = await response.json();
                if (!result.success) {
                    console.warn(`[BSQ API] ${endpoint} warning:`, result.error, result.detail || '');
                    if (method !== 'GET') {
                        showOnScreenAlert(`[API] ${result.error || 'Request failed.'}`);
                    }
                } else if (result.data) {
                    result.data = fixImageUrls(result.data);
                }

                return result;
            } catch (error) {
                lastError = error;
                const isLastCandidate = baseUrl === candidateBases[candidateBases.length - 1];
                const shouldRetry = /Failed to fetch/i.test(error.message || '') || /^HTTP 404\b/i.test(error.message || '');
                if (!isLastCandidate && shouldRetry) {
                    console.warn('[BSQ API] API base failed, trying next candidate:', baseUrl, error.message);
                    continue;
                }

                console.error(`[BSQ API] ${endpoint} fetch error:`, error);
                const triedBases = candidateBases.join(' → ');
                const msg = error.message.includes('Failed to fetch')
                    ? `API connection failed. Tried: ${triedBases}`
                    : `[BSQ API] ${error.message}`;

                showOnScreenAlert(msg);
                return { success: false, error: error.message, tried_bases: candidateBases };
            }
        }

        const fallbackError = lastError || new Error('Unknown error');
        showOnScreenAlert(`[BSQ API] ${fallbackError.message}`);
        return { success: false, error: fallbackError.message };
    }

    function fixImageUrls(data) {
        if (!data) return data;
        if (typeof data === 'string') {
            // Base64 ?怨쀬뵠?怨뺣뮉 椰꾨?諭띄뵳?? ??놁벉
            if (data.startsWith('data:')) return data;
            // ??? ??? 野껋럥以??野껋럩??椰꾨?諭띄뵳?? ??놁벉
            if (data.startsWith('http')) return data;

            // uploads/ ?癒?뮉 assets/ 嚥???뽰삂??롫뮉 ?怨? 野껋럥以?筌ｌ꼶??(??????醫듢??怨???곸뵠)
            const cleanPath = data.startsWith('/') ? data : '/' + data;
            if (cleanPath.startsWith('/uploads/') || cleanPath.startsWith('/assets/')) {
                return PRODUCTION_API_URL + cleanPath;
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

    // ?遺얇늺 ???뵝 ??뽯뻻 (?源껊궗/??살첒 ?닌됲뀋)
    function showOnScreenAlert(msg, type = 'error') {
        if (typeof document === 'undefined') return;
        const alertBox = document.createElement('div');
        const color = type === 'success' ? '#00c853' : '#ff4d4d';
        alertBox.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: ${color}; color: white; padding: 12px 24px; border-radius: 12px;
            font-size: 14px; font-weight: bold; z-index: 1000000; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            text-align: center; white-space: pre-wrap; transition: all 0.3s ease;
        `;
        alertBox.innerText = msg;
        document.body.appendChild(alertBox);
        setTimeout(() => {
            alertBox.style.opacity = '0';
            alertBox.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => alertBox.remove(), 300);
        }, type === 'success' ? 2000 : 5000);
    }

    // ==================================================
    // ?紐꾨?疫꿸퀡而??紐꾩쵄 筌ｋ똾寃?& ?癒?짗 ??녿┛??    // ==================================================
    async function checkSession() {
        const result = await apiCall('/api/auth/session');

        if (result.success && result.data?.session) {
            _session = result.data.session;
            console.log('[BSQ Server] ??嚥≪뮄????類ㅼ뵥:', _session.user.email);
            // 嚥≪뮇類???쎈꽅?귐? 筌ㅼ뮇???            localStorage.setItem('bsq_user', JSON.stringify(_session.user));

            // 揶쏆뮆而???μ빓?? 筌뤴뫀諭??癒?짗 揶쏅Ŋ?
        } else {
            // ???紐꾨?API ??쎈솭 ??(404/401 ??: ?紐꾨??븍뜆?ょ㎉???욧퍙
            if (result.error && (result.error.includes('筌≪뼚??????곷뮸??덈뼄') || result.error.includes('Invalid'))) {
                console.warn('[BSQ Server] ?醫묓닔 ?紐꾨??븍뜆?ょ㎉?揶쏅Ŋ?. 嚥≪뮇類??紐꾨???λ뜃由?酉鍮??덈뼄.');
                localStorage.removeItem('bsq_token');
                localStorage.removeItem('bsq_user');
                _session = null;
            } else {
                // ??λ떄 ???뻿 ?關釉??野껋럩??LocalStorage Fallback
                try {
                    const localUserStr = localStorage.getItem('bsq_user');
                    if (localUserStr) {
                        const localUser = JSON.parse(localUserStr);
                        _session = { user: localUser };
                    }
                } catch (e) { _session = null; }
            }
        }
        updateConnectionHub();
        return _session;
    }

    // ==================================================
    // [?醫됲뇣] ??쇰뻻揶??怨뚭퍙 ??덊닏 (Connection Hub) UI
    // ==================================================
    function updateConnectionHub() {
        if (typeof document === 'undefined') return;
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
            document.body.appendChild(hub);
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
    // ?λ뜃由??    // ==================================================
    async function init() {
        if (!_isWrangler) {
            console.log(`[BSQ Server] ????癒?봄 API 筌뤴뫀諭???뽮쉐: ${PRODUCTION_API_URL}`);
        }

        // 1. ?紐꾨??類ㅼ뵥
        await checkSession();

        // 2. ready ?怨밴묶 獄쏆꼹??
        _readyResolve({
            session: _session,
            userId: _session?.user?.id || null,
            userProfile: _session?.user || null
        });

        console.log('[BSQ Server] ????뺤쒔 ?怨뚭퍙 ?λ뜃由???袁⑥┷ (D1 API 筌뤴뫀諭?', {
            loggedIn: !!_session,
            userId: _session?.user?.id || 'none'
        });

        // 3. ???????쇱젟 嚥≪뮆諭?        applySiteSettings();
    }

    // ==================================================
    // ???????쇱젟 ??D1 API 疫꿸퀡而?    // ==================================================
    async function applySiteSettings() {
        try {
            const result = await apiCall('/api/site-settings');
            if (!result.success || !result.data) return;

            const settings = result.data;

            // Title
            if (settings.site_name) {
                document.title = settings.site_name + (document.title.includes('|') ? document.title.substring(document.title.indexOf(' |')) : ' | B-Square');
            }

            // Favicon
            if (settings.favicon_url) {
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
                link.href = settings.favicon_url;
            }

            // Footer
            const footerCompanyElems = document.querySelectorAll('.footer-company-name, footer p strong');
            const footerInfoElems = document.querySelectorAll('.footer-info-text, footer .info-text');

            if (settings.company_name && footerCompanyElems.length > 0) {
                footerCompanyElems.forEach(el => el.textContent = settings.company_name);
            }

            if (footerInfoElems.length > 0) {
                const parts = [];
                if (settings.ceo_name) parts.push(`???? ${settings.ceo_name}`);
                if (settings.biz_num) parts.push(`??毓?癒?쾻嚥≪빖苡?? ${settings.biz_num}`);
                if (settings.mail_order_num) parts.push(`???뻿?癒?꼻??녿뻿?? ${settings.mail_order_num}`);
                if (settings.cs_phone) parts.push(`?⑥쥒而??녠숲: ${settings.cs_phone}`);
                if (settings.cs_email) parts.push(`??李?? ${settings.cs_email}`);

                let fullText = parts.join(' | ');
                if (settings.address) fullText += `\n雅뚯눘?? ${settings.address}`;
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
        } catch (e) { console.warn('[BSQ] Site settings load skip'); }
    }

    // ---- ?紐꾩쵄 ????----
    async function login(username, password) {
        const result = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
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
        const result = await apiCall('/api/auth/session', { method: 'DELETE' });
        localStorage.removeItem('bsq_token');
        localStorage.removeItem('bsq_user');
        _session = null;
        updateConnectionHub();
        return result;
    }

    // [?醫됲뇣] ??쇰뻻揶???녿┛???紐꺿봺椰?
    function triggerSync(type = 'default') {
        window.dispatchEvent(new CustomEvent('bsq_sync', { detail: { type, timestamp: Date.now() } }));
    }

    // ---- ?袁⑸열 API ----
    window.BSQ = {
        ready: readyPromise,
        apiBaseUrl: API_BASE || (_hasHttpOrigin ? window.location.origin : '') || PRODUCTION_API_URL,

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

        // D1 API ?紐꾪뀱
        api: apiCall,

        // ?紐꾩쵄 ????
        login,
        register,
        logout,
        checkSession,
        triggerSync
    };

    // ---- 筌앸맩????쎈뻬 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
