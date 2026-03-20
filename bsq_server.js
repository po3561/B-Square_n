// bsq_server.js - B-Square 중앙 서버 모듈 (순수 Cloudflare D1 API 모드)
// Firebase/Supabase 완전 제거. 모든 데이터는 D1 API(/api/*)를 통해 처리.
// 사용법: window.BSQ.api('/api/classes'), await window.BSQ.ready
(function () {
    'use strict';

    // ---- 상태 ----
    let _session = null;     // 로그인 세션 { user: { id, email, name, ... }, expires_at }
    let _readyResolve = null;
    const readyPromise = new Promise(resolve => { _readyResolve = resolve; });

    // ==================================================
    // API 베이스 URL 자동 감지
    // Live Server(5500 등) 사용 시 → Wrangler(8788)로 프록시
    // Wrangler에서 직접 접속 시 → 상대 경로 사용
    // ==================================================
    const WRANGLER_PORT = 8788;
    const _currentHost = window.location.hostname;
    const _currentPort = parseInt(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
    const _isLocalhost = (_currentHost === 'localhost' || _currentHost === '127.0.0.1');
    const _isWrangler = _currentPort === WRANGLER_PORT;

    // 로컬 환경(localhost/127.0.0.1)이면서 Wrangler 포트(8788)가 아닐 때만 로컬 프록시 사용
    // 그 외(Wrangler 직접 실행 또는 실제 배포 환경)에서는 상대 경로('') 사용
    const API_BASE = (_isLocalhost && !_isWrangler) ? `http://127.0.0.1:${WRANGLER_PORT}` : '';

    if (!_isWrangler) {
        console.log(`[BSQ Server] ⚡ API 프록시 활성: 현재 포트(${_currentPort}) → Wrangler(${WRANGLER_PORT})`);
    }

    // ==================================================
    // D1 API 호출 헬퍼
    // ==================================================
    async function apiCall(endpoint, options = {}) {
        try {
            const defaultHeaders = { 
                'Content-Type': 'application/json' 
            };
            if (window.__BSQ_DEV_MODE__) {
                defaultHeaders['X-BSQ-Dev-Mode'] = 'true';
            }
            const url = API_BASE + endpoint;
            const response = await fetch(url, {
                headers: { ...defaultHeaders, ...options.headers },
                credentials: _isWrangler ? 'same-origin' : 'include',
                mode: _isWrangler ? 'same-origin' : 'cors',
                ...options
            });
            const result = await response.json();
            if (!result.success) {
                console.warn(`[BSQ API] ${endpoint} 실패:`, result.error, result.detail || '');
            }
            return result;
        } catch (error) {
            console.error(`[BSQ API] ${endpoint} 요청 오류:`, error);
            return { success: false, error: error.message };
        }
    }

    // ==================================================
    // 세션 기반 인증 체크
    // ==================================================
    async function checkSession() {
        const result = await apiCall('/api/auth/session');
        if (result.success && result.data?.session) {
            _session = result.data.session;
            console.log('[BSQ Server] ✅ 로그인 확인:', _session.user.email);

            // 개발자(총괄) 모드 자동 감지
            const user = _session.user;
            if (user.username === 'promise1' ||
                user.email === 'po3561@naver.com' ||
                user.email === 'promise9907@naver.com' ||
                user.role === 'admin') {
                window.__BSQ_DEV_MODE__ = true;
                console.log('💎 [BSQ Server] 총괄 개발자 세션 감지: DEV_MODE 활성화');
                window.dispatchEvent(new Event('bsq_dev_mode_activated'));
            }
        } else {
            // ★ 세션 API 실패 시 LocalStorage Fallback (기존 로그인 유저 구제 / 강사 권한 유지)
            try {
                const localUserStr = localStorage.getItem('bsq_user');
                if (localUserStr) {
                    const localUser = JSON.parse(localUserStr);
                    _session = { user: localUser };
                    console.log('[BSQ Server] 🔄 API 세션 실패 - LocalStorage 세션 복원 성공:', localUser.email);
                    
                    if (localUser.username === 'promise1' || localUser.email === 'po3561@naver.com' || localUser.role === 'admin') {
                        window.__BSQ_DEV_MODE__ = true;
                        window.dispatchEvent(new Event('bsq_dev_mode_activated'));
                    }
                } else {
                    _session = null;
                    console.log('[BSQ Server] ℹ️ 미로그인 상태');
                }
            } catch (e) {
                _session = null;
                console.log('[BSQ Server] ℹ️ 미로그인 상태 (폴백 실패)');
            }
        }
        return _session;
    }

    // ==================================================
    // 초기화
    // ==================================================
    async function init() {
        // 1. 세션 확인
        await checkSession();

        // 2. ready 상태 반환
        _readyResolve({
            session: _session,
            userId: _session?.user?.id || null,
            userProfile: _session?.user || null
        });

        console.log('[BSQ Server] ✅ 서버 연결 초기화 완료 (D1 API 모드)', {
            loggedIn: !!_session,
            userId: _session?.user?.id || 'none'
        });

        // 3. 사이트 설정 로드
        applySiteSettings();
    }

    // ==================================================
    // 사이트 설정 — D1 API 기반
    // ==================================================
    async function applySiteSettings() {
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
            if (settings.ceo_name) parts.push(`대표: ${settings.ceo_name}`);
            if (settings.biz_num) parts.push(`사업자등록번호: ${settings.biz_num}`);
            if (settings.mail_order_num) parts.push(`통신판매업신고: ${settings.mail_order_num}`);
            if (settings.cs_phone) parts.push(`고객센터: ${settings.cs_phone}`);
            if (settings.cs_email) parts.push(`이메일: ${settings.cs_email}`);

            let fullText = parts.join(' | ');
            if (settings.address) fullText += `\n주소: ${settings.address}`;
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
    }

    // ---- 인증 헬퍼 ----
    async function login(username, password) {
        const result = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (result.success) {
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
        _session = null;
        return result;
    }

    // ---- 전역 API ----
    window.BSQ = {
        ready: readyPromise,

        get session() { return _session; },
        get userId() { return _session?.user?.id || null; },
        get userProfile() { return _session?.user || null; },
        get isLoggedIn() { return !!_session; },

        // D1 API 호출
        api: apiCall,

        // 인증 헬퍼
        login,
        register,
        logout,
        checkSession,
    };

    // ---- 즉시 실행 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
