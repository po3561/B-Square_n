// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
  await window.BSQ.ready;
  const currentCategory = getCurrentHomeCategory();

  await Promise.all([
    renderHomeCategoryMenu(currentCategory),
    initMainPage(currentCategory),
    initBanners(),
  ]);

  window.addEventListener('bsq_sync', (e) => {
    console.log('[BSQ Sync] Data refresh requested:', e.detail);
    const activeCategory = getCurrentHomeCategory();
    void Promise.all([
      initMainPage(activeCategory),
      initBanners(),
      renderHomeCategoryMenu(activeCategory),
    ]).catch((error) => console.warn('[BSQ Sync] refresh failed:', error));
  });

  document.querySelector('.category-grid')?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-category-toggle]');
    if (toggle) {
      event.preventDefault();
      const shell = toggle.closest('[data-home-category-shell]');
      const expanded = shell?.dataset.expanded === 'true';
      setHomeCategoryExpandedState(!expanded);
      void renderHomeCategoryMenu(getCurrentHomeCategory());
      return;
    }

    const link = event.target.closest('a[data-cat]');
    if (!link) return;
    event.preventDefault();
    const categoryName = String(link.dataset.cat || 'all');
    const allGrid = document.getElementById('allClassGrid');
    const nextUrl = new URL(window.location.href);
    if (categoryName === 'all') {
      nextUrl.searchParams.delete('cat');
    } else {
      nextUrl.searchParams.set('cat', categoryName);
    }
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

    if (categoryName === 'all') {
      if (allGrid) renderClassCards(globalAllClasses, allGrid);
      document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
      void renderHomeCategoryMenu(categoryName);
      return;
    }
    filterAllClassesByCategory(categoryName);
    void renderHomeCategoryMenu(categoryName);
    document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
  });

  initDrawer();
});

let globalAllClasses = [];
const FALLBACK_HOME_CATEGORIES = [
  { name: '소모임/동아리', emoji: '👥' },
  { name: '맛있는 클래스', emoji: '🍽️' },
  { name: '운동 클래스', emoji: '🏋️' },
  { name: '디자인', emoji: '🎨' },
  { name: '생산성', emoji: '⚡' },
  { name: '스포츠', emoji: '🏅' },
  { name: '디지털 드로잉', emoji: '✏️' },
  { name: '성공 마인드', emoji: '🧠' },
  { name: '음악', emoji: '🎵' },
  { name: '요리', emoji: '🍳' },
  { name: '베이킹', emoji: '🧁' },
  { name: '사진', emoji: '📷' },
  { name: '영상', emoji: '🎬' },
  { name: '공예', emoji: '🧵' },
  { name: '여행', emoji: '🧭' },
];

async function renderHomepageCategories(currentCategory = 'all') {
  const nav = document.querySelector('.category-grid');
  if (!nav) return;

  let categories = FALLBACK_HOME_CATEGORIES;
  try {
    const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      categories = res.data.map((item) => ({
        name: String(item.name || '').trim(),
        emoji: String(item.emoji || '✨').trim() || '✨',
      })).filter((item) => item.name);
    }
  } catch (error) {
    console.warn('[Main] category load failed, fallback used:', error);
  }

  nav.innerHTML = `
    <ul>
      <li class="${currentCategory === 'all' ? 'active' : ''}"><a href="#" data-cat="all"><span class="icon">🌐</span>전체</a></li>
      ${categories.map((item) => `<li class="${currentCategory === item.name ? 'active' : ''}"><a href="#" data-cat="${escapeHtml(item.name)}"><span class="icon">${escapeHtml(item.emoji || '✨')}</span>${escapeHtml(item.name)}</a></li>`).join('')}
    </ul>
  `;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function setVisible(el, visible) {
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HOME_CATEGORY_STORAGE_KEY = 'bsq.home.categories.expanded';
const HOME_CATEGORY_COLLAPSED_LIMIT = 15;
const HOME_CATEGORY_ACCENTS = ['#d7a24e', '#f2b84d', '#ff5f66', '#ea4a2f', '#67d9dc', '#4f93ff', '#b76cff', '#ff8d4f', '#6ad5a0', '#5aa8ff'];
const HOME_CATEGORY_FALLBACK_ITEMS = [
  '구독 이벤트',
  '100만원 쿠폰팩',
  '무료 특강',
  '어도비',
  '평생교육이용권',
  'AI 스킬업',
  '창업·부업',
  '디지털 드로잉',
  '라이프스타일',
  '드로잉',
  '공예',
  '금융·재테크',
  '디자인',
  '생산성',
  '사진·영상',
  '운동',
  '음악',
  '영상/3D',
  '베이킹·디저트',
  '요리·음료',
  '비즈니스',
  '프로그래밍',
  '제2 외국어',
  '마케팅',
  '아이 교육',
  '성공 마인드',
  '데이터사이언스',
  '제품 기획',
  '외국어 시험',
].map((name) => ({ name }));

const HOME_CATEGORY_ICON_RULES = [
  { pattern: /(구독|이벤트)/, icon: 'ticket', accent: '#d7a24e' },
  { pattern: /(쿠폰)/, icon: 'flash', accent: '#f2b84d' },
  { pattern: /(특강|강의|라이브)/, icon: 'live', accent: '#ff5f66' },
  { pattern: /(어도비)/, icon: 'triangle', accent: '#ea4a2f' },
  { pattern: /(이용권)/, icon: 'infinity', accent: '#67d9dc' },
  { pattern: /(AI|스킬업)/, icon: 'spark', accent: '#4f93ff' },
  { pattern: /(창업|부업)/, icon: 'store', accent: '#b76cff' },
  { pattern: /(드로잉|디자인)/, icon: 'pen', accent: '#ff8d4f' },
  { pattern: /(라이프|공예|취미)/, icon: 'leaf', accent: '#6ad5a0' },
  { pattern: /(금융|재테크)/, icon: 'chart', accent: '#5aa8ff' },
  { pattern: /(생산성|성장)/, icon: 'arrow-up', accent: '#ff8d4f' },
  { pattern: /(사진|영상)/, icon: 'camera', accent: '#b76cff' },
  { pattern: /(운동|스포츠)/, icon: 'dumbbell', accent: '#58a7ff' },
  { pattern: /(음악)/, icon: 'music', accent: '#4f93ff' },
  { pattern: /(베이킹|디저트|요리|음료)/, icon: 'pot', accent: '#ff9f4d' },
  { pattern: /(비즈니스|마케팅)/, icon: 'briefcase', accent: '#8b7cff' },
  { pattern: /(프로그래밍|코딩)/, icon: 'code', accent: '#54a7ff' },
  { pattern: /(외국어|시험)/, icon: 'globe', accent: '#66d0a8' },
  { pattern: /(교육|아이)/, icon: 'cap', accent: '#ffb14a' },
  { pattern: /(데이터)/, icon: 'chart', accent: '#6a9dfc' },
  { pattern: /(마인드|성공)/, icon: 'spark', accent: '#72d18c' },
];

function getCurrentHomeCategory() {
  return new URLSearchParams(window.location.search).get('cat') || 'all';
}

function getHomeCategoryExpandedState() {
  try {
    return localStorage.getItem(HOME_CATEGORY_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
}

function setHomeCategoryExpandedState(expanded) {
  try {
    localStorage.setItem(HOME_CATEGORY_STORAGE_KEY, expanded ? '1' : '0');
  } catch (error) {
    // Ignore storage failures in private mode or restricted contexts.
  }
}

function resolveHomeCategoryMeta(name, index = 0) {
  const value = String(name || '').trim();
  const rule = HOME_CATEGORY_ICON_RULES.find((entry) => entry.pattern.test(value));
  return {
    icon: rule?.icon || 'spark',
    accent: rule?.accent || HOME_CATEGORY_ACCENTS[index % HOME_CATEGORY_ACCENTS.length],
  };
}

function svgIcon(kind) {
  const icons = {
    spark: '<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z"></path>',
    ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7z"></path><path d="M9 9.5v5"></path>',
    flash: '<path d="M13 2L4 13h6l-1 9 9-11h-6l1-9z"></path>',
    live: '<path d="M5 8a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0z"></path><path d="M10 9h4l-2 6z"></path>',
    triangle: '<path d="M12 3l8 16H4z"></path>',
    infinity: '<path d="M5.5 8.5c1.9-2 5.1-2 7 0L12 9l-.5-.5c1.9-2 5.1-2 7 0s1.9 5.1 0 7-5.1 2-7 0L12 15l-.5.5c-1.9 2-5.1 2-7 0s-1.9-5.1 0-7z"></path>',
    store: '<path d="M4 9h16l-1 4H5L4 9z"></path><path d="M6 13v7h12v-7"></path><path d="M5 5h14l1 4H4l1-4z"></path>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16 4 20z"></path><path d="M14 6l3 3"></path>',
    leaf: '<path d="M19 4s-8 0-13 5-4 11-4 11 6 1 11-4 6-12 6-12z"></path><path d="M7 17c2-2 5-4 9-6"></path>',
    chart: '<path d="M4 19h16"></path><path d="M7 19V12"></path><path d="M12 19V8"></path><path d="M17 19v-5"></path>',
    'arrow-up': '<path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"></rect><circle cx="12" cy="13.5" r="3.5"></circle><path d="M8 7l1.5-2h5L16 7"></path>',
    dumbbell: '<path d="M5 9v6"></path><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M19 9v6"></path><path d="M8 12h8"></path>',
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    pot: '<path d="M7 9h10l-1 8H8L7 9z"></path><path d="M9 9V6h6v3"></path><path d="M6 17h12"></path>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M9 7V5h6v2"></path>',
    code: '<path d="M9 8l-4 4 4 4"></path><path d="M15 8l4 4-4 4"></path><path d="M13 6l-2 12"></path>',
    globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c3 3 3 15 0 18"></path><path d="M12 3c-3 3-3 15 0 18"></path>',
    cap: '<path d="M2 9l10-5 10 5-10 5-10-5z"></path><path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4"></path>',
    heart: '<path d="M12 20s-7-4.4-8.8-9.1C1.8 7 4.1 4 7.6 4c2 0 3.7 1 4.4 2.4C12.7 5 14.4 4 16.4 4c3.5 0 5.8 3 4.4 6.9C19 15.6 12 20 12 20z"></path>',
    'heart-filled': '<path d="M12 20s-7-4.4-8.8-9.1C1.8 7 4.1 4 7.6 4c2 0 3.7 1 4.4 2.4C12.7 5 14.4 4 16.4 4c3.5 0 5.8 3 4.4 6.9C19 15.6 12 20 12 20z" fill="currentColor" stroke="none"></path>',
    star: '<path d="M12 3.5l2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.9 6.3 20.7l1.1-6.2L3 10.1l6.3-.9L12 3.5z"></path>',
    bookmark: '<path d="M6 3h12v18l-6-3-6 3V3z"></path>',
    'bookmark-filled': '<path d="M6 3h12v18l-6-3-6 3V3z" fill="currentColor" stroke="none"></path>',
    'chevron-down': '<path d="M6 9l6 6 6-6"></path>',
    'chevron-up': '<path d="M6 15l6-6 6 6"></path>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"></path>',
    'chevron-right': '<path d="M9 6l6 6-6 6"></path>',
  };

  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[kind] || icons.spark}</svg>`;
}

async function renderHomeCategoryMenu(currentCategory = 'all') {
  const nav = document.querySelector('.category-grid');
  if (!nav) return;

  let categories = HOME_CATEGORY_FALLBACK_ITEMS;
  try {
    const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      categories = res.data.map((item) => ({
        name: String(item.name || '').trim(),
      })).filter((item) => item.name);
    }
  } catch (error) {
    console.warn('[Main] category load failed, fallback used:', error);
  }

  if (!categories.length) {
    categories = HOME_CATEGORY_FALLBACK_ITEMS;
  }

  const expanded = getHomeCategoryExpandedState();
  const hasMore = categories.length > HOME_CATEGORY_COLLAPSED_LIMIT;

  nav.innerHTML = `
    <div class="home-category-shell" data-home-category-shell data-expanded="${expanded ? 'true' : 'false'}">
      <div class="home-category-grid">
        ${categories.map((item, index) => {
          const meta = resolveHomeCategoryMeta(item.name, index);
          const isActive = currentCategory === item.name;
          return `
            <a href="#" class="home-category-item${isActive ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}" style="--category-accent:${meta.accent};">
              <span class="home-category-icon">${svgIcon(meta.icon)}</span>
              <span class="home-category-label">${escapeHtml(item.name)}</span>
            </a>
          `;
        }).join('')}
        ${hasMore ? `
          <button type="button" class="home-category-toggle" data-category-toggle aria-expanded="${expanded ? 'true' : 'false'}" style="--category-accent:#ffffff;">
            <span class="home-category-toggle-icon">${svgIcon(expanded ? 'chevron-up' : 'chevron-down')}</span>
            <span class="home-category-toggle-label">${expanded ? '접기' : '더보기'}</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

const bannerTimers = {
  hero: null,
  bottom: null,
};

function clearBannerTimer(key) {
  if (bannerTimers[key]) {
    clearInterval(bannerTimers[key]);
    bannerTimers[key] = null;
  }
}

function buildBannerLinkMarkup(banner, className, innerHTML, targetBlank = true) {
  const link = (banner.linkUrl || '').trim();
  if (!link) {
    return `<div class="${className}">${innerHTML}</div>`;
  }
  return `<a class="${className}" href="${escapeHtml(link)}"${targetBlank ? ' target="_blank" rel="noopener noreferrer"' : ''}>${innerHTML}</a>`;
}

function renderHeroBanner(container, banners) {
  clearBannerTimer('hero');
  if (!container) return;

  if (!banners.length) {
    container.innerHTML = `
      <div class="banner-hero-empty" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;background:linear-gradient(135deg,#151515 0%,#070707 100%);border-radius:24px;color:#fff;">
        <h2 style="margin:0;font-size:clamp(2rem, 4vw, 3.5rem);color:rgba(255,255,255,0.18);letter-spacing:0.28em;font-weight:900;">광고</h2>
        <p style="margin:0;color:rgba(255,255,255,0.55);font-size:0.95rem;">메인 홈페이지 배너를 등록해 주세요.</p>
      </div>
    `;
    return;
  }

  const slides = banners.map((banner, index) => {
    const inner = `
      <img src="${escapeHtml(banner.imgUrl || '')}" alt="${escapeHtml(banner.title || `배너 ${index + 1}`)}"
        style="width:100%;height:100%;object-fit:contain;display:block;background:#0b0b0b;">
    `;
    return buildBannerLinkMarkup(banner, `banner-hero-slide${index === 0 ? ' is-active' : ''}`, inner);
  }).join('');

  const dots = banners.length > 1
    ? `<div class="banner-hero-dots" style="display:flex;gap:0.5rem;align-items:center;">
        ${banners.map((_, index) => `<button type="button" class="banner-dot${index === 0 ? ' active' : ''}" data-banner-dot="${index}" aria-label="배너 ${index + 1}" style="width:10px;height:10px;border-radius:999px;border:none;background:${index === 0 ? '#fff' : 'rgba(255,255,255,0.35)'};cursor:pointer;padding:0;"></button>`).join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div class="banner-hero-shell" style="position:relative;width:100%;height:100%;min-height:280px;overflow:hidden;border-radius:24px;background:linear-gradient(135deg,#111 0%,#050505 100%);box-shadow:0 20px 40px rgba(0,0,0,0.4);">
      ${slides}
      ${banners.length > 1 ? `
        <div class="banner-hero-controls" style="position:absolute;left:1rem;right:1rem;bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;pointer-events:none;z-index:5;">
          <button type="button" class="banner-nav banner-nav-prev" aria-label="banner navigation" style="pointer-events:auto;">${svgIcon('chevron-left')}</button>
          ${dots}
          <button type="button" class="banner-nav banner-nav-next" aria-label="banner navigation" style="pointer-events:auto;">${svgIcon('chevron-right')}</button>
        </div>
      ` : ''}
    </div>
  `;

  if (banners.length <= 1) return;

  const slideNodes = Array.from(container.querySelectorAll('.banner-hero-slide'));
  const dotNodes = Array.from(container.querySelectorAll('[data-banner-dot]'));
  let current = 0;

  const applyState = (index) => {
    current = (index + banners.length) % banners.length;
    slideNodes.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.style.opacity = active ? '1' : '0';
      slide.style.transform = `translate3d(0, 0, 0) scale(${active ? '1' : '0.98'})`;
      slide.style.zIndex = active ? '2' : '1';
    });
    dotNodes.forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === current);
      dot.style.background = dotIndex === current ? '#fff' : 'rgba(255,255,255,0.35)';
    });
  };

  const next = () => applyState(current + 1);
  const prev = () => applyState(current - 1);

  container.querySelector('.banner-nav-prev')?.addEventListener('click', prev);
  container.querySelector('.banner-nav-next')?.addEventListener('click', next);
  dotNodes.forEach((dot) => {
    dot.addEventListener('click', () => applyState(Number(dot.dataset.bannerDot || 0)));
  });

  applyState(0);
  bannerTimers.hero = window.setInterval(next, 6000);
}

function renderBottomBanner(container, banners) {
  clearBannerTimer('bottom');
  if (!container) return;

  if (!banners.length) {
    container.innerHTML = `
      <div class="bottom-banner-empty" style="min-height:260px;border-radius:28px;background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.55);letter-spacing:0.2em;font-weight:700;">
        배너
      </div>
    `;
    return;
  }

  const slides = banners.map((banner, index) => {
    const inner = `
      <img src="${escapeHtml(banner.imgUrl || '')}" alt="${escapeHtml(banner.title || `하단 배너 ${index + 1}`)}"
        style="width:100%;height:100%;object-fit:contain;display:block;background:#111;">
    `;
    return buildBannerLinkMarkup(banner, 'banner-bottom-slide', inner);
  }).join('');

  container.innerHTML = `
    <div class="banner-bottom-shell" style="position:relative;width:100%;min-height:280px;padding:0 4.75rem;">
      <div class="banner-bottom-stage" style="position:relative;width:100%;min-height:280px;overflow:hidden;">
        ${slides}
      </div>
      ${banners.length > 1 ? `
        <button type="button" class="banner-nav banner-nav-prev banner-bottom-prev" aria-label="banner navigation" style="position:absolute;left:1rem;top:50%;transform:translateY(-50%);">${svgIcon('chevron-left')}</button>
        <button type="button" class="banner-nav banner-nav-next banner-bottom-next" aria-label="banner navigation" style="position:absolute;right:1rem;top:50%;transform:translateY(-50%);">${svgIcon('chevron-right')}</button>
      ` : ''}
    </div>
  `;

  const slideNodes = Array.from(container.querySelectorAll('.banner-bottom-slide'));
  if (slideNodes.length === 0) return;

  let current = 0;
  const applyState = (index) => {
    current = (index + banners.length) % banners.length;
    slideNodes.forEach((slide, slideIndex) => {
      let offset = slideIndex - current;
      if (offset > banners.length / 2) offset -= banners.length;
      if (offset < -banners.length / 2) offset += banners.length;

      const isCenter = offset === 0;
      const isSide = Math.abs(offset) === 1;
      const isVisible = isCenter || isSide;

      let translateX = '0%';
      let scale = isCenter ? '1' : '0.86';
      let opacity = isCenter ? '1' : '0.32';
      let blur = isCenter ? '0' : '1px';
      let zIndex = isCenter ? '3' : '2';

      if (offset === -1) translateX = '-62%';
      if (offset === 1) translateX = '62%';
      if (Math.abs(offset) > 1) {
        translateX = offset < 0 ? '-115%' : '115%';
        opacity = '0';
        scale = '0.75';
        blur = '3px';
        zIndex = '1';
      }

      slide.style.opacity = opacity;
      slide.style.transform = `translate3d(-50%, -50%, 0) translateX(${translateX}) scale(${scale})`;
      slide.style.filter = `blur(${blur})`;
      slide.style.zIndex = zIndex;
      slide.style.pointerEvents = isVisible ? 'auto' : 'none';
    });
  };

  const next = () => applyState(current + 1);
  const prev = () => applyState(current - 1);

  container.querySelector('.banner-bottom-prev')?.addEventListener('click', prev);
  container.querySelector('.banner-bottom-next')?.addEventListener('click', next);

  applyState(0);
  if (banners.length > 1) {
    bannerTimers.bottom = window.setInterval(next, 6500);
  }
}

async function initMainPage(currentCategory = 'all') {
  console.log('[Main] Initializing page from D1...');
  const popularGrid = document.getElementById('popularClassGrid');
  const allGrid = document.getElementById('allClassGrid');
  const recommendContainer = document.getElementById('dynamicRecommendContainer');
  const popularSection = document.getElementById('popularSection');
  const recommendSection = document.getElementById('recommendSection');

  try {
    const [allRes, recRes] = await Promise.all([
      window.BSQ.api('/api/classes?limit=100', { cacheBust: false }),
      window.BSQ.api('/api/recommendations', { cacheBust: false }),
    ]);

    if (allRes.success) {
      const list = safeArray(allRes.data?.classes ?? allRes.data);
      globalAllClasses = list;
      if (allGrid) renderClassCards(globalAllClasses, allGrid);
      if (currentCategory !== 'all') {
        filterAllClassesByCategory(currentCategory);
      }
    } else if (allGrid) {
      allGrid.innerHTML = '<p class="empty-state">Failed to load classes.</p>';
    }

    if (recRes.success) {
      const folders = safeArray(recRes.data?.folders ?? recRes.data);
      console.log('[Main] Recommendation folders received:', folders);

      const popularFolder = folders.find((f) => f.type === 'popular');
      const popularClasses = safeArray(popularFolder?.classes);
      if (popularClasses.length > 0) {
        const popularTitle = document.getElementById('popularGroupTitle');
        if (popularTitle) popularTitle.textContent = popularFolder.title || 'Popular Classes';
        if (popularGrid) renderClassCards(popularClasses, popularGrid);
        setVisible(popularSection, true);
      } else {
        setVisible(popularSection, false);
      }

      const regularFolders = folders.filter((f) => f.type === 'regular');
      if (regularFolders.length > 0 && recommendContainer) {
        recommendContainer.innerHTML = '';
        regularFolders.forEach((folder) => {
          const folderClasses = safeArray(folder.classes);
          const folderTitle = escapeHtml(folder.title || '');
          const folderDescription = escapeHtml(folder.description || '');
          const folderCategory = encodeURIComponent(String(folder.category || 'all'));
          const columnHTML = `
            <div class="recommend-column">
              <div class="column-header">
                <div class="header-text">
                  <h4>${folderTitle}</h4>
                  <p class="desc">${folderDescription}</p>
                </div>
                <a href="../class/class_list.html?cat=${folderCategory}" class="btn-more-arrow">More</a>
              </div>
              <div class="mini-card-list">
                ${folderClasses.map((cls) => {
                  const thumb = escapeHtml(cls.thumbnail || cls.image_url || '');
                  const classId = encodeURIComponent(String(cls.id || ''));
                  const classTitle = escapeHtml(cls.title || '');
                  const classCategory = escapeHtml(cls.category || '');
                  const classInstructor = escapeHtml(cls.instructor_name || '');
                  return `
                    <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${classId}'" style="cursor:pointer;">
                      <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
                      <div class="mini-info">
                        <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${classTitle}</h5>
                        <p class="m-meta">${classCategory} | ${classInstructor}</p>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
          recommendContainer.insertAdjacentHTML('beforeend', columnHTML);
        });
        setVisible(recommendSection, true);
      } else {
        setVisible(recommendSection, false);
      }
    } else {
      setVisible(recommendSection, false);
    }
  } catch (err) {
    console.error('[Main] Init failed', err);
    if (allGrid) {
      allGrid.innerHTML = '<p class="empty-state">Failed to load classes.</p>';
    }
  }
}

function filterAllClassesByCategory(categoryName) {
  const allGrid = document.getElementById('allClassGrid');
  const filtered = globalAllClasses.filter((cls) => String(cls.category || '').trim() === String(categoryName || '').trim());
  if (allGrid) renderClassCards(filtered, allGrid);
}

function renderClassCards(classes, container) {
  if (!container) return;
  if (!classes || classes.length === 0) {
    container.innerHTML = '<p class="empty-state">No classes available.</p>';
    return;
  }

  container.innerHTML = classes.map((cls) => {
    const discountRate = parseInt(cls.discount_rate, 10) || 0;
    const originalPrice = parseInt(cls.price, 10) || 0;
    const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;
    const thumb = escapeHtml(cls.thumbnail || cls.image_url || '/assets/default-cover.svg');
    const classId = encodeURIComponent(String(cls.id || ''));
    const classTitle = escapeHtml(cls.title || '');
    const classCategory = escapeHtml(cls.category || 'Class');
    const instructorName = escapeHtml(cls.instructor_name || 'Instructor');
    const likeCount = Number(cls.like_count || cls.bookmark_count || 0);

    return `
      <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${classId}'" style="cursor:pointer;">
        <div class="card-thumbnail">
          <img src="${thumb}" alt="${classTitle}" style="width:100%; height:100%; object-fit:cover;">
          <div class="card-badges">
            ${cls.coupon_pack ? '<span class="badge-coupon">Coupon</span>' : ''}
            ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% OFF</span>` : ''}
          </div>
          <button type="button" class="btn-bookmark" data-action="bookmark-class" data-class-id="${classId}" aria-label="찜하기" onclick="event.stopPropagation();">${svgIcon('bookmark')}</button>
        </div>
        <div class="card-info">
          <span class="category">${classCategory}</span>
          <h4 class="title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${classTitle}</h4>
          <span class="creator">${instructorName}</span>
          <div class="rating-info">
            <span class="inline-icon inline-icon-star">${svgIcon('star')}</span>
            <span class="score">${cls.avg_rating || '0.0'}</span>
            <span class="count">(${cls.review_count || '0'})</span>
            <span class="count count-like"><span class="inline-icon inline-icon-heart">${svgIcon('heart')}</span>${likeCount}</span>
          </div>
          <div class="price-info">
            ${cls.discount_rate > 0 ? `<span class="discount">${cls.discount_rate}%</span>` : ''}
            <span class="price">${Math.round(currentPrice).toLocaleString()} KRW</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-action="bookmark-class"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const classId = button.dataset.classId;
      if (!window.BSQ?.isLoggedIn) {
        if (confirm('찜하기를 사용하려면 로그인이 필요합니다. 로그인 화면으로 이동할까요?')) {
          window.location.href = `../login/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        }
        return;
      }

      const original = button.innerHTML;
      button.disabled = true;
      try {
        const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: classId });
        if (!res.success) throw new Error(res.error || '??? ??');
        button.innerHTML = svgIcon(res.data?.bookmarked ? 'bookmark-filled' : 'bookmark');
        button.setAttribute('aria-pressed', res.data?.bookmarked ? 'true' : 'false');
      } catch (error) {
        alert(`??? ??? ??????: ${error.message}`);
        button.innerHTML = original;
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderMiniCards(classes, container) {
  if (!container) return;
  if (!classes || classes.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:#999; padding: 1rem;">No recommended classes.</p>';
    return;
  }

  container.innerHTML = classes.map((cls) => {
    const thumb = cls.thumbnail || cls.image_url || '';
    return `
      <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
        <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
        <div class="mini-info">
          <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${cls.title}</h5>
          <p class="m-meta">${cls.category || ''} | ${cls.instructor_name || cls.creator_name || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function initBanners() {
  const adBanner = document.querySelector('.main-ad-banner');
  const bottomBanner = document.querySelector('.bottom-banner-section');
  const result = await window.BSQ.api('/api/site-settings', { cacheBust: false });
  if (!result.success) return;

  const topBanners = safeArray(result.data?.banners);
  const bottomBanners = safeArray(result.data?.bottom_banners);

  if (adBanner) {
    renderHeroBanner(adBanner, topBanners);
  }
  if (bottomBanner) {
    renderBottomBanner(bottomBanner, bottomBanners);
  }
}

function initDrawer() {
  const btnHamburger = document.getElementById('btnHamburger');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawerMenu = document.getElementById('drawerMenu');

  if (btnHamburger && btnCloseDrawer && drawerOverlay && drawerMenu) {
    const toggleDrawer = (force) => {
      const active = typeof force === 'boolean' ? force : !drawerMenu.classList.contains('active');
      drawerMenu.classList.toggle('active', active);
      drawerOverlay.classList.toggle('active', active);
      document.body.style.overflow = active ? 'hidden' : '';
    };
    btnHamburger.addEventListener('click', toggleDrawer);
    btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
    drawerOverlay.addEventListener('click', () => toggleDrawer(false));
  }
}
