// header.js - B-Square shared header / drawer / footer shell
(function () {
  'use strict';

  const currentPath = window.location.pathname || '';

  // Get the directory where header.js is located
  const scriptTag = document.currentScript;
  const scriptDir = scriptTag ? scriptTag.src.substring(0, scriptTag.src.lastIndexOf('/') + 1) : '';
  
  // Use scriptDir for absolute-like relative paths for CSS dynamic injection
  const shellCSSPath = scriptDir + 'shell_overrides.css?v=20260330_06';

  const homePrefix = currentPath.split('/').length > 2 ? '../' : './';
  const prefix = homePrefix;

  const OP_MODE_KEY = 'bsq_operator_view_mode';

  const NAV_ITEMS = [
    { id: 'class', label: '클래스', href: 'class/class_list.html' },
    { id: 'create', label: '등록', href: 'create_class/create_class.html' },
    { id: 'notice', label: '공지사항', href: 'notice/notice.html' },
    { id: 'contact', label: '문의', href: 'contact/contact.html' },
    { id: 'community', label: '커뮤니티', href: 'community/community.html' },
  ];

  const BOTTOM_NAV_ITEMS = [
    { id: 'home', label: '홈', href: homePrefix + 'index.html', icon: '⌂' },
    { id: 'class', label: '클래스', href: prefix + 'class/class_list.html', icon: '▦' },
    { id: 'create', label: '등록', href: prefix + 'create_class/create_class.html', icon: '＋' },
    { id: 'community', label: '커뮤니티', href: prefix + 'community/community.html', icon: '◎' },
    { id: 'mypage', label: '마이페이지', href: prefix + 'mi_pesg/mypage.html', icon: '◔' },
  ];

  function getActiveNav() {
    const path = currentPath.toLowerCase();
    if (path.includes('class_list') || (path.includes('/class/') && !path.includes('class_view'))) return 'class';
    if (path.includes('create_class')) return 'create';
    if (path.includes('notice')) return 'notice';
    if (path.includes('contact')) return 'contact';
    if (path.includes('community')) return 'community';
    if (path.includes('class_view')) return 'classview';
    if (path.includes('mypage') || path.includes('mi_pesg')) return 'mypage';
    return 'home';
  }

  const activeNav = getActiveNav();

  function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
    if (['manager', 'operator_admin', 'ops'].includes(value)) return 'operator';
    if (['teacher', 'lecturer'].includes(value)) return 'instructor';
    return value || 'user';
  }

  function roleRank(role) {
    const normalized = normalizeRole(role);
    if (normalized === 'user' || normalized === 'student' || normalized === 'member') return 0;
    if (normalized === 'instructor') return 1;
    if (normalized === 'operator') return 2;
    if (normalized === 'admin' || normalized === 'super_admin') return 3;
    return 0;
  }

  function isOperatorEligible(user) {
    return !!user && roleRank(user.role) >= roleRank('operator');
  }

  function isOperatorModeEnabled() {
    return localStorage.getItem(OP_MODE_KEY) === '1';
  }

  function setOperatorModeEnabled(enabled) {
    localStorage.setItem(OP_MODE_KEY, enabled ? '1' : '0');
  }

  function getStoredOperatorProfile() {
    return {
      id: 'OPERATOR_GHOST',
      email: 'operator@b-square.kr',
      name: '운영자',
      username: 'operator',
      profile_image_url: '/assets/default-avatar.svg',
      role: 'super_admin',
      operator_seq: 1,
    };
  }

  function getOperatorDisplayName(user) {
    const seq = Number(user?.operator_seq || 0);
    return seq > 0 ? `운영자 ${seq}` : '운영자';
  }

  function getOperatorProfile(user) {
    return {
      name: `${getOperatorDisplayName(user)}님 반갑습니다`,
      profile_image_url: user?.profile_image_url || '/assets/default-avatar.svg',
    };
  }

  function buildHeaderHTML() {
    return `
      <header class="site-header" id="bsqHeader">
        <div class="header-inner">
          <div class="header-left">
            <button class="btn-hamburger mobile-only-flex" id="btnHamburger" aria-label="메뉴 열기">
              <span class="icon-bar"></span><span class="icon-bar"></span><span class="icon-bar"></span>
            </button>
            <h1 class="logo">
              <a href="${homePrefix}index.html" class="logo-link" aria-label="B-Square 홈으로 이동">
                <img id="bsqHeaderLogoImg" class="logo-image" alt="B-Square 로고" style="display:none;">
                <span id="bsqHeaderLogoText" class="logo-text">B-Square</span>
              </a>
            </h1>
          </div>

          <nav class="main-nav desktop-only-flex" aria-label="주요 메뉴">
            <ul>
              ${NAV_ITEMS.map((item) => `
                <li>
                  <a href="${prefix}${item.href}"${activeNav === item.id ? ' class="nav-active"' : ''}>${item.label}</a>
                </li>
              `).join('')}
            </ul>
          </nav>

          <div class="header-right header-utils">
            <div class="search-bar desktop-only-flex">
              <input
                type="text"
                id="bsqSearchInput"
                placeholder="검색어를 입력하세요"
                onkeydown="if(event.key==='Enter'){const q=this.value.trim();if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);}"
              >
              <button type="button" onclick="const el=document.getElementById('bsqSearchInput');const q=el ? el.value.trim() : '';if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);">검색</button>
            </div>
            <div class="user-menu" id="userMenu"></div>
          </div>
        </div>
      </header>`;
  }

  function buildDrawerHTML() {
    return `
      <div class="drawer-overlay mobile-only" id="drawerOverlay"></div>
      <aside class="drawer-menu mobile-only" id="drawerMenu">
        <div class="drawer-header">
          <h2 class="drawer-title">B-Square</h2>
          <button class="drawer-close" id="drawerClose" type="button">닫기</button>
        </div>
        <nav class="drawer-nav" aria-label="모바일 메뉴">
          <a href="${homePrefix}index.html" class="drawer-nav-item${activeNav === 'home' ? ' active' : ''}">홈</a>
          <a href="${prefix}class/class_list.html" class="drawer-nav-item${activeNav === 'class' ? ' active' : ''}">클래스</a>
          <a href="${prefix}create_class/create_class.html" class="drawer-nav-item${activeNav === 'create' ? ' active' : ''}">등록</a>
          <a href="${prefix}notice/notice.html" class="drawer-nav-item${activeNav === 'notice' ? ' active' : ''}">공지사항</a>
          <a href="${prefix}contact/contact.html" class="drawer-nav-item${activeNav === 'contact' ? ' active' : ''}">문의</a>
          <a href="${prefix}community/community.html" class="drawer-nav-item${activeNav === 'community' ? ' active' : ''}">커뮤니티</a>
          <a href="${prefix}mi_pesg/mypage.html" class="drawer-nav-item${activeNav === 'mypage' ? ' active' : ''}">마이페이지</a>
        </nav>
      </aside>`;
  }

  function buildBottomNavHTML() {
    return `
      <nav class="bottom-nav mobile-only" id="bsqBottomNav" aria-label="하단 메뉴">
        ${BOTTOM_NAV_ITEMS.map((item) => `
          <a href="${item.href}" class="nav-item${activeNav === item.id ? ' active' : ''}">
            <span class="icon">${item.icon}</span>
            <span class="label">${item.label}</span>
          </a>
        `).join('')}
      </nav>`;
  }

  function buildFooterHTML() {
    return `
      <footer class="site-footer" id="bsqFooter">
        <div class="footer-inner">
          <div class="footer-grid">
            <section class="footer-support">
              <h3 class="footer-support-title">고객센터</h3>
              <p class="footer-support-hours" id="footerSupportHours">오전 10시 ~ 오후 6시 (주말, 공휴일 제외)</p>
              <button type="button" class="btn-contact" onclick="location.href='${prefix}contact/contact.html'">문의하기</button>

              <div class="footer-social-links" aria-label="소셜 링크">
                <a id="footerInstagramLink" href="https://www.instagram.com/b_square.01?igsh=MzZ4b3pod2FsMDQ1" class="footer-social-link" target="_blank" rel="noopener noreferrer">
                  <span class="icon">IG</span><span>인스타그램</span>
                </a>
                <a id="footerYoutubeLink" href="#" class="footer-social-link" target="_blank" rel="noopener noreferrer">
                  <span class="icon">YT</span><span>유튜브</span>
                </a>
              </div>
            </section>

            <div class="footer-links-grid">
              <section class="footer-link-column">
                <h4>공지사항</h4>
                <a href="${prefix}class/class_list.html">전체 카테고리</a>
                <a href="${prefix}notice/notice.html">헬프센터</a>
              </section>

              <section class="footer-link-column">
                <h4>크리에이터 지원</h4>
                <a href="https://koipa.re.kr/ippolice">지식재산권 침해 신고 센터</a>
                <a href="${prefix}contact/contact.html">기업고객 문의</a>
              </section>

              <section class="footer-link-column">
                <h4>정책</h4>
                <a id="footerPrivacyLink" href="${homePrefix}terms_privacy.html">개인정보처리방침</a>
                <a id="footerTermsLink" href="${homePrefix}terms_use.html">이용약관</a>
                <a href="#">환불 정책</a>
              </section>

              <section class="footer-link-column">
                <h4>사업자 정보 확인</h4>
                <a href="#">제휴 및 대외협력</a>
                <a href="#">채용</a>
                <a href="${prefix}contact/contact.html">고객센터</a>
              </section>
            </div>
          </div>

          <div class="footer-bottom">
            <div class="footer-legal-links" aria-label="바로가기">
              <a href="${homePrefix}terms_use.html">이용약관</a>
              <a href="${homePrefix}terms_privacy.html"><strong>개인정보처리방침</strong></a>
              <a href="${prefix}contact/contact.html">고객센터</a>
            </div>
            <p class="footer-info-text" id="bsqFooterInfoText"></p>
            <p class="footer-company-more">
              <a href="${prefix}contact/contact.html">사업자 정보 자세히 보기 &gt;</a>
            </p>
            <p class="copyright">© <span id="footerCopyrightBrand">B-Square</span>. All rights reserved.</p>
          </div>
        </div>
      </footer>`;
  }

  async function applyShellBranding() {
    try {
      const settings = window.__BSQ_SITE_SETTINGS__
        || (window.BSQ?.siteSettingsReady ? await window.BSQ.siteSettingsReady : null)
        || null;
      if (!settings) return;

      const brandName = settings.company_name || settings.site_name || 'B-Square';
      const logoUrl = settings.logo_url || '';

      const setLogo = (imgId, textId) => {
        const img = document.getElementById(imgId);
        const text = document.getElementById(textId);

        if (img) {
          if (logoUrl) {
            img.src = logoUrl;
            img.style.display = 'block';
          } else {
            img.removeAttribute('src');
            img.style.display = 'none';
          }
        }

        if (text) {
          text.textContent = brandName;
          text.style.display = logoUrl ? 'none' : 'inline-flex';
        }
      };

      setLogo('bsqHeaderLogoImg', 'bsqHeaderLogoText');

      const footerInfo = document.getElementById('bsqFooterInfoText');
      const footerHours = document.getElementById('footerSupportHours');
      const footerTermsLink = document.getElementById('footerTermsLink');
      const footerPrivacyLink = document.getElementById('footerPrivacyLink');
      const footerInstagramLink = document.getElementById('footerInstagramLink');
      const footerYoutubeLink = document.getElementById('footerYoutubeLink');
      const footerBrandCopy = document.getElementById('footerCopyrightBrand');

      if (footerBrandCopy) footerBrandCopy.textContent = brandName;
      if (footerHours) footerHours.textContent = settings.footer_hours || '오전 10시 ~ 오후 6시 (주말, 공휴일 제외)';
      if (footerTermsLink) footerTermsLink.href = (settings.footer_terms_url && settings.footer_terms_url !== '#') ? settings.footer_terms_url : homePrefix + 'terms_use.html';
      if (footerPrivacyLink) footerPrivacyLink.href = (settings.footer_privacy_url && settings.footer_privacy_url !== '#') ? settings.footer_privacy_url : homePrefix + 'terms_privacy.html';
      if (footerInstagramLink) footerInstagramLink.href = settings.footer_instagram_url || '#';
      if (footerYoutubeLink) footerYoutubeLink.href = settings.footer_youtube_url || '#';

      if (footerInfo) {
        const lines = [];
        if (settings.company_name) lines.push(settings.company_name);

        const details = [];
        if (settings.ceo_name) details.push(`대표 ${settings.ceo_name}`);
        if (settings.biz_num) details.push(`사업자등록번호 ${settings.biz_num}`);
        if (settings.mail_order_num) details.push(`통신판매업신고 ${settings.mail_order_num}`);
        if (settings.cs_phone) details.push(`고객센터 ${settings.cs_phone}`);
        if (settings.cs_email) details.push(`이메일 ${settings.cs_email}`);
        if (details.length > 0) lines.push(details.join(' · '));
        if (settings.address) lines.push(`주소 ${settings.address}`);

        footerInfo.textContent = lines.join('\n');
      }
    } catch (error) {
      console.warn('[BSQ] Shell branding apply skipped:', error);
    }
  }

  function injectUI() {
    if (!document.getElementById('bsqShellOverridesCSS')) {
      const shellCSS = document.createElement('link');
      shellCSS.id = 'bsqShellOverridesCSS';
      shellCSS.rel = 'stylesheet';
      shellCSS.href = shellCSSPath;
      document.head.appendChild(shellCSS);
    }

    document.querySelector('header.site-header')?.remove();
    document.querySelector('footer.site-footer')?.remove();
    document.querySelectorAll('.drawer-overlay, .drawer-menu').forEach((el) => el.remove());
    document.querySelector('nav.bottom-nav')?.remove();

    document.body.insertAdjacentHTML('afterbegin', buildDrawerHTML());
    const drawer = document.getElementById('drawerMenu');
    if (drawer) drawer.insertAdjacentHTML('afterend', buildHeaderHTML());
    else document.body.insertAdjacentHTML('afterbegin', buildHeaderHTML());

    document.body.insertAdjacentHTML('beforeend', buildFooterHTML());
    if (!currentPath.includes('community')) {
      const footer = document.getElementById('bsqFooter');
      if (footer) footer.insertAdjacentHTML('beforebegin', buildBottomNavHTML());
    }
  }

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

  function renderUserMenu(session, user) {
    const menus = document.querySelectorAll('#userMenu');
    menus.forEach((menuEl) => {
      if (!session || !user) {
        menuEl.innerHTML = `<a href="${prefix}login/login.html" class="btn-login-main">로그인</a>`;
        window.__BSQ_DEV_MODE__ = isOperatorModeEnabled();
        if (window.__BSQ_DEV_MODE__) {
          window.__BSQ_OPERATOR_PROFILE__ = getStoredOperatorProfile();
        } else {
          delete window.__BSQ_OPERATOR_PROFILE__;
        }
        return;
      }

      const operatorEligible = isOperatorEligible(user);
      const operatorMode = operatorEligible && isOperatorModeEnabled();
      window.__BSQ_DEV_MODE__ = operatorMode;
      const profile = operatorMode ? getOperatorProfile(user) : user;
      if (operatorMode) {
        window.__BSQ_OPERATOR_PROFILE__ = {
          ...user,
          profile_image_url: user.profile_image_url || '/assets/default-avatar.svg',
        };
      } else {
        delete window.__BSQ_OPERATOR_PROFILE__;
      }
      const profileHref = operatorMode ? `${prefix}admin_dashboard/admin.html` : `${prefix}mi_pesg/mypage.html`;
      const modeLabel = operatorEligible ? (operatorMode ? '운영자 모드' : '일반 모드') : '';

      menuEl.innerHTML = `
        <a href="${profileHref}" class="user-profile-btn">
          <div class="user-avatar" style="background-image:url(${profile.profile_image_url || ''});">
            ${!profile.profile_image_url ? '👤' : ''}
          </div>
          <span class="user-name">${profile.name || user.name || '사용자'}</span>
        </a>
        ${operatorEligible ? `<button type="button" id="btnOperatorModeToggle" class="btn-operator-mode">${modeLabel}</button>` : ''}
        <button type="button" class="btn-logout" onclick="handleGlobalLogout()">로그아웃</button>
      `;

      if (operatorEligible) {
        const toggle = menuEl.querySelector('#btnOperatorModeToggle');
        toggle?.addEventListener('click', () => {
          setOperatorModeEnabled(!isOperatorModeEnabled());
          renderUserMenu(session, user);
        });
      }
    });

  }

  function renderAuthenticatedMenu(session, user) {
    renderUserMenu(session, user);
  }

  async function initAuth() {
    const renderCurrentSession = () => {
      const nextSession = window.BSQ?.session;
      renderAuthenticatedMenu(nextSession, nextSession?.user || null);
      void applyShellBranding();
    };

    renderCurrentSession();

    if (window.BSQ?.sessionBootstrapPromise?.then) {
      window.BSQ.sessionBootstrapPromise.then(renderCurrentSession).catch((error) => {
        console.warn('[BSQ] Auth hydration skipped:', error);
      });
    } else if (window.BSQ?.ready?.then) {
      window.BSQ.ready.then(renderCurrentSession).catch((error) => {
        console.warn('[BSQ] Auth hydration skipped:', error);
      });
    }

    window.addEventListener('bsq_session', renderCurrentSession);
  }

  window.handleGlobalLogout = async function () {
    if (window.BSQ && window.BSQ.logout) {
      await window.BSQ.logout();
    }
    localStorage.removeItem(OP_MODE_KEY);
    delete window.__BSQ_OPERATOR_PROFILE__;
    window.__BSQ_DEV_MODE__ = false;
    window.location.href = homePrefix + 'index.html';
  };

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
