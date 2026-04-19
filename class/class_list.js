(function () {
  'use strict';

  const PAGE_SIZE = 8;
  const CATEGORY_VISIBLE_LIMIT = 8;
  const state = {
    categories: [],
    recommendationFolders: [],
    recommendationTitle: '추천 클래스 폴더',
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
    categoryPanelOpen: false,
  };

  const refs = {};
  let searchDebounce = null;
  let infiniteObserver = null;
  let bookmarkProbeDisabled = false;

  const FALLBACK_CATEGORIES = [
    { name: '운동', emoji: '운' },
    { name: '미술', emoji: '미' },
    { name: '비즈니스', emoji: '비' },
    { name: '요리', emoji: '요' },
    { name: '기술', emoji: '기' },
    { name: '음악', emoji: '음' },
  ];

  const SORT_LABELS = {
    newest: '최신순',
    popular: '인기순',
    'price-low': '가격 낮은 순',
    'price-high': '가격 높은 순',
  };

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

  function mergePopularClasses(primaryItems = [], fallbackItems = [], limit = 10) {
    const seen = new Set();
    const merged = [];

    const append = (item) => {
      const id = text(item?.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      merged.push(item);
      return merged.length >= limit;
    };

    for (const item of Array.isArray(primaryItems) ? primaryItems : []) {
      if (append(item)) return merged;
    }

    for (const item of Array.isArray(fallbackItems) ? fallbackItems : []) {
      if (append(item)) return merged;
    }

    if (!merged.length) return merged;
    if (merged.length >= limit) return merged.slice(0, limit);

    const padded = merged.slice();
    for (let index = 0; padded.length < limit; index += 1) {
      padded.push(merged[index % merged.length]);
    }
    return padded.slice(0, limit);
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

  function stripHtml(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getSummary(item = {}) {
    const raw = stripHtml(item.summary || item.short_description || item.description || item.intro || item.content || '');
    if (!raw) return '';
    return raw.length > 100 ? `${raw.slice(0, 97).trimEnd()}...` : raw;
  }

  function formatMode(item = {}) {
    const raw = text(item.class_type || item.type || item.mode || item.onlineOffline || '').toUpperCase();
    if (raw === 'ONLINE') return '온라인';
    if (raw === 'OFFLINE') return '오프라인';
    if (raw === 'VOD') return 'VOD';
    if (raw === 'ONEDAY') return '1일';
    if (raw === 'WEEKLY') return '주간';
    if (raw === 'MONTHLY') return '월간';
    return raw ? raw.charAt(0) + raw.slice(1).toLowerCase() : '';
  }

  function formatPriceLabel(item = {}) {
    const price = Number(item?.price ?? item?.salePrice ?? item?.sale_price ?? item?.discountPrice ?? item?.discount_price ?? 0);
    if (!Number.isFinite(price) || price <= 0) return '무료';
    return `${price.toLocaleString()}원`;
  }

  function cacheRefs() {
    refs.categoryFilter = $('categoryFilter');
    refs.notice = $('classListNotice');
    refs.allClassGrid = $('allClassGrid');
    refs.searchInput = $('classSearchInput');
    refs.sortSelect = $('sortSelect');
    refs.totalClassCount = $('totalClassCount');
    refs.bannerTrack = $('classListBannerTrack');
    refs.bannerPrev = $('classListBannerPrev');
    refs.bannerNext = $('classListBannerNext');
    refs.bannerDots = $('classListBannerDots');
    refs.recommendSection = $('recommendSection');
    refs.recommendTitle = $('recommendGroupTitle');
    refs.recommendCopy = $('recommendGroupCopy');
    refs.recommendFolderGrid = $('recommendFolderGrid');
    refs.scrollSentinel = $('classListSentinel');
    refs.heroLoaded = $('classListStatLoaded');
    refs.heroCategories = $('classListStatCategories');
    refs.heroSort = $('classListStatSort');
    refs.sectionTitle = $('classListSectionTitle');
    refs.sectionCopy = $('classListSectionCopy');
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

  function setNotice(message = '', tone = '') {
    if (!refs.notice) return;
    if (!message) {
      refs.notice.innerHTML = '';
      return;
    }
    refs.notice.innerHTML = `<div class="notice-chip ${esc(tone)}">${esc(message)}</div>`;
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
    return `
      <button type="button" class="class-category-tile${active ? ' is-active' : ''}" data-cat="${esc(all ? 'all' : item.name)}" aria-pressed="${active ? 'true' : 'false'}">
        ${all ? '<span class="class-category-icon">+</span>' : renderCategoryMedia(item)}
        <span class="class-category-label">${esc(label)}</span>
      </button>
    `;
  }

  function renderCategoryMenu() {
    return renderCategoryMenuV2();
    if (!refs.categoryFilter) return;
    const items = categoryItems();
    const visible = items.slice(0, CATEGORY_VISIBLE_LIMIT);
    const extra = items.slice(CATEGORY_VISIBLE_LIMIT);
    const hasMore = extra.length > 0;
    const selectedItem = state.currentCategory === 'all'
      ? { name: '전체', class_count: state.totalCount || items.length }
      : (items.find((item) => item.name === state.currentCategory) || { name: state.currentCategory, class_count: 0 });
    const selectedCount = Number(selectedItem.class_count || 0);
    const summaryCount = state.currentCategory === 'all' ? Number(state.totalCount || items.length) : selectedCount;
    const summaryLabel = state.currentCategory === 'all' ? '전체 카테고리' : selectedItem.name;

    refs.categoryFilter.innerHTML = `
      <div class="class-category-accordion-head">
        <button type="button" class="class-category-accordion-toggle${state.categoryPanelOpen ? ' is-open' : ''}" data-action="toggle-category-panel" aria-expanded="${state.categoryPanelOpen ? 'true' : 'false'}" aria-controls="classCategoryAccordionPanel">
          <span class="banner-eyebrow">카테고리</span>
          <span class="class-category-accordion-title">${esc(summaryLabel)}</span>
          <span class="class-category-accordion-meta">${esc(`${summaryCount.toLocaleString()}개`)}</span>
          <span class="class-category-accordion-state">${state.categoryPanelOpen ? '접기' : '더보기'}</span>
        </button>
      </div>
      <div class="class-category-accordion-strip">
        <div class="class-category-strip">
          ${renderCategoryButton({ name: '전체', class_count: state.totalCount }, state.currentCategory === 'all', true)}
          ${visible.map((item) => renderCategoryButton(item, state.currentCategory === item.name)).join('')}
        </div>
      </div>
      ${hasMore ? `
        <div class="class-category-accordion-panel${state.categoryPanelOpen ? ' is-open' : ''}" id="classCategoryAccordionPanel" aria-hidden="${state.categoryPanelOpen ? 'false' : 'true'}">
          <div class="class-category-panel-head">
            <strong>더 많은 카테고리</strong>
            <span>${extra.length.toLocaleString()}개</span>
          </div>
          <div class="class-category-strip class-category-strip--expanded">
            ${extra.map((item) => renderCategoryButton(item, state.currentCategory === item.name)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  function getCategoryHeroBanner() {
    const banners = Array.isArray(state.siteSettings?.bottom_banners) ? state.siteSettings.bottom_banners : [];
    const first = banners.find((item) => text(item?.imgUrl || item?.image || item?.src || '').trim());
    if (!first) return null;
    return normalizeBannerItem(first, '?대옒??배너', 0);
  }

  function renderCategoryMenuV2() {
    if (!refs.categoryFilter) return;

    const items = categoryItems();
    const selectedItem = state.currentCategory === 'all'
      ? { name: '?꾩껜', class_count: state.totalCount || items.length }
      : (items.find((item) => item.name === state.currentCategory) || { name: state.currentCategory, class_count: 0 });
    const selectedCount = Number(selectedItem.class_count || 0);
    const summaryCount = state.currentCategory === 'all' ? Number(state.totalCount || items.length) : selectedCount;
    const summaryLabel = state.currentCategory === 'all' ? '?꾩껜 移댄뀒怨좊━' : selectedItem.name;
    const heroBanner = getCategoryHeroBanner();
    const heroStyle = heroBanner?.imageUrl ? ` style="background-image:url('${esc(heroBanner.imageUrl)}')"` : '';

    refs.categoryFilter.innerHTML = `
      <section class="class-category-surface">
        <div class="class-category-hero-band${heroBanner?.imageUrl ? ' has-image' : ''}"${heroStyle}>
          <div class="class-category-hero-overlay"></div>
          <div class="class-category-hero-copy">
            <span class="banner-eyebrow">移댄뀒怨좊━</span>
            <strong class="class-category-hero-title">${esc(summaryLabel)}</strong>
            <span class="class-category-hero-count">${esc(`${summaryCount.toLocaleString()}개`)}</span>
          </div>
          ${heroBanner?.linkUrl ? `<a class="class-category-hero-link" href="${esc(heroBanner.linkUrl)}" aria-label="${esc(heroBanner.alt || '추천 배너')}"></a>` : ''}
        </div>
        <div class="class-category-panel-head">
          <strong class="class-category-panel-title">전체 카테고리</strong>
          <span class="class-category-panel-meta">${esc(`${items.length.toLocaleString()}개`)}</span>
        </div>
        <div class="class-category-grid">
          ${renderCategoryButton({ name: '?꾩껜', class_count: state.totalCount || items.length }, state.currentCategory === 'all', true)}
          ${items.map((item) => renderCategoryButton(item, state.currentCategory === item.name)).join('')}
        </div>
      </section>
    `;
  }

  function renderBanner(slides) {
    if (!refs.bannerTrack) return;
    const list = (Array.isArray(slides) ? slides : [])
      .map((item, index) => normalizeBannerItem(item, '클래스 배너', index))
      .filter((item) => item.imageUrl);

    const fallback = list.length ? list : [{
      imageUrl: '',
      linkUrl: '',
      alt: '클래스 배너',
    }];

    state.bannerIndex = Math.min(state.bannerIndex, fallback.length - 1);

    refs.bannerTrack.innerHTML = fallback.map((slide, index) => `
      <article class="class-list-banner-slide${index === state.bannerIndex ? ' is-active' : ''}">
        ${slide.imageUrl
          ? slide.linkUrl
            ? `<a class="class-list-banner-link" href="${esc(slide.linkUrl)}" aria-label="${esc(slide.alt)}">
                <img src="${esc(slide.imageUrl)}" alt="${esc(slide.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}">
              </a>`
            : `<div class="class-list-banner-link">
                <img src="${esc(slide.imageUrl)}" alt="${esc(slide.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}">
              </div>`
          : `<div class="class-list-banner-link is-fallback class-list-banner-empty" aria-hidden="true">
              <div class="class-list-banner-empty-copy">
                <span class="banner-eyebrow">추천 배너</span>
                <strong>배너를 준비하는 중입니다</strong>
                <p>운영자가 설정한 이미지가 없을 때 표시되는 기본 안내 화면입니다.</p>
              </div>
            </div>`
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
      console.warn('[class_list] banner load failed:', error);
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
      console.warn('[class_list] category load failed:', error);
    }
    state.categories = FALLBACK_CATEGORIES.slice();
  }

  function recommendationFolderUrl(folderId = '') {
    return `../recommend_view.html?id=${encodeURIComponent(folderId)}`;
  }

  function formatFallbackRecommendationTitle(name, index) {
    const cleaned = text(name)
      .replace(/[?]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return `추천 클래스 ${index + 1}`;
    return `${cleaned} 추천 클래스`;
  }

  function buildFallbackRecommendationFolders(classes = []) {
    const buckets = new Map();
    for (const item of Array.isArray(classes) ? classes : []) {
      if (!item?.id) continue;
      const key = text(item.category || '추천 클래스');
      if (!buckets.has(key)) buckets.set(key, []);
      const bucket = buckets.get(key);
      if (bucket.length < 3) bucket.push(item);
    }

    return Array.from(buckets.entries())
      .slice(0, 3)
      .map(([name, items], index) => ({
        id: `fallback-recommend-${index}`,
        title: formatFallbackRecommendationTitle(name, index),
        description: '현재 노출 중인 클래스를 기준으로 자동 구성한 추천 폴더입니다.',
        imageUrl: items[0]?.imageUrl || '',
        linkUrl: recommendationFolderUrl(`fallback-recommend-${index}`),
        items,
      }))
      .filter((folder) => folder.items.length);
  }

  function renderRecommendationFolder(folder = {}, index = 0) {
    const items = Array.isArray(folder.items) ? folder.items.slice(0, 3) : [];
    const folderUrl = text(folder.linkUrl || recommendationFolderUrl(folder.id));
    const imageStyle = folder.imageUrl ? ` style="background-image:url('${esc(folder.imageUrl)}')"` : '';
    const itemCount = `${items.length.toLocaleString()}개 클래스`;

    return `
      <article class="recommend-folder-card" data-folder-id="${esc(folder.id)}" style="animation-delay:${index * 0.05}s">
        <a class="recommend-folder-media" href="${esc(folderUrl)}" aria-label="${esc(folder.title)} 폴더 보기"${imageStyle}>
          <span class="recommend-folder-badge">추천 폴더</span>
          <span class="recommend-folder-count">${esc(itemCount)}</span>
        </a>
        <div class="recommend-folder-body">
          <div class="recommend-folder-topline">
            <div>
              <p class="recommend-folder-kicker">추천 클래스</p>
              <h4 class="recommend-folder-title">${esc(folder.title)}</h4>
              ${folder.description ? `<p class="recommend-folder-copy">${esc(folder.description)}</p>` : ''}
            </div>
            <a class="recommend-folder-view-more" href="${esc(folderUrl)}">폴더 보기</a>
          </div>
          <div class="recommend-folder-list">
            ${items.map((item, itemIndex) => `
              <a href="${esc(classUrl(item.id))}" class="recommend-item">
                <span class="recommend-num">${itemIndex + 1}</span>
                <div class="recommend-thumb"${item.imageUrl ? ` style="background-image:url('${esc(item.imageUrl)}')"` : ''}></div>
                <div class="recommend-info">
                  <h4>${esc(item.title)}</h4>
                  <div class="recommend-meta">
                    <span>${esc(item.category)}</span>
                    <span>${esc(item.mode || '온라인')}</span>
                    <span>후기 ${Number(item.reviewCount || 0).toLocaleString()}</span>
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
    if (!refs.recommendSection || !refs.recommendFolderGrid || !refs.recommendTitle || !refs.recommendCopy) return;
    const folders = Array.isArray(state.recommendationFolders) ? state.recommendationFolders : [];
    refs.recommendTitle.textContent = state.recommendationTitle || '추천 클래스 폴더';
    refs.recommendCopy.textContent = folders.length
      ? '운영자 추천 폴더를 카드 흐름으로 보여줍니다.'
      : '추천 폴더가 없어 현재 클래스를 기준으로 자동 구성했습니다.';
    refs.recommendSection.hidden = !folders.length;
    refs.recommendFolderGrid.innerHTML = folders.map((folder, index) => renderRecommendationFolder(folder, index)).join('');
  }

  async function loadRecommendations() {
    let folders = [];

    try {
      const res = await window.BSQ.api('/api/recommendations');
      folders = res?.success && Array.isArray(res.data)
        ? res.data.map((item) => normalizeRecommendationFolder(item)).filter((item) => item.id && item.items.length)
        : [];
    } catch (error) {
      console.warn('[class_list] recommendation load failed:', error);
    }

    if (!folders.length) {
      try {
        const res = await window.BSQ.api('/api/classes?sort=popular&limit=12');
        const rows = res?.success
          ? (Array.isArray(res.data?.classes) ? res.data.classes : (Array.isArray(res.data) ? res.data : []))
          : [];
        const fallbackClasses = rows.map((item) => normalizeClassCard(item)).filter((item) => item.id);
        folders = buildFallbackRecommendationFolders(fallbackClasses);
      } catch (error) {
        console.warn('[class_list] fallback recommendation load failed:', error);
        folders = [];
      }
    }

    state.recommendationFolders = folders;
    state.recommendationTitle = '추천 클래스 폴더';
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
            <h4 class="title">${esc(item.title)}</h4>
            <div class="card-meta">
              <span class="card-meta-item card-meta-category">${esc(item.category)}</span>
              <span class="card-meta-item card-meta-mode">${esc(item.mode || '온라인/오프라인')}</span>
              <span class="card-meta-item card-meta-review">후기 ${Number(item.reviewCount || 0).toLocaleString()}</span>
              <span class="card-meta-item card-meta-price">${esc(formatPriceLabel(item))}</span>
            </div>
          </div>
        </a>
        <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${esc(item.id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${count}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '찜 해제' : '찜하기'}">${bookmarkIcon(bookmarked)}</button>
      </article>
    `;
  }

  function isMobileClassListLayout() {
    try {
      return window.matchMedia?.('(max-width: 768px)')?.matches || document.body?.dataset?.mobileShellMode === 'discover';
    } catch {
      return false;
    }
  }

  function getClassListSummaryText() {
    const categoryLabel = state.currentCategory === 'all' ? '전체 카테고리' : state.currentCategory;
    const sortLabel = SORT_LABELS[state.currentSort] || '최신순';
    if (state.searchQuery) {
      return `"${state.searchQuery}" 검색 · ${categoryLabel} · ${sortLabel}`;
    }
    return `${categoryLabel} · ${sortLabel}`;
  }

  function updateHeader() {
    const mobileLayout = isMobileClassListLayout();
    const currentTitle = state.currentCategory === 'all' ? '전체 클래스' : `${state.currentCategory} 클래스`;
    const desktopCopy = state.searchQuery
      ? `"${state.searchQuery}" 검색 결과입니다. (${SORT_LABELS[state.currentSort] || '최신순'})`
      : '카테고리, 검색, 정렬을 한 흐름 안에서 정리합니다.';

    if (refs.sectionTitle) {
      refs.sectionTitle.textContent = currentTitle;
    }

    if (refs.sectionCopy) {
      refs.sectionCopy.textContent = mobileLayout ? getClassListSummaryText() : desktopCopy;
    }

    if (refs.heroSort) refs.heroSort.textContent = SORT_LABELS[state.currentSort] || '최신순';
    if (refs.heroCategories) refs.heroCategories.textContent = String(state.categories.length || 0);
    if (refs.heroLoaded) refs.heroLoaded.textContent = String(state.classResults.length || 0);
  }

  function updateCount(value) {
    if (refs.totalClassCount) {
      refs.totalClassCount.textContent = `${Number(value || 0).toLocaleString()}개 클래스`;
    }
  }

  function setLoading(flag) {
    state.loading = !!flag;
    if (refs.allClassGrid) refs.allClassGrid.dataset.loading = flag ? 'true' : 'false';
  }

  function sortQuery(sortValue) {
    if (sortValue === 'popular') return { sort: 'popular' };
    if (sortValue === 'price-low') return { sort: 'price', order: 'asc' };
    if (sortValue === 'price-high') return { sort: 'price', order: 'desc' };
    return { sort: 'newest' };
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
      refs.allClassGrid.innerHTML = '<div class="empty-state">클래스를 불러오는 중입니다...</div>';
      updateCount(0);
    }

    setLoading(true);
    setNotice(reset ? '클래스 목록을 불러오는 중입니다.' : '클래스를 더 불러오는 중입니다.', 'loading');

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

      const rows = res?.success
        ? (Array.isArray(res.data?.classes) ? res.data.classes : (Array.isArray(res.data) ? res.data : []))
        : [];
      const normalized = rows.map((item) => normalizeClassCard(item)).filter((item) => item.id);
      const meta = res?.meta || {};

      if (reset) state.classResults = normalized.slice();
      else state.classResults.push(...normalized);

      if (reset) refs.allClassGrid.innerHTML = '';
      if (normalized.length) {
        refs.allClassGrid.insertAdjacentHTML('beforeend', normalized.map((item, index) => renderCard(item, state.offset + index)).join(''));
        void hydrateBookmarkStates(normalized);
      } else if (reset) {
        refs.allClassGrid.innerHTML = '<div class="empty-state">선택한 조건에 맞는 클래스가 없습니다.</div>';
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
      console.error('[class_list] load error:', error);
      setNotice(error?.message || '클래스를 불러오지 못했습니다.', 'error');
      if (reset) refs.allClassGrid.innerHTML = '<div class="empty-state">클래스를 불러오지 못했습니다.</div>';
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
    button.setAttribute('aria-label', bookmarked ? '찜 해제' : '찜하기');
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
      if (!res?.success || !res.data) throw new Error(res?.error || '찜 상태를 불러오지 못했습니다.');
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
      setNotice('Log in to use bookmarks.', 'error');
      return;
    }

    button.dataset.pending = '1';
    button.disabled = true;

    const previous = state.bookmarkMap.get(id) || { bookmarked: false, count: 0, synced: true };

    try {
      const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: id });
      if (!res?.success) throw new Error(res?.error || '찜을 업데이트하지 못했습니다.');
      syncBookmarkUi(id, !!res.data?.bookmarked, Number(res.data?.count || 0));
      setNotice(res.data?.bookmarked ? 'Class saved.' : 'Bookmark removed.', 'success');
    } catch (error) {
      syncBookmarkUi(id, previous.bookmarked, previous.count);
      setNotice(error?.message || '찜을 업데이트하지 못했습니다.', 'error');
    } finally {
      button.dataset.pending = '0';
      button.disabled = false;
    }
  }

  function selectCategory(nextCategory) {
    state.currentCategory = text(nextCategory || 'all') || 'all';
    syncUrl({ replace: true });
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
      const bookmarkBtn = event.target.closest('[data-action="bookmark-class"]');
      if (bookmarkBtn) {
        event.preventDefault();
        event.stopPropagation();
        void toggleBookmark(bookmarkBtn.dataset.classId, bookmarkBtn);
        return;
      }

      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'toggle-category-panel') {
        event.preventDefault();
        state.categoryPanelOpen = !state.categoryPanelOpen;
        renderCategoryMenu();
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

  function bookmarkIcon(bookmarked = false) {
    const outline = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
    const filled = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"></path>';
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${bookmarked ? filled : outline}</svg>`;
  }

  async function bootstrap() {
    await window.BSQ?.ready;
    cacheRefs();
    readUrlState();
    state.categoryPanelOpen = !isMobileClassListLayout();
    bindEvents();
    renderCategoryMenu();
    updateHeader();
    updateCount(0);

    await Promise.all([loadBanner(), loadCategories()]);
    renderCategoryMenu();
    updateHeader();

    await Promise.all([loadMore({ reset: true })]);
    setupInfiniteScroll();
    ensureViewportFilled();
    syncUrl({ replace: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    void bootstrap().catch((error) => {
      console.error('[class_list] bootstrap failed:', error);
      setNotice(error?.message || 'Failed to initialize class explorer.', 'error');
    });
  });
})();
