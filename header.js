// header.js - B-Square shared header / drawer / footer shell
(function () {
  'use strict';

  const currentPath = window.location.pathname || '';

  // Get the directory where header.js is located
  const scriptTag = document.currentScript;
  const scriptDir = scriptTag ? scriptTag.src.substring(0, scriptTag.src.lastIndexOf('/') + 1) : '';
  
  // Use scriptDir for absolute-like relative paths for CSS dynamic injection
  const shellCSSPath = scriptDir + 'shell_overrides.css?v=20260402_01';

  const homePrefix = currentPath.split('/').length > 2 ? '../' : './';
  const prefix = homePrefix;

  const OP_MODE_KEY = 'bsq_operator_view_mode';
  const SEARCH_DEBOUNCE_MS = 180;
  const SEARCH_LIMIT = 6;

  const SEARCH_SECTION_TITLES = {
    categories: '카테고리',
    classes: '클래스',
    notices: '공지사항',
    class_notices: '클래스 공지',
    faqs: 'FAQ',
    inquiries: '문의',
    history: '최근 검색',
  };

  const SEARCH_RESULT_LABELS = {
    category: '카테고리',
    class: '클래스',
    notice: '공지',
    class_notice: '클래스 공지',
    faq: 'FAQ',
    inquiry: '문의',
  };

  const searchState = {
    open: false,
    query: '',
    pendingRequest: 0,
    timer: null,
    results: null,
    history: [],
    currentRequestQuery: '',
  };

  const NAV_ITEMS = [
    { id: 'class', label: '클래스', href: 'class/class_list.html' },
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

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getThemeName() {
    const theme = String(document.documentElement?.dataset?.theme || document.body?.dataset?.theme || localStorage.getItem('bsq_theme') || 'dark').trim().toLowerCase();
    return theme === 'light' ? 'light' : 'dark';
  }

  function pickThemedUrl(settings, lightKey, darkKey, fallbackKey) {
    const theme = getThemeName();
    const lightUrl = String(settings?.[lightKey] || '').trim();
    const darkUrl = String(settings?.[darkKey] || '').trim();
    const fallbackUrl = String(settings?.[fallbackKey] || '').trim();
    return theme === 'light'
      ? (lightUrl || fallbackUrl || darkUrl)
      : (darkUrl || fallbackUrl || lightUrl);
  }

  function normalizeSearchResult(item = {}) {
    return {
      kind: String(item.kind || item.result_type || '').trim(),
      id: String(item.id || item.result_id || '').trim(),
      title: String(item.title || item.result_title || item.query || '').trim(),
      subtitle: String(item.subtitle || item.category || item.source_page || '').trim(),
      snippet: String(item.snippet || '').trim(),
      url: String(item.url || item.result_url || '').trim(),
      image_url: String(item.image_url || '').trim(),
      class_count: Number(item.class_count || 0),
      public_class_count: Number(item.public_class_count || 0),
      query: String(item.query || '').trim(),
      result_title: String(item.result_title || '').trim(),
    };
  }

  function getSearchKindLabel(kind) {
    return SEARCH_RESULT_LABELS[kind] || '결과';
  }

  function selectBestSearchTarget(data) {
    const results = data?.results || {};
    const orderedBuckets = ['classes', 'notices', 'class_notices', 'faqs', 'inquiries', 'categories'];

    for (const bucket of orderedBuckets) {
      const item = Array.isArray(results[bucket]) ? results[bucket][0] : null;
      if (item?.url) return normalizeSearchResult(item);
    }

    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    const target = suggestions.find((item) => item?.url);
    return target ? normalizeSearchResult(target) : null;
  }

  function buildSearchResultCard(item, query = '') {
    const result = normalizeSearchResult(item);
    if (!result.url) return '';

    const label = getSearchKindLabel(result.kind);
    const subtitle = result.subtitle || (result.kind === 'history' ? result.query : '');
    const snippet = result.snippet || '';
    const title = result.title || result.query || '결과 없음';
    const image = result.image_url
      ? `<img class="bsq-search-result-image" src="${escapeHtml(result.image_url)}" alt="">`
      : `<span class="bsq-search-result-avatar">${escapeHtml((title || label).charAt(0) || '?')}</span>`;

    return `
      <button type="button" class="bsq-search-result" data-url="${escapeHtml(result.url)}" data-kind="${escapeHtml(result.kind)}" data-id="${escapeHtml(result.id)}" data-title="${escapeHtml(title)}" data-query="${escapeHtml(query)}">
        <span class="bsq-search-result-media">${image}</span>
        <span class="bsq-search-result-copy">
          <span class="bsq-search-result-head">
            <strong>${escapeHtml(title)}</strong>
            <span class="bsq-search-result-badge">${escapeHtml(label)}</span>
          </span>
          ${subtitle ? `<span class="bsq-search-result-subtitle">${escapeHtml(subtitle)}</span>` : ''}
          ${snippet ? `<span class="bsq-search-result-snippet">${escapeHtml(snippet)}</span>` : ''}
        </span>
      </button>
    `;
  }

  function buildSearchSection(title, items, query = '') {
    const list = Array.isArray(items) ? items.filter((item) => item && (item.url || item.result_url || item.query)) : [];
    if (!list.length) return '';

    return `
      <section class="bsq-search-section">
        <div class="bsq-search-section-head">
          <strong>${escapeHtml(title)}</strong>
          <span>${list.length}</span>
        </div>
        <div class="bsq-search-section-list">
          ${list.map((item) => buildSearchResultCard(item, query)).join('')}
        </div>
      </section>
    `;
  }

  function buildSearchEmptyState(query) {
    const q = String(query || '').trim();
    if (!q) {
      return `
        <div class="bsq-search-empty">
          <strong>최근 검색 기록이 표시됩니다.</strong>
          <p>검색어를 입력하면 클래스, 공지, FAQ, 문의를 함께 찾습니다.</p>
        </div>
      `;
    }

    return `
      <div class="bsq-search-empty">
        <strong>검색 결과가 없습니다.</strong>
        <p>다른 키워드로 다시 검색하거나 아래 바로가기를 이용해 보세요.</p>
      </div>
    `;
  }

  function buildSearchQuickLinks() {
    return `
      <div class="bsq-search-quick-links">
        <a href="${prefix}class/class_list.html">전체 클래스</a>
        <a href="${prefix}notice/notice.html">공지사항</a>
        <a href="${prefix}contact/contact.html">문의하기</a>
      </div>
    `;
  }

  function buildHeaderHTML() {
    return `
      <header class="site-header" id="bsqHeader">
        <div class="header-inner header-two-row">
          
          <!-- 상단 1열: 로고, 검색창, 우측유틸 -->
          <div class="header-top">
            <div class="header-top-left">
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

            <div class="header-top-right">
              <!-- 검색창 -->
              <div class="search-bar desktop-only-flex">
                <input
                  type="text"
                  id="bsqSearchInput"
                  placeholder="통합 검색"
                  onkeydown="if(event.key==='Enter'){const q=this.value.trim();if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);}"
                >
                <button type="button" class="btn-search-inner" onclick="const q=document.getElementById('bsqSearchInput').value.trim();if(q)location.href='${prefix}class/class_list.html?q='+encodeURIComponent(q);">검색</button>
              </div>
              <div class="user-menu" id="userMenu"></div>
            </div>
          </div>

          <!-- 하단 2열: 카테고리 버튼, 메인 네비게이션 -->
          <div class="header-bottom desktop-only-flex">
            <!-- 카테고리 메뉴 시작 -->
            <div class="header-category-wrapper">
              <button type="button" class="btn-header-category" id="btnHeaderCategory" aria-expanded="false">
                <span>카테고리 <span class="arrow">∨</span></span>
              </button>
              <div class="header-category-mega" id="headerCategoryMega">
                <!-- JS가 다중 컬럼 카테고리를 주입 -->
              </div>
            </div>

            <!-- 중앙 메인 네비게이션 -->
            <nav class="main-nav" aria-label="주요 메뉴">
              <ul>
                ${NAV_ITEMS.map((item) => `
                  <li>
                    <a href="${prefix}${item.href}"${activeNav === item.id ? ' class="nav-active"' : ''}>${item.label}</a>
                  </li>
                `).join('')}
                <li><span class="nav-divider"></span></li>
                <li><a href="${prefix}create_class/create_class.html" class="nav-highlight">무료 모임 개설</a></li>
              </ul>
            </nav>
          </div>
          
        </div>
      </header>`;
  }

  function setupGlobalSearch() {
    const shell = document.querySelector('.search-bar.desktop-only-flex');
    if (!shell || shell.dataset.bsqSearchReady === '1') return;

    shell.dataset.bsqSearchReady = '1';
    shell.classList.add('bsq-global-search-shell');
    shell.innerHTML = `
      <input
        type="search"
        id="bsqSearchInput"
        class="bsq-search-input"
        placeholder="통합 검색"
        autocomplete="off"
        spellcheck="false"
        aria-label="사이트 통합 검색"
      >
      <button type="button" id="bsqSearchButton" class="bsq-search-button">검색</button>
      <div id="bsqSearchPanel" class="bsq-search-panel" aria-live="polite"></div>
    `;

    const input = document.getElementById('bsqSearchInput');
    const button = document.getElementById('bsqSearchButton');
    const panel = document.getElementById('bsqSearchPanel');
    if (!input || !button || !panel) return;

    let activeQuery = '';
    let requestToken = 0;
    let debounceTimer = null;
    let open = false;

    const getContext = () => 'global';

    const setPanelOpen = (value) => {
      open = !!value;
      shell.classList.toggle('is-search-open', open);
      panel.hidden = !open;
      input.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const normalizeQuery = (value) => String(value || '').trim();

    const buildRequestUrl = (query) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('scope', getContext());
      params.set('limit', String(SEARCH_LIMIT));
      params.set('history_limit', '6');
      params.set('include_history', '1');
      return `/api/search?${params.toString()}`;
    };

    const renderPayload = (data, query) => {
      const normalizedQuery = normalizeQuery(query);
      const results = data?.results || {};
      const history = Array.isArray(data?.history) ? data.history : [];
      const sections = [];

      if (normalizedQuery) {
        sections.push(
          buildSearchSection(SEARCH_SECTION_TITLES.categories, results.categories, normalizedQuery),
          buildSearchSection(SEARCH_SECTION_TITLES.classes, results.classes, normalizedQuery),
          buildSearchSection(SEARCH_SECTION_TITLES.notices, results.notices, normalizedQuery),
          buildSearchSection(SEARCH_SECTION_TITLES.class_notices, results.class_notices, normalizedQuery),
          buildSearchSection(SEARCH_SECTION_TITLES.faqs, results.faqs, normalizedQuery),
          buildSearchSection(SEARCH_SECTION_TITLES.inquiries, results.inquiries, normalizedQuery),
        );
      } else {
        if (history.length) {
          sections.push(buildSearchSection(SEARCH_SECTION_TITLES.history, history, normalizedQuery));
        }
        if (Array.isArray(results.categories) && results.categories.length) {
          sections.push(buildSearchSection('추천 카테고리', results.categories, normalizedQuery));
        }
        sections.push(buildSearchQuickLinks());
      }

      const content = sections.filter(Boolean).join('') || buildSearchEmptyState(normalizedQuery);
      panel.innerHTML = content;

      panel.querySelectorAll('.bsq-search-result').forEach((item) => {
        item.addEventListener('click', async () => {
          const result = {
            kind: item.dataset.kind || '',
            id: item.dataset.id || '',
            title: item.dataset.title || '',
            url: item.dataset.url || '',
          };
          const targetUrl = String(result.url || '').trim();
          if (!targetUrl) return;

          const selectedQuery = normalizeQuery(item.dataset.query || normalizedQuery);
          if (selectedQuery && window.BSQ?.api) {
            void window.BSQ.api('/api/search', {
              method: 'POST',
              keepalive: true,
              body: JSON.stringify({
                action: 'record',
                query: selectedQuery,
                context: getContext(),
                result_type: result.kind || '',
                result_id: result.id || '',
                result_title: result.title || '',
                result_url: targetUrl,
                source_page: currentPath || '',
              }),
            });
          }

          window.location.href = targetUrl;
        });
      });
    };

    const fetchAndRender = async (query) => {
      const normalizedQuery = normalizeQuery(query);
      activeQuery = normalizedQuery;
      const token = ++requestToken;

      if (!normalizedQuery) {
        setPanelOpen(true);
      } else {
        setPanelOpen(true);
      }

      try {
        const res = await window.BSQ.api(buildRequestUrl(normalizedQuery));
        if (token !== requestToken) return;
        const data = res?.success ? (res.data || null) : null;
        searchState.results = data;
        searchState.history = Array.isArray(data?.history) ? data.history : [];
        renderPayload(data, normalizedQuery);
      } catch (error) {
        if (token !== requestToken) return;
        panel.innerHTML = buildSearchEmptyState(normalizedQuery);
        console.warn('[BSQ] search load failed:', error);
      }
    };

    const navigateToBestResult = async () => {
      const query = normalizeQuery(input.value || '');
      if (!query) {
        setPanelOpen(true);
        await fetchAndRender('');
        return;
      }

      const res = await window.BSQ.api(buildRequestUrl(query));
      const data = res?.success ? (res.data || null) : null;
      searchState.results = data;
      searchState.history = Array.isArray(data?.history) ? data.history : [];
      renderPayload(data, query);

      const best = selectBestSearchTarget(data);
      if (!best?.url) return;

      if (window.BSQ?.api) {
        void window.BSQ.api('/api/search', {
          method: 'POST',
          keepalive: true,
          body: JSON.stringify({
            action: 'record',
            query,
            context: getContext(),
            result_type: best.kind || '',
            result_id: best.id || '',
            result_title: best.title || '',
            result_url: best.url || '',
            source_page: currentPath || '',
          }),
        });
      }

      window.location.href = best.url;
    };

    const scheduleFetch = (query) => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void fetchAndRender(query);
      }, SEARCH_DEBOUNCE_MS);
    };

    input.addEventListener('focus', () => {
      setPanelOpen(true);
      if (!activeQuery) {
        void fetchAndRender('');
      }
    });

    input.addEventListener('input', (event) => {
      const nextQuery = normalizeQuery(event.target.value || '');
      activeQuery = nextQuery;
      setPanelOpen(true);
      scheduleFetch(nextQuery);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelOpen(false);
        input.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void navigateToBestResult();
      }
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      void navigateToBestResult();
    });

    const closeSearchOnOutsidePointer = (event) => {
      if (!open) return;
      if (shell.contains(event.target)) return;
      setPanelOpen(false);
    };

    panel.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('pointerdown', closeSearchOnOutsidePointer, true);

    document.addEventListener('click', (event) => {
      if (shell.contains(event.target)) return;
      setPanelOpen(false);
    });

    document.addEventListener('focusin', closeSearchOnOutsidePointer);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) {
        setPanelOpen(false);
      }
    });

    setPanelOpen(false);
  }

  function buildDrawerHTML() {
    return `
      <div class="drawer-overlay mobile-only" id="drawerOverlay"></div>
      <aside class="drawer-menu mobile-only" id="drawerMenu">
        <div class="drawer-header">
          <h2 class="drawer-title">B-Square</h2>
          <button class="drawer-close" id="drawerClose" type="button">닫기</button>
        </div>
        <!-- 모바일 드로어 메뉴 -->
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
            <!-- 푸터 왼쪽: 고객센터 / 소셜 -->
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

            <!-- 푸터 가운데: 정책 / 링크 컬럼 -->
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

          <!-- 푸터 하단: 법적 링크 / 사업자 정보 -->
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
      const logoUrl = pickThemedUrl(settings, 'logo_light_url', 'logo_dark_url', 'logo_url');

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
        menuEl.innerHTML = `
          <a href="${prefix}login/login.html" class="btn-login-main">로그인</a>
          <a href="${prefix}login/signup.html" class="btn-signup-main">회원가입</a>
        `;
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
          <span class="user-name">${profile.name || user.name || '사용자'}님</span>
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

  function ensureHelperLoaded() {
    if (window.__BSQ_HELPER_READY__) return;
    if (document.getElementById('bsqHelperLauncher') || document.getElementById('bsqHelperPanel')) return;
    if (document.querySelector('script[data-bsq-helper="1"]')) return;

    const helperScript = document.createElement('script');
    helperScript.dataset.bsqHelper = '1';
    helperScript.async = true;
    helperScript.src = `${homePrefix}kakao_quick.js?v=20260402_01`;
    helperScript.onload = () => {
      window.__BSQ_HELPER_LOADED__ = true;
    };
    helperScript.onerror = () => {
      console.warn('[BSQ] Helper script failed to load:', helperScript.src);
    };
    document.body.appendChild(helperScript);
  }

  window.handleGlobalLogout = async function () {
    const authProvider = String(window.BSQ?.session?.user?.auth_provider || window.BSQ?.userProfile?.auth_provider || '').trim().toLowerCase();

    try {
      if (window.BSQ && window.BSQ.logout) {
        await window.BSQ.logout();
      }
    } catch (error) {
      console.warn('[BSQ] Local logout failed:', error);
    }

    localStorage.removeItem(OP_MODE_KEY);
    delete window.__BSQ_OPERATOR_PROFILE__;
    window.__BSQ_DEV_MODE__ = false;

    if (['kakao', 'naver', 'google'].includes(authProvider)) {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
      const cookieName = `bsq_oauth_logout_nonce_${authProvider}`;
      document.cookie = `${cookieName}=${nonce}; Path=/auth/${authProvider}/logout; SameSite=Strict; Max-Age=300${secureFlag}`;
      window.location.href = `${prefix}auth/${authProvider}/logout?phase=start&nonce=${encodeURIComponent(nonce)}&return_to=${encodeURIComponent(homePrefix + 'index.html')}`;
      return;
    }

    window.location.href = homePrefix + 'index.html';
  };

  function run() {
    injectUI();
    setupDrawer();
    setupGlobalSearch();
    ensureHelperLoaded();
    initAuth();

    window.addEventListener('scroll', () => {
      const header = document.getElementById('bsqHeader');
      if (header) {
        if (window.scrollY > 50) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      }
    });

    window.addEventListener('bsq_preferences', () => {
      void applyShellBranding();
    });
    window.addEventListener('bsq_sync', (event) => {
      if (String(event?.detail?.type || '') === 'site-settings') {
        void applyShellBranding();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
