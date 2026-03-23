// header.js - B-Square shared header / drawer / footer shell
(function () {
  'use strict';

  const currentPath = window.location.pathname;
  const isHomePage = currentPath.includes('bsnnnnnnnnnnnnnnnnnn');
  const prefix = '../';
  const homePrefix = isHomePage ? '' : '../bsnnnnnnnnnnnnnnnnnn/';
  const OP_MODE_KEY = 'bsq_operator_view_mode';

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

  function getOperatorDisplayName(user) {
    const seq = Number(user?.operator_seq || 0);
    return seq > 0 ? `운영자${seq}` : '운영자';
  }

  function getOperatorProfile(user) {
    return {
      name: `${getOperatorDisplayName(user)} 님 반갑습니다`,
      profile_image_url: user?.profile_image_url || 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png',
    };
  }

  function buildHeaderHTML() {
    const nav = (id, label) => `<li><a href="${prefix}${getNavHref(id)}"${activeNav === id ? ' class="nav-active"' : ''}>${label}</a></li>`;
    return `
      <header class="site-header" id="bsqHeader">
        <div class="header-inner">
          <div class="header-left" style="display:flex;align-items:center;gap:10px;">
            <button class="btn-hamburger mobile-only-flex" id="btnHamburger" aria-label="메뉴 열기">
              <span class="icon-bar"></span><span class="icon-bar"></span><span class="icon-bar"></span>
            </button>
            <h1 class="logo">
              <a href="${homePrefix}index.html" class="logo-link">
                <img id="bsqHeaderLogoImg" class="logo-image" alt="B-Square 로고" style="display:none;">
                <span id="bsqHeaderLogoText" class="logo-text">B-Square</span>
              </a>
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
              <input type="text" placeholder="검색어를 입력하세요" id="bsqSearchInput" onkeydown="if(event.key==='Enter'){const q=this.value.trim();if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);}">
              <button type="button" onclick="const q=document.getElementById('bsqSearchInput').value.trim();if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);">검색</button>
            </div>
            <div class="user-menu" id="userMenu" style="display:flex;gap:10px;align-items:center;"></div>
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
          <button class="drawer-close" id="drawerClose">닫기</button>
        </div>
        <nav class="drawer-nav">
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
    const item = (href, icon, label, id) =>
      `<a href="${href}" class="nav-item${activeNav === id ? ' active' : ''}">
        <span class="icon">${icon}</span>
        <span class="label">${label}</span>
      </a>`;
    return `
      <nav class="bottom-nav mobile-only" id="bsqBottomNav">
        ${item(prefix + 'class/class_list.html', '📚', '클래스', 'class')}
        ${item(prefix + 'class/class_list.html', '🎟️', '멤버십', 'membership')}
        ${item(prefix + 'community/community.html', '💬', '커뮤니티', 'community')}
        ${item(prefix + 'mi_pesg/mypage.html', '👤', '마이페이지', 'mypage')}
        ${item(prefix + 'mi_pesg/mypage.html', '🏫', '내 클래스', 'myclasses')}
      </nav>`;
  }

  function buildFooterHTML() {
    return `
      <footer class="site-footer" id="bsqFooter">
        <div class="footer-top">
          <div class="footer-brand">
            <a href="${homePrefix}index.html" class="footer-brand-link">
              <img id="bsqFooterLogoImg" class="footer-logo-image" alt="B-Square 로고" style="display:none;">
              <span id="bsqFooterBrandText" class="footer-brand-text">B-Square</span>
            </a>
            <p class="footer-slogan">배움을 연결하는 클래스 플랫폼</p>
            <p class="footer-info-text" id="bsqFooterInfoText"></p>
          </div>
          <div class="footer-links">
            <h4>바로가기</h4>
            <ul class="footer-nav">
              <li><a id="footerTermsLink" href="#">이용약관</a></li>
              <li><a id="footerPrivacyLink" href="#"><strong>개인정보처리방침</strong></a></li>
              <li><a href="${prefix}contact/contact.html">고객센터</a></li>
            </ul>
          </div>
          <div class="social-links">
            <a id="footerInstagramLink" href="#" class="social-icon" target="_blank" rel="noopener noreferrer"><span class="icon">📷</span><p>인스타그램</p></a>
            <a id="footerYoutubeLink" href="#" class="social-icon" target="_blank" rel="noopener noreferrer"><span class="icon">▶</span><p>유튜브</p></a>
          </div>
          <div class="cs-center">
            <h4>고객센터</h4>
            <p id="footerSupportHours">평일 10시 ~ 오후 6시 (주말, 공휴일 제외)</p>
            <button type="button" class="btn-contact" onclick="location.href='${prefix}contact/contact.html'">문의하기</button>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="copyright">© <span id="footerCopyrightBrand">B-Square</span>. All rights reserved.</p>
        </div>
      </footer>`;
  }

  async function applyShellBranding() {
    try {
      if (window.BSQ && window.BSQ.ready) {
        await window.BSQ.ready;
      }

      const settingsSource = window.__BSQ_SITE_SETTINGS__;
      const settings = settingsSource || (await window.BSQ?.api?.('/api/site-settings'))?.data || null;
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
      setLogo('bsqFooterLogoImg', 'bsqFooterBrandText');

      const footerInfo = document.getElementById('bsqFooterInfoText');
      const footerHours = document.getElementById('footerSupportHours');
      const footerTermsLink = document.getElementById('footerTermsLink');
      const footerPrivacyLink = document.getElementById('footerPrivacyLink');
      const footerInstagramLink = document.getElementById('footerInstagramLink');
      const footerYoutubeLink = document.getElementById('footerYoutubeLink');
      const footerBrandCopy = document.getElementById('footerCopyrightBrand');

      if (footerBrandCopy) footerBrandCopy.textContent = brandName;
      if (footerHours) footerHours.textContent = settings.footer_hours || '평일 10시 ~ 오후 6시 (주말, 공휴일 제외)';
      if (footerTermsLink) footerTermsLink.href = settings.footer_terms_url || '#';
      if (footerPrivacyLink) footerPrivacyLink.href = settings.footer_privacy_url || '#';
      if (footerInstagramLink) footerInstagramLink.href = settings.footer_instagram_url || '#';
      if (footerYoutubeLink) footerYoutubeLink.href = settings.footer_youtube_url || '#';

      if (footerInfo) {
        const parts = [];
        if (settings.ceo_name) parts.push(`대표: ${settings.ceo_name}`);
        if (settings.biz_num) parts.push(`사업자등록번호: ${settings.biz_num}`);
        if (settings.mail_order_num) parts.push(`통신판매업신고: ${settings.mail_order_num}`);
        if (settings.cs_phone) parts.push(`고객센터: ${settings.cs_phone}`);
        if (settings.cs_email) parts.push(`이메일: ${settings.cs_email}`);

        const lines = [];
        if (parts.length > 0) lines.push(parts.join(' | '));
        if (settings.address) lines.push(`주소: ${settings.address}`);
        footerInfo.textContent = lines.join('\n');
      }
    } catch (error) {
      console.warn('[BSQ] Shell branding apply skipped:', error);
    }
  }

  function injectUI() {
    if (!document.getElementById('bsqMobileOptimizeCSS')) {
      const linkCSS = document.createElement('link');
      linkCSS.id = 'bsqMobileOptimizeCSS';
      linkCSS.rel = 'stylesheet';
      linkCSS.href = prefix + 'mobile_210px_optimize.css';
      document.head.appendChild(linkCSS);
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
        window.__BSQ_DEV_MODE__ = false;
        return;
      }

      const operatorEligible = isOperatorEligible(user);
      const operatorMode = operatorEligible && isOperatorModeEnabled();
      window.__BSQ_DEV_MODE__ = operatorMode;
      const profile = operatorMode ? getOperatorProfile(user) : user;
      const profileHref = operatorMode ? `${prefix}admin_dashboard/admin.html` : `${prefix}mi_pesg/mypage.html`;
      const modeLabel = operatorEligible ? (operatorMode ? '일반 모드' : '운영자 모드') : '';

      menuEl.innerHTML = `
        <a href="${profileHref}" class="user-profile-btn" style="text-decoration:none;">
          <div class="user-avatar" style="background-image:url(${profile.profile_image_url || ''});">
            ${!profile.profile_image_url ? '👤' : ''}
          </div>
          <span class="user-name">${profile.name || user.name || '사용자'}</span>
        </a>
        ${operatorEligible ? `<button type="button" id="btnOperatorModeToggle" class="btn-operator-mode" style="background:rgba(110,142,251,0.12); color:#6e8efb; border:1px solid rgba(110,142,251,0.25); padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.78rem; font-weight:700;">${modeLabel}</button>` : ''}
        <button type="button" class="btn-logout" onclick="handleGlobalLogout()" style="color:var(--text-secondary);font-size:0.8rem;background:none;border:none;cursor:pointer;">로그아웃</button>
      `;

      if (operatorEligible) {
        const toggle = menuEl.querySelector('#btnOperatorModeToggle');
        toggle?.addEventListener('click', () => {
          setOperatorModeEnabled(!isOperatorModeEnabled());
          renderUserMenu(session, user);
        });
      }
    });

    window.dispatchEvent(new Event(window.__BSQ_DEV_MODE__ ? 'bsq_dev_mode_activated' : 'bsq_dev_mode_deactivated'));
  }

  function renderAuthenticatedMenu(session, user) {
    renderUserMenu(session, user);
  }

  async function initAuth() {
    if (window.BSQ && window.BSQ.ready) {
      await window.BSQ.ready;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const session = window.BSQ?.session;
    const user = session?.user || null;
    renderAuthenticatedMenu(session, user);

    window.addEventListener('bsq_dev_mode_activated', () => {
      renderAuthenticatedMenu(window.BSQ?.session, window.BSQ?.session?.user || null);
    });
    window.addEventListener('bsq_dev_mode_deactivated', () => {
      renderAuthenticatedMenu(window.BSQ?.session, window.BSQ?.session?.user || null);
    });

    await applyShellBranding();
  }

  window.handleGlobalLogout = async function () {
    if (window.BSQ && window.BSQ.logout) {
      await window.BSQ.logout();
    }
    localStorage.removeItem(OP_MODE_KEY);
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
