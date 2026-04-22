(function () {
  'use strict';

  const PAGE_SIZE = 8;

  const FALLBACK_CATEGORIES = [
    { name: '드로잉', emoji: '✏️', class_count: 0 },
    { name: '음악', emoji: '🎵', class_count: 0 },
    { name: '비즈니스', emoji: '💼', class_count: 0 },
    { name: '요리', emoji: '🍳', class_count: 0 },
    { name: '기술', emoji: '💻', class_count: 0 },
    { name: '운동', emoji: '🏃', class_count: 0 },
  ];

  const SORT_LABELS = {
    newest: '최신순',
    popular: '인기순',
    'price-low': '가격 낮은순',
    'price-high': '가격 높은순',
  };

  const state = {
    categories: [],
    recommendationFolders: [],
    currentCategory: 'all',
    currentSort: 'newest',
    searchQuery: '',
    totalCount: 0,
    offset: 0,
    hasMore: true,
    loading: false,
    requestToken: 0,
    classResults: [],
    bookmarkMap: new Map(),
    siteSettings: null,
    bannerIndex: 0,
    bannerTimer: null,
  };

  const refs = {};
  let searchDebounce = null;
  let infiniteObserver = null;
  let bookmarkProbeDisabled = false;

  function $(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value ?? '').trim();
  }

  function esc(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEsc(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value ?? ''));
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function classUrl(id) {
    return `../class_view/class_view.html?id=${encodeURIComponent(id)}`;
  }

  function devLog(level, ...args) {
    if (typeof window.__BSQ_DEV_LOG__ === 'function') {
      window.__BSQ_DEV_LOG__(level, ...args);
      return;
    }

    const fn = typeof console?.[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
    fn(...args);
  }

  function stripHtml(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  function isUltraCompactViewport() {
    try {
      return window.matchMedia?.('(max-width: 280px)')?.matches;
    } catch {
      return false;
    }
  }

  function formatCountLabel(value, suffix = '개') {
    const count = Number(value || 0);
    const base = count.toLocaleString();
    if (isUltraCompactViewport()) return base;
    return suffix ? `${base}${suffix}` : base;
  }

  function getSummary(item = {}) {
    const raw = stripHtml(item.summary || item.short_description || item.description || item.intro || item.content || '');
    if (!raw) return '';
    return raw.length > 92 ? `${raw.slice(0, 89).trimEnd()}...` : raw;
  }

  function formatMode(item = {}) {
    const raw = text(item.class_type || item.type || item.mode || item.onlineOffline || '').toUpperCase();
    if (raw === 'ONLINE') return '온라인';
    if (raw === 'OFFLINE') return '오프라인';
    if (raw === 'VOD') return 'VOD';
    if (raw === 'ONEDAY') return '원데이';
    if (raw === 'WEEKLY') return '주간';
    if (raw === 'MONTHLY') return '월간';
    return raw ? raw.charAt(0) + raw.slice(1).toLowerCase() : '';
  }

  function formatPriceLabel(item = {}) {
    const price = Number(item?.price ?? item?.salePrice ?? item?.sale_price ?? item?.discountPrice ?? item?.discount_price ?? 0);
    if (!Number.isFinite(price) || price <= 0) return '무료';
    return `${price.toLocaleString()}원`;
  }

  function normalizeBannerItem(item = {}, fallbackLabel = '배너', index = 0) {
    const imageUrl = text(item.mobileImage || item.desktopImage || item.imageUrl || item.imgUrl || item.image || item.src || '');
    const linkUrl = text(item.url || item.href || item.link || item.linkUrl || '');
    const alt = text(item.alt || item.title || item.label || `${fallbackLabel} ${index + 1}`);
    return { imageUrl, linkUrl, alt };
  }

  function normalizeClassCard(item = {}) {
    const createdAt = parseDateValue(item.created_at || item.createdAt || null);
    const rating = Number(item.rating ?? item.avg_rating ?? 0);
    const reviewCount = Number(item.reviewCount ?? item.review_count ?? 0);
    const likeCount = Number(item.likeCount ?? item.like_count ?? item.bookmark_count ?? 0);
    const price = Number(item.salePrice ?? item.sale_price ?? item.discountPrice ?? item.discount_price ?? item.price ?? 0);

    return {
      id: text(item.id || item.classId || item.class_id || item.slug || ''),
      title: text(item.title || item.name || '제목 없음'),
      category: text(item.category || item.categoryName || '기본'),
      instructor: text(item.instructor_name || item.creator_name || item.instructor || item.teacher || 'B-Square'),
      imageUrl: text(item.thumbnail || item.coverImage || item.image || item.image_url || '/assets/default-cover.svg'),
      rating: Number.isFinite(rating) ? rating : 0,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
      likeCount: Number.isFinite(likeCount) ? likeCount : 0,
      summary: getSummary(item),
      mode: formatMode(item),
      price: Number.isFinite(price) ? price : 0,
      createdAt,
      isNew: Boolean(item.isNew) || Boolean(createdAt && (Date.now() - createdAt.getTime()) <= (3 * 24 * 60 * 60 * 1000)),
      raw: item,
    };
  }

  function normalizeRecommendationFolder(folder = {}) {
    const items = Array.isArray(folder.items) ? folder.items : (Array.isArray(folder.classes) ? folder.classes : []);
    return {
      id: text(folder.id || folder.folderId || folder.folder_id || ''),
      title: text(folder.title || folder.name || '추천 클래스'),
      description: text(folder.description || ''),
      imageUrl: text(folder.coverImage || folder.cover_image || folder.thumbnail || folder.icon || ''),
      linkUrl: text(folder.url || folder.href || folder.link || folder.linkUrl || ''),
      type: text(folder.type || 'folder'),
      items: items.map((item) => normalizeClassCard(item)).filter((item) => item.id),
    };
  }

  function buildRecommendationFallbackFolders(classes = []) {
    const buckets = new Map();

    for (const item of Array.isArray(classes) ? classes : []) {
      const key = text(item.category || 'General') || 'General';
      if (!buckets.has(key)) buckets.set(key, []);
      if (buckets.get(key).length < 3) buckets.get(key).push(item);
    }

    return Array.from(buckets.entries()).slice(0, 3).map(([name, items], index) => ({
      id: `fallback-${index}`,
      title: text(name || '추천 클래스'),
      description: '기준에 맞는 추천 묶음입니다.',
      imageUrl: items[0]?.imageUrl || '',
      items,
      type: '추천',
    }));
  }

  function categoryItems() {
    const base = state.categories.length ? state.categories : FALLBACK_CATEGORIES;
    const seen = new Set();

    return base
      .map((item) => ({
        name: text(item.name),
        emoji: text(item.emoji || String(item.name || '?').charAt(0).toUpperCase()),
        image_url: text(item.image_url || ''),
        class_count: Number(item.class_count || 0),
      }))
      .filter((item) => item.name && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()));
  }

  function renderCategoryMedia(item) {
    return item.image_url
      ? `<span class="class-category-icon"><img src="${esc(item.image_url)}" alt="${esc(item.name)}" loading="lazy"></span>`
      : `<span class="class-category-icon">${esc(item.emoji)}</span>`;
  }

  function renderCategoryButton(item, active = false, all = false) {
    const label = all ? '전체' : item.name;
    const count = Number(item.class_count || 0);

    return `
      <button type="button" class="class-category-tile${active ? ' is-active' : ''}" data-cat="${esc(all ? 'all' : item.name)}" aria-pressed="${active ? 'true' : 'false'}">
        ${all ? '<span class="class-category-icon">+</span>' : renderCategoryMedia(item)}
        <span class="class-category-label">${esc(label)}</span>
        <span class="class-category-count">${esc(formatCountLabel(count))}</span>
      </button>
    `;
  }

  function renderCategoryMenu() {
    if (!refs.categoryFilter) return;

    const items = categoryItems();
    const activeItem = state.currentCategory === 'all'
      ? { name: '전체 카테고리', class_count: state.totalCount || items.length }
      : (items.find((item) => item.name === state.currentCategory) || { name: state.currentCategory, class_count: 0 });
    const summaryCount = state.currentCategory === 'all' ? Number(state.totalCount || items.length) : Number(activeItem.class_count || 0);
    const summaryLabel = state.currentCategory === 'all' ? '전체 카테고리' : activeItem.name;

    refs.categoryFilter.innerHTML = `
      <section class="class-category-surface">
        <div class="class-category-panel-head">
          <div class="class-category-panel-copy">
            <span class="banner-eyebrow">카테고리</span>
            <strong class="class-category-panel-title">${esc(summaryLabel)}</strong>
            <span class="class-category-panel-copy-text">짧게 눌러 범위를 좁혀보세요.</span>
          </div>
          <span class="class-category-panel-meta">${esc(formatCountLabel(summaryCount))}</span>
        </div>
        <div class="class-category-grid class-category-rail">
          ${renderCategoryButton({ name: '전체', class_count: state.totalCount || items.length }, state.currentCategory === 'all', true)}
          ${items.map((item) => renderCategoryButton(item, state.currentCategory === item.name)).join('')}
        </div>
      </section>
    `;
  }

  function renderBanner(slides) {
    if (!refs.bannerTrack) return;

    const list = (Array.isArray(slides) ? slides : [])
      .map((item, index) => normalizeBannerItem(item, '배너', index))
      .filter((item) => item.imageUrl);
    const fallback = list.length ? list : [{ imageUrl: '', linkUrl: '', alt: '배너' }];

    state.bannerIndex = Math.min(state.bannerIndex, fallback.length - 1);

    refs.bannerTrack.innerHTML = fallback.map((slide, index) => `
      <article class="class-list-banner-slide${index === state.bannerIndex ? ' is-active' : ''}">
        ${slide.imageUrl
          ? slide.linkUrl
            ? `<a class="class-list-banner-link" href="${esc(slide.linkUrl)}" aria-label="${esc(slide.alt)}"><img src="${esc(slide.imageUrl)}" alt="${esc(slide.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}"></a>`
            : `<div class="class-list-banner-link"><img src="${esc(slide.imageUrl)}" alt="${esc(slide.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}"></div>`
          : `<div class="class-list-banner-link is-fallback class-list-banner-empty" aria-hidden="true"></div>`
        }
      </article>
    `).join('');

    if (refs.bannerDots) {
      refs.bannerDots.innerHTML = fallback.map((_, index) => `
        <button type="button" class="home-banner-dot${index === state.bannerIndex ? ' is-active' : ''}" data-banner-dot="${index}" aria-label="배너 ${index + 1}"></button>
      `).join('');
      refs.bannerDots.hidden = fallback.length <= 1;
    }

    clearInterval(state.bannerTimer);
    if (fallback.length > 1) {
      state.bannerTimer = setInterval(() => setActiveBanner(state.bannerIndex + 1), 7000);
    }
  }

  function setActiveBanner(nextIndex) {
    const slides = refs.bannerTrack?.querySelectorAll('.class-list-banner-slide') || [];
    if (!slides.length) return;

    state.bannerIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => slide.classList.toggle('is-active', index === state.bannerIndex));
    refs.bannerDots?.querySelectorAll('[data-banner-dot]').forEach((dot, index) => {
      dot.classList.toggle('is-active', index === state.bannerIndex);
    });
  }

  async function loadBanner() {
    try {
      const res = await window.BSQ.api('/api/site-settings');
      state.siteSettings = res?.success ? (res.data || null) : null;
    } catch (error) {
      devLog('warn', '[class_list] banner load failed:', error);
      state.siteSettings = null;
    }

    if (refs.bannerTrack && refs.bannerTrack.offsetParent !== null) {
      renderBanner(state.siteSettings?.bottom_banners || []);
    }
  }

  async function loadCategories() {
    try {
      const res = await window.BSQ.api('/api/class-categories');
      if (res?.success && Array.isArray(res.data) && res.data.length) {
        state.categories = res.data.map((item) => ({
          name: text(item.name),
          emoji: text(item.emoji || String(item.name || '?').charAt(0).toUpperCase()),
          image_url: text(item.image_url || ''),
          class_count: Number(item.class_count || 0),
        })).filter((item) => item.name);
        return;
      }
    } catch (error) {
      devLog('warn', '[class_list] category load failed:', error);
    }

    state.categories = FALLBACK_CATEGORIES.slice();
  }

  function renderRecommendationFolder(folder = {}) {
    const items = Array.isArray(folder.items) ? folder.items : [];
    const visibleItems = items.slice(0, isMobileClassListLayout() ? 2 : 3);

    return `
      <article class="recommend-folder-card">
        <div class="recommend-folder-body">
          <div>
            <h4 class="recommend-folder-title">${esc(folder.title || '추천 클래스')}</h4>
            ${folder.description ? `<p class="recommend-folder-copy">${esc(folder.description)}</p>` : ''}
          </div>
          <div class="recommend-folder-list">
            ${visibleItems.map((item, index) => `
              <a href="${esc(classUrl(item.id))}" class="recommend-item">
                <span class="recommend-num">${index + 1}</span>
                <div class="recommend-thumb"${item.imageUrl ? ` style="background-image:url('${esc(item.imageUrl)}')"` : ''}></div>
                <div class="recommend-info">
                  <h4>${esc(item.title)}</h4>
                  <div class="recommend-meta">
                    <span>${esc(item.mode || '온라인')}</span>
                    <span class="recommend-price">${esc(formatPriceLabel(item))}</span>
                  </div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      </article>
    `;
  }

  function renderRecommendations() {
    if (!refs.recommendSection || !refs.recommendFolderGrid) return;
    const items = Array.isArray(state.recommendationFolders) ? state.recommendationFolders : [];
    refs.recommendSection.hidden = !items.length;
    refs.recommendFolderGrid.innerHTML = items.map((item) => renderRecommendationFolder(item)).join('');
  }

  async function loadRecommendations() {
    let folders = [];

    try {
      const res = await window.BSQ.api('/api/recommendations');
      const source = res?.success
        ? (Array.isArray(res.data)
          ? res.data
          : (Array.isArray(res.data?.folders) ? res.data.folders : (Array.isArray(res.data?.items) ? res.data.items : [])))
        : [];
      folders = source.map((item) => normalizeRecommendationFolder(item)).filter((item) => item.id || item.items.length);
    } catch (error) {
      devLog('warn', '[class_list] recommendation load failed:', error);
    }

    if (!folders.length) {
      try {
        const res = await window.BSQ.api('/api/classes?sort=popular&limit=12');
        const rows = res?.success
          ? (Array.isArray(res.data?.classes) ? res.data.classes : (Array.isArray(res.data) ? res.data : []))
          : [];
        const classes = rows.map((item) => normalizeClassCard(item)).filter((item) => item.id);
        folders = buildRecommendationFallbackFolders(classes);
      } catch (error) {
        devLog('warn', '[class_list] fallback recommendation load failed:', error);
        folders = [];
      }
    }

    state.recommendationFolders = folders.slice(0, 3);
    renderRecommendations();
  }

  function renderCard(item, index) {
    const cached = state.bookmarkMap.get(item.id);
    const bookmarked = !!cached?.bookmarked;
    const count = Number(cached?.count ?? item.likeCount ?? 0);

    return `
      <article class="class-card" data-class-id="${esc(item.id)}" style="animation-delay:${index * 0.04}s">
        <a class="class-card-link" href="${esc(classUrl(item.id))}" aria-label="${esc(item.title)} details">
          <div class="card-thumbnail">
            <img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy">
            <div class="card-badges" aria-hidden="true">
              ${item.isNew ? '<span class="card-badge card-badge-new">NEW</span>' : ''}
            </div>
          </div>
          <div class="card-info">
            <div class="card-topline">
              <span class="card-category">${esc(item.category)}</span>
            </div>
            <h4 class="title">${esc(item.title)}</h4>
            ${item.summary ? `<p class="card-summary">${esc(item.summary)}</p>` : ''}
            <div class="card-meta">
              <span class="card-meta-item card-meta-mode">${esc(item.mode || '온라인')}</span>
              <span class="card-meta-item card-meta-price">${esc(formatPriceLabel(item))}</span>
            </div>
          </div>
        </a>
        <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${esc(item.id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${count}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '북마크 해제' : '북마크 추가'}">${bookmarkIcon(bookmarked)}</button>
      </article>
    `;
  }

  function renderCardSkeleton(index = 0) {
    return `
      <article class="class-card class-card-skeleton" aria-hidden="true" style="animation-delay:${index * 0.04}s">
        <div class="class-card-link">
          <div class="card-thumbnail class-card-skeleton-thumb"></div>
          <div class="card-info">
            <span class="class-card-skeleton-pill" style="width: 58%;"></span>
            <span class="class-card-skeleton-line class-card-skeleton-line-lg"></span>
            <span class="class-card-skeleton-line class-card-skeleton-line-md"></span>
          </div>
        </div>
        <div class="btn-bookmark class-card-skeleton-bookmark" aria-hidden="true"></div>
      </article>
    `;
  }

  function renderBannerLoadingState() {
    if (!refs.bannerTrack) return;

    refs.bannerTrack.innerHTML = `
      <article class="class-list-banner-slide is-active class-list-banner-skeleton" aria-hidden="true">
        <div class="class-list-banner-link class-list-banner-skeleton-media"></div>
      </article>
    `;
    if (refs.bannerDots) refs.bannerDots.hidden = true;
  }

  function renderRecommendationLoadingState() {
    if (!refs.recommendSection || !refs.recommendFolderGrid) return;

    refs.recommendSection.hidden = false;
    refs.recommendFolderGrid.innerHTML = Array.from({ length: 2 }).map((_, index) => `
      <article class="recommend-folder-card recommend-folder-skeleton" aria-hidden="true" style="animation-delay:${index * 0.05}s">
        <div class="recommend-folder-body">
          <div>
            <span class="recommend-skeleton-pill" style="width: 92px;"></span>
            <span class="recommend-skeleton-line" style="width: 76%;"></span>
            <span class="recommend-skeleton-line" style="width: 52%;"></span>
          </div>
          <div class="recommend-folder-list">
            ${Array.from({ length: 2 }).map(() => `
              <div class="recommend-item recommend-item-skeleton">
                <span class="recommend-num"></span>
                <div class="recommend-thumb recommend-thumb-skeleton"></div>
                <div class="recommend-info">
                  <span class="recommend-skeleton-line" style="width: 78%;"></span>
                  <span class="recommend-skeleton-line" style="width: 48%;"></span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderGridState(kind, title, body, actionLabel = '', actionName = '') {
    if (!refs.allClassGrid) return;
    refs.allClassGrid.innerHTML = `
      <div class="class-list-state-card ${esc(kind)}">
        <strong>${esc(title)}</strong>
        <p>${esc(body)}</p>
        ${actionLabel ? `<button type="button" class="class-list-state-action" data-action="${esc(actionName || 'retry-load')}">${esc(actionLabel)}</button>` : ''}
      </div>
    `;
  }

  function setNotice(message = '', tone = '', actionLabel = '') {
    if (!refs.notice) return;
    if (!message) {
      refs.notice.innerHTML = '';
      return;
    }

    refs.notice.innerHTML = `
      <div class="notice-chip ${esc(tone)}">
        <span>${esc(message)}</span>
        ${actionLabel ? `<button type="button" class="notice-chip-action" data-action="retry-load">${esc(actionLabel)}</button>` : ''}
      </div>
    `;
  }

  function updateCount(value) {
    if (refs.totalClassCount) {
      refs.totalClassCount.textContent = formatCountLabel(value, '개 클래스');
    }
  }

  function updateHeader() {
    const mobileLayout = isMobileClassListLayout();
    const currentTitle = mobileLayout
      ? (state.currentCategory === 'all' ? '전체' : state.currentCategory)
      : (state.currentCategory === 'all' ? '전체 클래스' : `${state.currentCategory} 클래스`);
    const sortLabel = SORT_LABELS[state.currentSort] || '최신순';
    const desktopCopy = state.searchQuery
      ? `"${state.searchQuery}" 검색 결과입니다. (${sortLabel})`
      : '정렬과 검색으로 원하는 클래스를 빠르게 좁혀보세요.';
    const compactCopy = state.searchQuery
      ? `${state.searchQuery} 결과`
      : sortLabel;

    if (refs.sectionTitle) {
      refs.sectionTitle.textContent = currentTitle;
    }

    if (refs.sectionCopy) {
      refs.sectionCopy.textContent = mobileLayout ? compactCopy : desktopCopy;
    }

    if (refs.heroSort) refs.heroSort.textContent = sortLabel;
    if (refs.heroCategories) refs.heroCategories.textContent = String(state.categories.length || 0);
    if (refs.heroLoaded) refs.heroLoaded.textContent = String(state.classResults.length || 0);
  }

  function syncCardGridColumns() {
    if (!refs.allClassGrid) return;
    const columns = isMobileClassListLayout()
      ? 'repeat(1, minmax(0, 1fr))'
      : 'repeat(5, minmax(0, 1fr))';
    refs.allClassGrid.style.setProperty('grid-template-columns', columns, 'important');

    const bannerMinHeight = isMobileClassListLayout() ? '132px' : '184px';
    if (refs.bannerCard) refs.bannerCard.style.setProperty('min-height', bannerMinHeight, 'important');
    if (refs.bannerInner) refs.bannerInner.style.setProperty('min-height', bannerMinHeight, 'important');
  }

  function setLoading(flag) {
    state.loading = !!flag;
    if (refs.allClassGrid) {
      refs.allClassGrid.dataset.loading = flag ? 'true' : 'false';
      refs.allClassGrid.setAttribute('aria-busy', flag ? 'true' : 'false');
    }
  }

  function sortQuery(sortValue) {
    if (sortValue === 'popular') return { sort: 'popular' };
    if (sortValue === 'price-low') return { sort: 'price', order: 'asc' };
    if (sortValue === 'price-high') return { sort: 'price', order: 'desc' };
    return { sort: 'newest' };
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    state.currentCategory = text(params.get('category') || 'all') || 'all';
    state.currentSort = text(params.get('sort') || 'newest') || 'newest';
    state.searchQuery = text(params.get('q') || '');
    if (!SORT_LABELS[state.currentSort]) state.currentSort = 'newest';
    if (refs.sortSelect) refs.sortSelect.value = state.currentSort;
    if (refs.searchInput) refs.searchInput.value = state.searchQuery;
  }

  function syncUrl({ replace = false } = {}) {
    const params = new URLSearchParams();
    if (state.currentCategory !== 'all') params.set('category', state.currentCategory);
    if (state.currentSort !== 'newest') params.set('sort', state.currentSort);
    if (state.searchQuery) params.set('q', state.searchQuery);
    const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    if (replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
  }

  function resetFilters() {
    state.currentCategory = 'all';
    state.currentSort = 'newest';
    state.searchQuery = '';
    if (refs.sortSelect) refs.sortSelect.value = 'newest';
    if (refs.searchInput) refs.searchInput.value = '';
    syncUrl({ replace: true });
    renderCategoryMenu();
    updateHeader();
    void loadMore({ reset: true });
  }

  function selectCategory(nextCategory) {
    state.currentCategory = text(nextCategory || 'all') || 'all';
    syncUrl({ replace: true });
    renderCategoryMenu();
    updateHeader();
    void loadMore({ reset: true });
  }

  function applySort(nextSort) {
    state.currentSort = SORT_LABELS[nextSort] ? nextSort : 'newest';
    if (refs.sortSelect) refs.sortSelect.value = state.currentSort;
    syncUrl({ replace: true });
    updateHeader();
    void loadMore({ reset: true });
  }

  function applySearch(nextQuery) {
    state.searchQuery = text(nextQuery || '');
    if (refs.searchInput) refs.searchInput.value = state.searchQuery;
    syncUrl({ replace: true });
    updateHeader();
    void loadMore({ reset: true });
  }

  function renderGridLoadingMessage(message, reset = false) {
    setNotice(message, 'loading');
    if (refs.allClassGrid) {
      refs.allClassGrid.dataset.loading = 'true';
      refs.allClassGrid.setAttribute('aria-busy', 'true');
      if (reset) {
        refs.allClassGrid.innerHTML = Array.from({ length: isMobileClassListLayout() ? 6 : 10 }).map((_, index) => renderCardSkeleton(index)).join('');
      }
    }
  }

  async function loadMore({ reset = false } = {}) {
    if (state.loading) return;
    if (!reset && !state.hasMore) return;

    const token = ++state.requestToken;

    if (reset) {
      state.offset = 0;
      state.hasMore = true;
      state.totalCount = 0;
      state.classResults = [];
      if (refs.allClassGrid) {
        refs.allClassGrid.innerHTML = '';
        refs.allClassGrid.dataset.loading = 'true';
        refs.allClassGrid.setAttribute('aria-busy', 'true');
      }
      updateCount(0);
    }

    setLoading(true);
    renderGridLoadingMessage(reset ? '클래스 목록을 불러오는 중입니다.' : '추가 클래스를 불러오는 중입니다.', reset);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(state.offset));
      Object.entries(sortQuery(state.currentSort)).forEach(([key, value]) => params.set(key, String(value)));
      if (state.currentCategory !== 'all') params.set('category', state.currentCategory);
      if (state.searchQuery) params.set('q', state.searchQuery);
      if (reset) params.set('include_total', '1');

      const res = await window.BSQ.api(`/api/classes?${params.toString()}`);
      if (token !== state.requestToken) return;
      if (!res?.success) throw new Error(text(res?.error || '클래스를 불러오지 못했습니다.'));

      const rows = Array.isArray(res.data?.classes) ? res.data.classes : (Array.isArray(res.data) ? res.data : []);
      const normalized = rows.map((item) => normalizeClassCard(item)).filter((item) => item.id);
      const meta = res?.meta || {};

      if (reset) state.classResults = normalized.slice();
      else state.classResults.push(...normalized);

      if (reset && refs.allClassGrid) refs.allClassGrid.innerHTML = '';

      if (normalized.length) {
        refs.allClassGrid.insertAdjacentHTML('beforeend', normalized.map((item, index) => renderCard(item, state.offset + index)).join(''));
        void hydrateBookmarkStates(normalized);
      } else if (reset) {
        const hasFilters = state.currentCategory !== 'all' || state.searchQuery || state.currentSort !== 'newest';
        renderGridState(
          'empty',
          '조건에 맞는 클래스가 없습니다.',
          hasFilters ? '검색어나 카테고리를 바꿔 보세요.' : '아직 등록된 클래스가 없습니다.',
          hasFilters ? '필터 초기화' : '',
          hasFilters ? 'reset-filters' : ''
        );
      }

      state.offset += normalized.length;
      state.hasMore = typeof meta.has_more === 'boolean' ? meta.has_more : normalized.length >= PAGE_SIZE;
      state.totalCount = Number(meta.total || meta.count || state.classResults.length);
      updateCount(state.totalCount || state.classResults.length);
      updateHeader();
      renderCategoryMenu();
      setNotice('');

      if (state.hasMore) ensureViewportFilled();
    } catch (error) {
      if (token !== state.requestToken) return;
      devLog('warn', '[class_list] load error:', error);
      state.hasMore = false;
      const message = error?.message || '클래스를 불러오지 못했습니다.';
      setNotice(message, 'error', '다시 불러오기');
      if (reset) {
        renderGridState('error', '클래스를 불러오지 못했습니다.', '네트워크 상태를 확인한 뒤 다시 시도해 주세요.', '다시 불러오기', 'retry-load');
      }
    } finally {
      if (token === state.requestToken) setLoading(false);
    }
  }

  function updateBookmarkButton(button, classId, bookmarked, count) {
    button.dataset.classId = classId;
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(Number(count || 0));
    button.classList.toggle('is-bookmarked', !!bookmarked);
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '북마크 해제' : '북마크 추가');
    button.innerHTML = bookmarkIcon(bookmarked);
  }

  function syncBookmarkUi(classId, bookmarked, count) {
    const id = text(classId);
    if (!id) return;

    const nextCount = Number(count || 0);
    state.bookmarkMap.set(id, { bookmarked: !!bookmarked, count: nextCount, synced: true });
    document.querySelectorAll(`.class-card[data-class-id="${cssEsc(id)}"]`).forEach((card) => {
      const button = card.querySelector('[data-action="bookmark-class"]');
      if (button) updateBookmarkButton(button, id, bookmarked, nextCount);
    });
  }

  async function hydrateBookmarkStates(items = []) {
    if (bookmarkProbeDisabled) return;
    if (window.BSQ?.ready?.then) {
      try { await window.BSQ.ready; } catch {}
    }
    if (!window.BSQ?.isLoggedIn) {
      bookmarkProbeDisabled = true;
      return;
    }

    const ids = Array.from(new Set(items.map((item) => text(item?.id)).filter(Boolean)));
    if (!ids.length) return;

    const results = await Promise.allSettled(ids.map(async (id) => {
      const cached = state.bookmarkMap.get(id);
      if (cached?.synced) return;
      const res = await window.BSQ.api(`/api/class-bookmarks?class_id=${encodeURIComponent(id)}`);
      if (!res?.success || !res.data) throw new Error(res?.error || '북마크 상태를 불러오지 못했습니다.');
      syncBookmarkUi(id, !!res.data.bookmarked, Number(res.data.count || 0));
    }));

    for (const result of results) {
      if (result.status === 'rejected') {
        const message = String(result.reason?.message || result.reason || '');
        if (/401|403|unauthorized|login/i.test(message)) {
          bookmarkProbeDisabled = true;
          return;
        }
      }
    }
  }

  async function toggleBookmark(classId, button) {
    const id = text(classId);
    if (!id || !window.BSQ?.api || button?.dataset.pending === '1') return;
    if (window.BSQ?.ready?.then) {
      try { await window.BSQ.ready; } catch {}
    }
    if (!window.BSQ?.isLoggedIn) {
      setNotice('북마크를 사용하려면 로그인하세요.', 'error');
      return;
    }

    button.dataset.pending = '1';
    button.disabled = true;

    const previous = state.bookmarkMap.get(id) || { bookmarked: false, count: 0, synced: true };

    try {
      const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: id });
      if (!res?.success) throw new Error(res?.error || '북마크를 업데이트하지 못했습니다.');
      syncBookmarkUi(id, !!res.data?.bookmarked, Number(res.data?.count || 0));
      setNotice(res.data?.bookmarked ? '클래스를 저장했습니다.' : '북마크를 해제했습니다.', 'success');
    } catch (error) {
      syncBookmarkUi(id, previous.bookmarked, previous.count);
      setNotice(error?.message || '북마크를 업데이트하지 못했습니다.', 'error');
    } finally {
      button.dataset.pending = '0';
      button.disabled = false;
    }
  }

  function bookmarkIcon(bookmarked = false) {
    const outline = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
    const filled = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"></path>';
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${bookmarked ? filled : outline}</svg>`;
  }

  function bindEvents() {
    refs.bannerPrev?.addEventListener('click', () => setActiveBanner(state.bannerIndex - 1));
    refs.bannerNext?.addEventListener('click', () => setActiveBanner(state.bannerIndex + 1));
    refs.bannerDots?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-banner-dot]');
      if (button) setActiveBanner(Number(button.dataset.bannerDot || 0));
    });

    refs.searchInput?.addEventListener('input', (event) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => applySearch(event.target.value || ''), 220);
    });

    refs.sortSelect?.addEventListener('change', (event) => applySort(event.target.value));

    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      const action = actionButton?.dataset.action;
      if (action === 'retry-load') {
        event.preventDefault();
        if (state.classResults.length > 0) {
          state.hasMore = true;
          void loadMore({ reset: false });
        } else {
          void loadMore({ reset: true });
        }
        return;
      }
      if (action === 'reset-filters') {
        event.preventDefault();
        resetFilters();
        return;
      }

      const bookmarkBtn = event.target.closest('[data-action="bookmark-class"]');
      if (bookmarkBtn) {
        event.preventDefault();
        event.stopPropagation();
        void toggleBookmark(bookmarkBtn.dataset.classId, bookmarkBtn);
        return;
      }

      const categoryBtn = event.target.closest('[data-cat]');
      if (!categoryBtn) return;
      const categoryScope = categoryBtn.closest('#categoryFilter');
      if (!categoryScope) return;
      event.preventDefault();
      selectCategory(categoryBtn.dataset.cat || 'all');
    });

    window.addEventListener('popstate', () => {
      readUrlState();
      renderCategoryMenu();
      updateHeader();
      void loadMore({ reset: true });
    });
  }

  function setupInfiniteScroll() {
    if (infiniteObserver) infiniteObserver.disconnect();
    if (!refs.scrollSentinel || !('IntersectionObserver' in window)) return;

    infiniteObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: '320px 0px' });

    infiniteObserver.observe(refs.scrollSentinel);
  }

  function ensureViewportFilled() {
    if (!refs.allClassGrid || state.loading || !state.hasMore) return;
    const rect = refs.allClassGrid.getBoundingClientRect();
    if (rect.bottom < window.innerHeight * 0.95) void loadMore();
  }

  function cacheRefs() {
    refs.bannerCard = document.querySelector('.class-list-banner-card');
    refs.bannerInner = document.querySelector('.class-list-banner-inner');
    refs.bannerTrack = $('classListBannerTrack');
    refs.bannerPrev = $('classListBannerPrev');
    refs.bannerNext = $('classListBannerNext');
    refs.bannerDots = $('classListBannerDots');
    refs.categoryFilter = $('categoryFilter');
    refs.notice = $('classListNotice');
    refs.allClassGrid = $('allClassGrid');
    refs.searchInput = $('classSearchInput');
    refs.sortSelect = $('sortSelect');
    refs.totalClassCount = $('totalClassCount');
    refs.recommendSection = $('recommendSection');
    refs.recommendFolderGrid = $('recommendFolderGrid');
    refs.scrollSentinel = $('classListSentinel');
    refs.heroLoaded = $('classListStatLoaded');
    refs.heroCategories = $('classListStatCategories');
    refs.heroSort = $('classListStatSort');
    refs.sectionTitle = $('classListSectionTitle');
    refs.sectionCopy = $('classListSectionCopy');
  }

  function isMobileClassListLayout() {
    try {
      return window.matchMedia?.('(max-width: 768px)')?.matches;
    } catch {
      return false;
    }
  }

  function renderLoadingState() {
    renderBannerLoadingState();
    renderRecommendationLoadingState();
    renderGridLoadingMessage('클래스 목록을 불러오는 중입니다.', true);
  }

  async function bootstrap() {
    await window.BSQ?.ready;
    cacheRefs();
    readUrlState();
    bindEvents();
    syncCardGridColumns();
    window.addEventListener('resize', syncCardGridColumns, { passive: true });
    renderCategoryMenu();
    updateHeader();
    updateCount(0);
    renderLoadingState();

    await Promise.all([loadBanner(), loadCategories()]);
    renderCategoryMenu();
    updateHeader();

    await Promise.all([loadRecommendations(), loadMore({ reset: true })]);
    setupInfiniteScroll();
    ensureViewportFilled();
    syncUrl({ replace: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    void bootstrap().catch((error) => {
      devLog('warn', '[class_list] bootstrap failed:', error);
      setNotice(error?.message || '클래스 목록을 초기화하지 못했습니다.', 'error');
    });
  });
})();
