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
    // API 베이스 URL 자동 감지 및 원격 서버 연동
    // ==================================================
    const PRODUCTION_API_URL = 'https://b-square-web.pages.dev';
    const WRANGLER_PORT = 8788;
    const _currentPort = parseInt(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
    const _isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const _isWrangler = _currentPort === WRANGLER_PORT;
    
    // 로컬 개발 환경(포트 5500 등)일 경우 로컬 Wrangler(8788) 통신. 아니면 프로덕션
    // 현재 접속한 포트가 이미 8788이라면 상대 경로('')를 사용합니다.
    const API_BASE = _isWrangler ? '' : (_isLocalHost ? `http://${window.location.hostname}:8788` : PRODUCTION_API_URL);

    // API 연결 상태 배지는 제거되었습니다. (사용자 요청)

    // ==================================================
    // D1 API 호출 헬퍼
    // ==================================================
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

        let url = API_BASE + endpoint;
        
        try {
            const token = localStorage.getItem('bsq_token');
            const defaultHeaders = { 
                'Content-Type': 'application/json' 
            };
            if (token) {
                defaultHeaders['Authorization'] = `Bearer ${token}`;
            }
            if (window.__BSQ_DEV_MODE__) {
                defaultHeaders['X-BSQ-Dev-Mode'] = 'true';
            }

            // GET 요청 캐시 방지
            if (method === 'GET') {
                const connector = url.includes('?') ? '&' : '?';
                url += `${connector}t=${Date.now()}`;
            }

            console.log(`[BSQ API] ${method} ${url}`);

            const response = await fetch(url, {
                method,
                headers: { ...defaultHeaders, ...finalOptions.headers },
                body: method !== 'GET' ? finalOptions.body : undefined,
                credentials: 'include',
                mode: 'cors'
            });

            // HTTP 오류 처리
            if (!response.ok) {
                const errorText = await response.text();
                let errMsg = `HTTP ${response.status}: ${response.statusText}`;
                
                if (response.status === 413) {
                    errMsg = "요청 크기가 너무 큽니다 (Payload Too Large). 이미지 수를 줄이거나 압축률을 더 높여야 합니다.";
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
                console.warn(`[BSQ API] ${endpoint} 실패:`, result.error, result.detail || '');
                if (method !== 'GET') {
                    showOnScreenAlert(`[서버 오류] ${result.error || '요청 처리에 실패했습니다.'}`);
                }
            } else {
                if (result.data) {
                    result.data = fixImageUrls(result.data);
                }
            }
            return result;
        } catch (error) {
            console.error(`[BSQ API] ${endpoint} 요청 오류:`, error);
            const msg = error.message.includes('Failed to fetch') 
                ? `서버 연결 실패: ${API_BASE || '현재 서버'}\n네트워크 상태나 서버 실행 여부를 확인하세요.`
                : `[BSQ API 오류] ${error.message}`;
            
            showOnScreenAlert(msg);
            return { success: false, error: error.message };
        }
    }

    // 이미지 경로 자동 보정 (상대 경로 -> 절대 경로)
    function fixImageUrls(data) {
        if (!data) return data;
        if (typeof data === 'string') {
            // Base64 데이터는 건드리지 않음
            if (data.startsWith('data:')) return data;
            // 이미 절대 경로인 경우 건드리지 않음
            if (data.startsWith('http')) return data;
            
            // uploads/ 또는 assets/ 로 시작하는 상대 경로 처리 (슬래시 유무 상관없이)
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

    // 화면 알림 표시 (성공/오류 구분)
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
    // 세션 기반 인증 체크 & 자동 동기화
    // ==================================================
    async function checkSession() {
        const result = await apiCall('/api/auth/session');
        
        if (result.success && result.data?.session) {
            _session = result.data.session;
            console.log('[BSQ Server] ✅ 로그인 확인:', _session.user.email);
            // 로컬 스토리지 최신화
            localStorage.setItem('bsq_user', JSON.stringify(_session.user));

            // 개발자(총괄) 모드 자동 감지
            const user = _session.user;
            if (user.role === 'admin') {
                window.__BSQ_DEV_MODE__ = true;
                console.log('💎 [BSQ Server] 총괄 개발자 세션 감지: DEV_MODE 활성화');
                window.dispatchEvent(new Event('bsq_dev_mode_activated'));
            }
        } else {
            // ★ 세션 API 실패 시 (404/401 등): 세션 불일치 해결
            if (result.error && (result.error.includes('찾을 수 없습니다') || result.error.includes('Invalid'))) {
                console.warn('[BSQ Server] ⚠️ 세션 불일치 감지. 로컬 세션을 초기화합니다.');
                localStorage.removeItem('bsq_token');
                localStorage.removeItem('bsq_user');
                _session = null;
            } else {
                // 단순 통신 장애일 경우 LocalStorage Fallback
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
    // [신규] 실시간 연결 허브 (Connection Hub) UI
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
    // 초기화
    // ==================================================
    async function init() {
        if (!_isWrangler) {
            console.log(`[BSQ Server] 🌐 원격 API 모드 활성: ${PRODUCTION_API_URL}`);
        }

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
        } catch(e) { console.warn('[BSQ] Site settings load skip'); }
    }

    // ---- 인증 헬퍼 ----
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

    // [신규] 실시간 동기화 트리거
    function triggerSync(type = 'default') {
        window.dispatchEvent(new CustomEvent('bsq_sync', { detail: { type, timestamp: Date.now() } }));
    }

    // ---- 전역 API ----
    window.BSQ = {
        ready: readyPromise,
        apiBaseUrl: API_BASE || window.location.origin,

        get session() { 
            if (window.__BSQ_DEV_MODE__) return { user: this.userProfile, expires_at: '9999-12-31' };
            return _session; 
        },
        get userId() { 
            if (window.__BSQ_DEV_MODE__) return 'admin_dev_mode';
            return _session?.user?.id || null; 
        },
        get userProfile() { 
            if (window.__BSQ_DEV_MODE__) {
                return {
                    id: 'admin_dev_mode',
                    email: 'po3561@naver.com',
                    name: '총괄운영자',
                    username: 'promise1',
                    role: 'admin',
                    profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png'
                };
            }
            return _session?.user || null; 
        },
        get isLoggedIn() { return window.__BSQ_DEV_MODE__ || !!_session; },

        // D1 API 호출
        api: apiCall,

        // 인증 헬퍼
        login,
        register,
        logout,
        checkSession,
        triggerSync
    };

    // ---- 즉시 실행 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
