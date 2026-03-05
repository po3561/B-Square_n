// header.js - B-Square 통합 헤더/푸터/Drawer/BottomNav 시스템
// 모든 페이지에서 이 파일 하나로 동일한 UI를 동적 삽입합니다.

(function () {
    'use strict';

    // ---- 설정 ----
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";

    // ---- 경로 계산 ----
    const scriptTag = document.currentScript;
    const scriptSrc = scriptTag ? scriptTag.src : '';
    // header.js는 항상 bsnnnnnnnnnnnnnnnnnn/ 폴더에 있으므로 상위 폴더 = 프로젝트 루트
    let basePath = '../';
    if (scriptSrc) {
        try {
            const url = new URL(scriptSrc);
            const parts = url.pathname.split('/');
            // bsnnnnnnnnnnnnnnnnnn/header.js → 상위 폴더
            parts.pop(); // header.js
            parts.pop(); // bsnnnnnnnnnnnnnnnnnn
            basePath = parts.join('/') + '/';
        } catch (e) { /* fallback */ }
    }

    // 현재 페이지가 bsnnnnnnnnnnnnnnnnnn 폴더 안이면 상대경로 다르게
    const currentPath = window.location.pathname;
    const isHomePage = currentPath.includes('bsnnnnnnnnnnnnnnnnnn');
    const prefix = isHomePage ? '../' : '../';
    const homePrefix = isHomePage ? '' : '../bsnnnnnnnnnnnnnnnnnn/';

    // ---- 활성 네비 판별 ----
    function getActiveNav() {
        const p = currentPath.toLowerCase();
        if (p.includes('class_list') || (p.includes('/class/') && !p.includes('class_view'))) return 'class';
        if (p.includes('create_class')) return 'create';
        if (p.includes('notice')) return 'notice';
        if (p.includes('contact')) return 'contact';
        if (p.includes('community')) return 'community';
        if (p.includes('class_view')) return 'classview';
        if (p.includes('mypage') || p.includes('mi_pesg')) return 'mypage';
        return 'home';
    }
    const activeNav = getActiveNav();

    // ---- 헤더 HTML ----
    function buildHeaderHTML() {
        const nav = (id, label) => `<li><a href="${prefix}${getNavHref(id)}"${activeNav === id ? ' class="nav-active"' : ''}>${label}</a></li>`;
        return `
    <header class="site-header" id="bsqHeader">
        <div class="header-inner">
            <div class="header-left" style="display:flex;align-items:center;gap:10px;">
                <button class="btn-hamburger mobile-only-flex" id="btnHamburger" aria-label="메뉴">
                    <span class="icon-bar"></span>
                    <span class="icon-bar"></span>
                    <span class="icon-bar"></span>
                </button>
                <h1 class="logo">
                    <a href="${homePrefix}index.html"><span class="logo-icon">💠</span> 클래스</a>
                </h1>
            </div>
            <nav class="main-nav desktop-only-flex">
                <ul>
                    ${nav('class', '클래스')}
                    ${nav('create', '등록')}
                    ${nav('notice', '공지사항')}
                    ${nav('contact', '문의')}
                    ${nav('community', '커뮤니티')}
                </ul>
            </nav>
            <div class="header-right header-utils">
                <div class="search-bar desktop-only-flex">
                    <input type="text" placeholder="검색어를 입력하세요">
                    <button type="button">🔍</button>
                </div>
                <div class="user-menu" id="userMenu" style="display:flex;gap:10px;align-items:center;">
                    <!-- 로딩 중 -->
                </div>
            </div>
        </div>
    </header>`;
    }

    function getNavHref(id) {
        switch (id) {
            case 'class': return 'class/class_list.html';
            case 'create': return 'create_class/create_class.html';
            case 'notice': return 'notice/notice.html';
            case 'contact': return 'contact/contact.html';
            case 'community': return 'community/community.html';
            case 'mypage': return 'mi_pesg/mypage.html';
            default: return 'bsnnnnnnnnnnnnnnnnnn/index.html';
        }
    }

    // ---- Drawer (모바일 사이드 메뉴) ----
    function buildDrawerHTML() {
        return `
    <div class="drawer-overlay mobile-only" id="drawerOverlay"></div>
    <aside class="drawer-menu mobile-only" id="drawerMenu">
        <div class="drawer-header">
            <h2 class="drawer-title">💠 B-Square</h2>
            <button class="drawer-close" id="drawerClose">✕</button>
        </div>
        <nav class="drawer-nav">
            <a href="${homePrefix}index.html" class="drawer-nav-item${activeNav === 'home' ? ' active' : ''}">🏠 홈</a>
            <a href="${prefix}class/class_list.html" class="drawer-nav-item${activeNav === 'class' ? ' active' : ''}">📚 클래스</a>
            <a href="${prefix}create_class/create_class.html" class="drawer-nav-item${activeNav === 'create' ? ' active' : ''}">✏️ 등록</a>
            <a href="${prefix}notice/notice.html" class="drawer-nav-item${activeNav === 'notice' ? ' active' : ''}">📢 공지사항</a>
            <a href="${prefix}contact/contact.html" class="drawer-nav-item${activeNav === 'contact' ? ' active' : ''}">📞 문의</a>
            <a href="${prefix}community/community.html" class="drawer-nav-item${activeNav === 'community' ? ' active' : ''}">👥 커뮤니티</a>
            <a href="${prefix}mi_pesg/mypage.html" class="drawer-nav-item${activeNav === 'mypage' ? ' active' : ''}">👤 마이페이지</a>
        </nav>
    </aside>`;
    }

    // ---- Bottom Nav (모바일 하단) ----
    function buildBottomNavHTML() {
        const item = (href, icon, label, id) =>
            `<a href="${href}" class="nav-item${activeNav === id ? ' active' : ''}">
                <span class="icon">${icon}</span>
                <span class="label">${label}</span>
            </a>`;
        return `
    <nav class="bottom-nav mobile-only" id="bsqBottomNav">
        ${item(prefix + 'class/class_list.html', '▶️', '클래스', 'class')}
        ${item('#', '🎟️', '멤버십', 'membership')}
        ${item(prefix + 'community/community.html', '👥', '커뮤니티', 'community')}
        ${item(prefix + 'mi_pesg/mypage.html', '👤', '마이페이지', 'mypage')}
        ${item('#', '📺', '내 클래스', 'myclasses')}
    </nav>`;
    }

    // ---- 푸터 HTML ----
    function buildFooterHTML() {
        return `
    <footer class="site-footer" id="bsqFooter">
        <div class="footer-top">
            <div class="social-links">
                <a href="#" class="social-icon"><span class="icon">📷</span><p>인스타그램</p></a>
                <a href="#" class="social-icon"><span class="icon">▶️</span><p>유튜브</p></a>
            </div>
            <div class="cs-center">
                <h4>고객센터</h4>
                <p>오전 10시 ~ 오후 6시 (주말, 공휴일 제외)</p>
                <button type="button" class="btn-contact">문의하기</button>
            </div>
        </div>
        <div class="footer-bottom">
            <ul class="footer-nav">
                <li><a href="#">회사소개</a></li>
                <li><a href="#">이용약관</a></li>
                <li><a href="#"><strong>개인정보처리방침</strong></a></li>
                <li><a href="#">고객센터</a></li>
            </ul>
            <div class="company-info">
                <strong>비스퀘어</strong>
                <p>대표 : OOO | 사업자등록번호 : OOO-OO-OOOOO</p>
                <p>통신판매업신고 : 2024-부산-0000 | 이메일 : help@example.com</p>
                <p>주소 : 부산광역시 OOO OOO</p>
            </div>
            <p class="copyright">© Bisquare. All rights reserved.</p>
        </div>
    </footer>`;
    }

    // ---- DOM 삽입 ----
    function injectUI() {
        // 210px 모바일 글로벌 최적화 CSS 동적 삽입
        if (!document.getElementById('bsqMobileOptimizeCSS')) {
            const linkCSS = document.createElement('link');
            linkCSS.id = 'bsqMobileOptimizeCSS';
            linkCSS.rel = 'stylesheet';
            linkCSS.href = prefix + 'mobile_210px_optimize.css';
            document.head.appendChild(linkCSS);
        }

        // 기존 헤더 제거
        const oldHeader = document.querySelector('header.site-header');
        if (oldHeader) oldHeader.remove();

        // 기존 푸터 제거
        const oldFooter = document.querySelector('footer.site-footer');
        if (oldFooter) oldFooter.remove();

        // 기존 drawer 제거
        document.querySelectorAll('.drawer-overlay, .drawer-menu').forEach(el => el.remove());

        // 기존 bottom-nav 제거
        const oldBottomNav = document.querySelector('nav.bottom-nav');
        if (oldBottomNav) oldBottomNav.remove();

        // 새 UI 삽입
        const body = document.body;

        // Drawer → body 맨 앞에
        body.insertAdjacentHTML('afterbegin', buildDrawerHTML());

        // Header → Drawer 바로 뒤
        const drawer = document.getElementById('drawerMenu');
        if (drawer) {
            drawer.insertAdjacentHTML('afterend', buildHeaderHTML());
        } else {
            body.insertAdjacentHTML('afterbegin', buildHeaderHTML());
        }

        // Footer → main 또는 body 끝에
        body.insertAdjacentHTML('beforeend', buildFooterHTML());

        // Bottom Nav → Footer 바로 위 (community 페이지에선 제외)
        if (!currentPath.includes('community')) {
            const footer = document.getElementById('bsqFooter');
            if (footer) {
                footer.insertAdjacentHTML('beforebegin', buildBottomNavHTML());
            }
        }
    }

    // ---- Drawer 이벤트 ----
    function setupDrawer() {
        const hamburger = document.getElementById('btnHamburger');
        const overlay = document.getElementById('drawerOverlay');
        const closeBtn = document.getElementById('drawerClose');
        const menu = document.getElementById('drawerMenu');

        function openDrawer() {
            overlay?.classList.add('active');
            menu?.classList.add('active');
        }
        function closeDrawer() {
            overlay?.classList.remove('active');
            menu?.classList.remove('active');
        }

        hamburger?.addEventListener('click', openDrawer);
        overlay?.addEventListener('click', closeDrawer);
        closeBtn?.addEventListener('click', closeDrawer);
    }

    // ---- Supabase 초기화 및 유저 메뉴 ----
    async function initAuth() {
        // Supabase 클라이언트 보장
        let client = window.supabaseClient;
        if (!client && window.supabase) {
            client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            window.supabaseClient = client;
        }

        // Firebase 초기화 보장
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp({
                apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
                authDomain: "b-square-39b11.firebaseapp.com",
                databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
                projectId: "b-square-39b11",
                storageBucket: "b-square-39b11.firebasestorage.app",
                messagingSenderId: "1012056920961",
                appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
            });
        }
        if (typeof firebase !== 'undefined' && firebase.database) {
            window.firebaseDB = firebase.database();
        }

        // ★ 개발자 모드: 가상 운영자 계정으로 즉시 로그인 표시
        if (window.__BSQ_DEV_MODE__) {
            renderOperatorMenu();
            return;
        }

        // 세션 확인
        let currentUser = null;
        let currentSession = null;

        if (client) {
            try {
                const { data } = await client.auth.getSession();
                currentSession = data?.session;
                if (currentSession) {
                    const userId = currentSession.user.id;
                    const { data: profile } = await client.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
                    currentUser = profile;
                }
            } catch (e) {
                console.warn("[header.js] Session check failed:", e);
            }
        }

        // 유저 메뉴 렌더링
        renderUserMenu(currentSession, currentUser);

        // ★ 개발자 모드 후발 활성화 대응
        window.addEventListener('bsq_dev_mode_activated', () => {
            renderOperatorMenu();
        });
    }

    // 운영자 메뉴 렌더링
    function renderOperatorMenu() {
        const op = window.__BSQ_OPERATOR_PROFILE__ || {
            name: '운영자',
            profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png'
        };
        document.querySelectorAll('#userMenu').forEach(menuEl => {
            menuEl.innerHTML = `
                <a href="${prefix}mi_pesg/mypage.html" class="user-profile-btn" style="text-decoration:none;">
                    <div class="user-avatar" style="background-image:url(${op.profile_image_url});">
                    </div>
                    <span class="user-name" style="color:#6e8efb;font-weight:700;">🛡️ ${op.name}</span>
                </a>
            `;
        });
    }

    // 일반 유저 메뉴 렌더링
    function renderUserMenu(currentSession, currentUser) {
        document.querySelectorAll('#userMenu').forEach(menuEl => {
            if (currentSession && currentUser) {
                menuEl.innerHTML = `
                    <a href="${prefix}mi_pesg/mypage.html" class="user-profile-btn" style="text-decoration:none;">
                        <div class="user-avatar" style="background-image:url(${currentUser.profile_image_url || ''});">
                            ${!currentUser.profile_image_url ? '👤' : ''}
                        </div>
                        <span class="user-name">${currentUser.name || '사용자'}</span>
                    </a>
                    <button type="button" class="btn-logout" onclick="handleGlobalLogout()" style="color:var(--text-secondary);font-size:0.8rem;background:none;border:none;cursor:pointer;">로그아웃</button>
                `;
            } else {
                menuEl.innerHTML = `<a href="${prefix}login/login.html" class="btn-login-main">로그인</a>`;
            }
        });
    }

    // ---- 전역 로그아웃 ----
    window.handleGlobalLogout = async function () {
        if (window.supabaseClient) {
            await window.supabaseClient.auth.signOut();
            window.location.href = homePrefix + 'index.html';
        }
    };

    // ---- 실행 ----
    function run() {
        injectUI();
        setupDrawer();
        initAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
