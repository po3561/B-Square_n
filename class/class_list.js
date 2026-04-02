(function () {
  'use strict';

  const PAGE_SIZE = 5;
  const CATEGORY_VISIBLE_LIMIT = 9;
  const OVERLAY_HIDE_DELAY = 180;
  const FALLBACK_CATEGORIES = [
    { name: '디자인', emoji: '🎨' }, { name: '생산성', emoji: '⚡' }, { name: '스포츠', emoji: '🏅' },
    { name: '디지털 드로잉', emoji: '✏️' }, { name: '성공 마인드', emoji: '🧠' }, { name: '음악', emoji: '🎵' },
    { name: '요리', emoji: '🍳' }, { name: '사진', emoji: '📷' }, { name: '영상', emoji: '🎬' },
    { name: '공예', emoji: '🧵' }, { name: '여행', emoji: '🧭' }, { name: '베이킹', emoji: '🍰' },
    { name: 'AI', emoji: '🤖' }, { name: '어도비', emoji: '🪄' }, { name: '평생교육이용권', emoji: '🎫' },
    { name: '창업·부업', emoji: '💼' }, { name: '라이프스타일', emoji: '🌿' }, { name: '금융·재테크', emoji: '💰' },
    { name: '비즈니스', emoji: '📊' }, { name: '프로그래밍', emoji: '💻' }, { name: '마케팅', emoji: '📣' },
    { name: '제2외국어', emoji: '🔤' },
  ];

  const state = {
    categories: [],
    popularClasses: [],
    popularTitle: '지금 인기 있는 클래스',
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
    overlayOpen: false,
  };

  const refs = {};
  let searchDebounce = null;
  let infiniteObserver = null;
  let bookmarkProbeDisabled = false;
  const cssEsc = (value) => {
    const raw = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };
  const $ = (id) => document.getElementById(id);
  const text = (value) => String(value ?? '').trim();
  const catKey = (value) => text(value) || 'all';
  const sameCat = (a, b) => catKey(a) === catKey(b);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const priceText = (value) => {
    const n = Number(value || 0);
    return !Number.isFinite(n) || n <= 0 ? '무료' : `${Math.round(n).toLocaleString()}원`;
  };
  const effectivePrice = (item) => {
    const base = Number(item?.price || 0);
    const discount = Number(item?.discount_rate || 0);
    return !Number.isFinite(base) ? 0 : (!Number.isFinite(discount) || discount <= 0 ? base : Math.max(Math.round(base * (1 - discount / 100)), 0));
  };
  const summary = (item) => {
    const s = text(item?.summary || item?.description || item?.keywords || '');
    return s.length > 90 ? `${s.slice(0, 87)}...` : s;
  };
  const sortQuery = (sortValue) => {
    if (sortValue === 'popular') return { sort: 'popular' };
    if (sortValue === 'price-low') return { sort: 'price', order: 'asc' };
    if (sortValue === 'price-high') return { sort: 'price', order: 'desc' };
    return { sort: 'newest' };
  };
  const classUrl = (id) => `../class_view/class_view.html?id=${encodeURIComponent(id)}`;

  function ensureListHooks() {
    if (!refs.listSection || !refs.allClassGrid) return;

    if (!refs.popularSection) {
      const section = document.createElement('section');
      section.id = 'popularSection';
      section.className = 'class-popular-section';
      section.hidden = true;
      section.innerHTML = `
        <header class="class-popular-head">
          <h3 id="popularTitle">지금 인기 있는 클래스</h3>
        </header>
        <div class="card-grid class-popular-grid" id="popularClassGrid"></div>
      `;
      const header = refs.listSection.querySelector('.class-grid-header');
      if (header) refs.listSection.insertBefore(section, header);
      else refs.listSection.prepend(section);
      refs.popularSection = section;
      refs.popularTitle = section.querySelector('#popularTitle');
      refs.popularClassGrid = section.querySelector('#popularClassGrid');
    }

    if (!refs.scrollSentinel) {
      const sentinel = document.createElement('div');
      sentinel.id = 'classListSentinel';
      sentinel.className = 'class-list-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      refs.allClassGrid.insertAdjacentElement('afterend', sentinel);
      refs.scrollSentinel = sentinel;
    }
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
    refs.bannerControls = document.querySelector('.class-list-banner-controls');
    refs.listSection = document.querySelector('.class-lists-section');
    refs.groupTitle = refs.listSection?.querySelector('.group-title') || null;
    refs.groupSubtitle = refs.listSection?.querySelector('.group-subtitle') || null;
    refs.popularSection = refs.listSection?.querySelector('#popularSection') || null;
    refs.popularTitle = refs.listSection?.querySelector('#popularTitle') || null;
    refs.popularClassGrid = refs.listSection?.querySelector('#popularClassGrid') || null;
    refs.scrollSentinel = refs.listSection?.querySelector('#classListSentinel') || null;
    ensureListHooks();
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const category = text(params.get('category') || 'all') || 'all';
    const sort = text(params.get('sort') || 'newest') || 'newest';
    const query = text(params.get('q') || '');
    state.currentCategory = category;
    state.currentSort = ['newest', 'popular', 'price-low', 'price-high'].includes(sort) ? sort : 'newest';
    state.searchQuery = query;
    if (refs.sortSelect) refs.sortSelect.value = state.currentSort;
    if (refs.searchInput) refs.searchInput.value = state.searchQuery;
  }

  function syncUrl({ replace = false } = {}) {
    const params = new URLSearchParams();
    if (state.currentCategory && state.currentCategory !== 'all') params.set('category', state.currentCategory);
    if (state.currentSort && state.currentSort !== 'newest') params.set('sort', state.currentSort);
    if (state.searchQuery) params.set('q', state.searchQuery);
    const query = params.toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    if (replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
  }

  function setNotice(message, tone = '') {
    if (!refs.notice) return;
    refs.notice.textContent = message || '';
    refs.notice.dataset.tone = tone;
  }

  function renderCategoryMedia(item) {
    const img = text(item?.image_url || '');
    const emoji = text(item?.emoji || '✨');
    return img
      ? `<span class="class-category-icon class-category-icon-image"><img src="${esc(img)}" alt="${esc(item?.name || '')}" loading="lazy"></span>`
      : `<span class="class-category-icon class-category-icon-stack" aria-hidden="true"><span class="class-category-icon-emoji">${esc(emoji)}</span></span>`;
  }

  function categoryItems() {
    const raw = state.categories.length ? state.categories : FALLBACK_CATEGORIES;
    const seen = new Set();
    return raw.map((item) => ({
      name: text(item.name),
      image_url: text(item.image_url || ''),
      emoji: text(item.emoji || '✨'),
      class_count: Number(item.class_count || 0),
    })).filter((item) => item.name && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()));
  }

  function categoryButton(item, { active = false, compact = false, all = false } = {}) {
    const cls = compact ? 'class-category-tile class-category-tile-compact' : 'class-category-tile';
    const label = all ? '전체' : item.name;
    return `
      <button type="button" class="${cls}${active ? ' is-active' : ''}" data-cat="${esc(all ? 'all' : item.name)}" aria-pressed="${active ? 'true' : 'false'}" title="${esc(label)}">
        ${all ? '<span class="class-category-icon class-category-icon-stack" aria-hidden="true">✨</span>' : renderCategoryMedia(item)}
        <span class="class-category-label">${esc(label)}</span>
        ${item.class_count > 0 ? `<span class="class-category-count">${Number(item.class_count).toLocaleString()}</span>` : ''}
      </button>
    `;
  }

  function ensureOverlay() {
    if (document.querySelector('.class-category-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'class-category-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <button type="button" class="class-category-overlay-backdrop" data-action="close-category-overlay" aria-label="카테고리 닫기"></button>
      <div class="class-category-overlay-panel" role="dialog" aria-modal="true" aria-label="전체 카테고리">
        <div class="class-category-overlay-head">
          <div><span class="banner-eyebrow">Categories</span><h3>카테고리</h3></div>
          <button type="button" class="class-category-overlay-close" data-action="close-category-overlay">닫기</button>
        </div>
        <div class="class-category-overlay-grid" data-category-overlay-grid></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close-category-overlay') closeOverlay();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.overlayOpen) closeOverlay();
    });
  }

  function openOverlay() {
    state.overlayOpen = true;
    const overlay = document.querySelector('.class-category-overlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add('is-open');
    }
    document.body.classList.add('class-category-overlay-open');
    renderCategoryMenu();
  }

  function closeOverlay() {
    state.overlayOpen = false;
    const overlay = document.querySelector('.class-category-overlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      setTimeout(() => { if (!state.overlayOpen) overlay.hidden = true; }, OVERLAY_HIDE_DELAY);
    }
    document.body.classList.remove('class-category-overlay-open');
    renderCategoryMenu();
  }

  function renderCategoryMenu() {
    if (!refs.categoryFilter) return;
    const items = categoryItems();
    const visible = items.slice(0, CATEGORY_VISIBLE_LIMIT);
    refs.categoryFilter.innerHTML = `
      <div class="class-category-shell" data-category-shell data-expanded="${state.overlayOpen ? 'true' : 'false'}">
        <div class="class-category-strip">
          ${categoryButton({ name: '전체', class_count: 0, emoji: '✨' }, { active: state.currentCategory === 'all', compact: true, all: true })}
          ${visible.map((item) => categoryButton(item, { active: sameCat(item.name, state.currentCategory), compact: true })).join('')}
          ${items.length > CATEGORY_VISIBLE_LIMIT ? `
            <button type="button" class="class-category-tile class-category-toggle${state.overlayOpen ? ' is-active' : ''}" data-action="toggle-category-overlay" aria-expanded="${state.overlayOpen ? 'true' : 'false'}">
              <span class="class-category-icon class-category-icon-stack" aria-hidden="true">${state.overlayOpen ? '✕' : '⌄'}</span>
              <span class="class-category-label">${state.overlayOpen ? '닫기' : '더보기'}</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
    ensureOverlay();
    const grid = document.querySelector('.class-category-overlay [data-category-overlay-grid]');
    if (grid) {
      grid.innerHTML = [
        categoryButton({ name: '전체', class_count: 0, emoji: '✨' }, { active: state.currentCategory === 'all', all: true }),
        ...items.map((item) => categoryButton(item, { active: sameCat(item.name, state.currentCategory) })),
      ].join('');
    }
  }

  function renderBanner(slides) {
    if (!refs.bannerTrack) return;
    const fallback = [{
      title: '원하는 클래스를 더 빠르게 찾으세요',
      subtitle: '카테고리, 검색, 정렬을 한 화면에 정리했습니다.',
      description: '인기 클래스와 전체 목록을 같은 페이지에서 빠르게 탐색할 수 있습니다.',
      link_url: '../community/community.html',
      button_label: '커뮤니티 둘러보기',
      button_subtle_label: '홈으로 이동',
    }];
    const list = Array.isArray(slides) && slides.length ? slides : fallback;
    state.bannerIndex = list.length ? Math.min(state.bannerIndex, list.length - 1) : 0;
    refs.bannerTrack.innerHTML = list.map((slide, index) => {
      const img = text(slide.image_url || slide.image || '');
      return `
        <article class="class-list-banner-slide${index === state.bannerIndex ? ' is-active' : ''}" data-slide-index="${index}">
          <div class="class-list-banner-media${img ? '' : ' is-fallback'}"${img ? ` style="background-image:url('${esc(img)}')"` : ''}></div>
          <div class="class-list-banner-copy">
            <span class="banner-eyebrow">Class Explorer</span>
            <h1>${esc(text(slide.title || '원하는 클래스를 더 빠르게 찾으세요'))}</h1>
            ${text(slide.subtitle || '') ? `<p class="banner-subtitle">${esc(text(slide.subtitle))}</p>` : ''}
            ${text(slide.description || '') ? `<p class="banner-description">${esc(text(slide.description))}</p>` : ''}
            <div class="banner-actions class-list-banner-actions">
              <a class="banner-link" href="${esc(text(slide.link_url || '../class/class_list.html'))}">${esc(text(slide.button_label || '자세히 보기'))}</a>
              <a class="banner-link subtle" href="../index.html">${esc(text(slide.button_subtle_label || '홈으로 이동'))}</a>
            </div>
          </div>
        </article>
      `;
    }).join('');
    if (refs.bannerDots) refs.bannerDots.innerHTML = list.map((_, i) => `<button type="button" class="home-banner-dot${i === state.bannerIndex ? ' is-active' : ''}" data-banner-dot="${i}" aria-label="배너 ${i + 1}"></button>`).join('');
    if (refs.bannerPrev) refs.bannerPrev.hidden = list.length <= 1;
    if (refs.bannerNext) refs.bannerNext.hidden = list.length <= 1;
    if (refs.bannerDots) refs.bannerDots.hidden = list.length <= 1;
    if (refs.bannerControls) refs.bannerControls.hidden = list.length <= 1;
    clearInterval(state.bannerTimer);
    if (list.length > 1) state.bannerTimer = setInterval(() => setActiveBanner(state.bannerIndex + 1), 6000);
  }

  function setActiveBanner(nextIndex) {
    const slides = refs.bannerTrack?.querySelectorAll('.class-list-banner-slide') || [];
    if (!slides.length) return;
    const index = (nextIndex + slides.length) % slides.length;
    state.bannerIndex = index;
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
    refs.bannerDots?.querySelectorAll('[data-banner-dot]').forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  }

  async function loadBanner() {
    try {
      const res = await window.BSQ.api('/api/site-settings');
      state.siteSettings = res?.success ? (res.data || null) : null;
    } catch (error) {
      console.warn('[class_list] banner load failed:', error);
      state.siteSettings = null;
    }
    renderBanner(state.siteSettings?.bottom_banners || []);
  }

  async function loadCategories() {
    try {
      const res = await window.BSQ.api('/api/class-categories');
      if (res?.success && Array.isArray(res.data) && res.data.length) {
        state.categories = res.data.map((item) => ({
          name: text(item.name),
          emoji: text(item.emoji || '✨'),
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

  async function loadPopular() {
    try {
      const res = await window.BSQ.api('/api/recommendations');
      const folders = res?.success && Array.isArray(res.data) ? res.data : [];
      const popular = folders.find((item) => item.type === 'popular' || item.id === 'popular_main' || item.folder_id === 'popular_main');
      if (popular?.classes?.length) {
        state.popularClasses = popular.classes.slice(0, PAGE_SIZE);
        state.popularTitle = text(popular?.title || '지금 인기 있는 클래스') || '지금 인기 있는 클래스';
        renderPopular();
        return;
      }
    } catch (error) {
      console.warn('[class_list] popular load failed:', error);
    }

    try {
      const res = await window.BSQ.api('/api/classes?sort=popular&limit=5');
      const rows = res?.success && Array.isArray(res.data) ? res.data : [];
      state.popularClasses = rows.slice(0, PAGE_SIZE);
      state.popularTitle = '지금 인기 있는 클래스';
    } catch (error) {
      console.warn('[class_list] fallback popular load failed:', error);
      state.popularClasses = [];
      state.popularTitle = '지금 인기 있는 클래스';
    }
    renderPopular();
  }

  function renderPopular() {
    if (!refs.popularSection || !refs.popularClassGrid) return;
    if (refs.popularTitle) refs.popularTitle.textContent = state.popularTitle;
    if (!state.popularClasses.length) {
      refs.popularSection.hidden = true;
      refs.popularClassGrid.innerHTML = '';
      return;
    }
    refs.popularSection.hidden = false;
    refs.popularClassGrid.innerHTML = state.popularClasses.map((item, index) => renderCard(item, index, 'popular')).join('');
    void hydrateBookmarkStates(state.popularClasses);
  }

  function renderCard(item, index, variant = 'list') {
    const id = text(item?.id || item?.class_id || '');
    if (!id) return '';
    const title = text(item?.title || '제목 없음');
    const category = text(item?.category || '미분류');
    const instructor = text(item?.instructor_name || item?.creator_name || '작성자 정보 없음');
    const img = text(item?.thumbnail || item?.image_url || '/assets/default-cover.svg');
    const discount = Number(item?.discount_rate || 0);
    const price = Number(item?.price || 0);
    const current = effectivePrice(item);
    const avg = Number(item?.avg_rating || 0).toFixed(1);
    const reviews = Number(item?.review_count || 0);
    const participants = Number(item?.current_participants || item?.total_enrollments || 0);
    const isNew = item?.created_at ? (Date.now() - new Date(item.created_at).getTime()) < 48 * 60 * 60 * 1000 : false;
    const cached = state.bookmarkMap.get(id);
    const bookmarked = !!cached?.bookmarked;
    const count = Number(cached?.count ?? item?.like_count ?? item?.bookmark_count ?? 0);

    return `
      <article class="class-card class-list-card${variant === 'popular' ? ' class-card-popular' : ''}" data-class-id="${esc(id)}" style="animation-delay:${index * 0.05}s">
        <a class="class-card-link" href="${esc(classUrl(id))}" aria-label="${esc(title)} 상세 보기">
          <div class="card-thumbnail">
            <img src="${esc(img)}" alt="${esc(title)}" loading="lazy">
            <div class="card-badges">
              ${isNew ? '<span class="badge-new">NEW</span>' : ''}
              ${discount > 0 ? `<span class="badge-discount">${discount}% 할인</span>` : ''}
            </div>
          </div>
          <div class="card-info">
            <div class="card-topline">
              <span class="category">${esc(category)}</span>
              <span class="card-chip">${esc(instructor)}</span>
            </div>
            <h4 class="title">${esc(title)}</h4>
            ${summary(item) ? `<p class="card-summary">${esc(summary(item))}</p>` : ''}
            <div class="meta">
              <span class="rating">★ ${avg} (${reviews})</span>
              <span class="students">👥 ${participants}</span>
              <span class="likes">찜 ${Number(count || 0).toLocaleString()}</span>
            </div>
            <div class="price-info">
              ${discount > 0 ? `<span class="original-price">${priceText(price)}</span>` : ''}
              <span class="current-price">${priceText(current)}</span>
            </div>
          </div>
        </a>
        <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${esc(id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${count}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '찜 취소' : '찜하기'}">${bookmarked ? '♥' : '♡'}</button>
      </article>
    `;
  }

  function updateHeader() {
    if (refs.groupTitle) refs.groupTitle.textContent = state.currentCategory === 'all' ? '전체 클래스 목록' : `${state.currentCategory} 클래스`;
    if (refs.groupSubtitle) {
      refs.groupSubtitle.textContent = state.searchQuery
        ? `"${state.searchQuery}" 검색 결과와 선택한 정렬을 함께 보여줍니다.`
        : '카테고리, 검색, 정렬을 한 화면에서 빠르게 탐색할 수 있습니다.';
    }
  }

  function updateCount(n) {
    if (refs.totalClassCount) refs.totalClassCount.textContent = `총 ${Number(n || 0).toLocaleString()}개`;
  }

  function renderList(reset = false) {
    if (!refs.allClassGrid) return;
    if (reset) refs.allClassGrid.innerHTML = '';
    if (!state.classResults.length && reset) {
      refs.allClassGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted, #888);">${state.searchQuery ? `"${esc(state.searchQuery)}" 검색 결과가 없습니다.` : '선택한 조건에 맞는 클래스가 없습니다.'}</div>`;
      updateCount(0);
      return;
    }
    if (reset) {
      refs.allClassGrid.innerHTML = state.classResults.map((item, index) => renderCard(item, index, 'list')).join('');
    }
  }

  function setLoading(flag) {
    state.loading = !!flag;
    if (refs.allClassGrid) refs.allClassGrid.dataset.loading = flag ? 'true' : 'false';
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
      if (refs.allClassGrid) refs.allClassGrid.innerHTML = `<div class="empty-state class-list-loading" style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted, #888);">클래스 목록을 불러오는 중입니다...</div>`;
      updateCount(0);
    }

    setLoading(true);
    setNotice(reset ? '클래스 목록을 불러오는 중입니다.' : '더 많은 클래스를 불러오는 중입니다.', 'loading');
    try {
      const p = new URLSearchParams();
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(state.offset));
      Object.entries(sortQuery(state.currentSort)).forEach(([k, v]) => p.set(k, String(v)));
      if (state.currentCategory !== 'all') p.set('category', state.currentCategory);
      if (state.searchQuery) p.set('q', state.searchQuery);
      if (reset) p.set('include_total', '1');

      const res = await window.BSQ.api(`/api/classes?${p.toString()}`);
      if (token !== state.requestToken) return;
      if (!res?.success) {
        throw new Error(text(res?.error || '클래스 목록을 불러오지 못했습니다.'));
      }
      const rows = res?.success && Array.isArray(res.data) ? res.data : [];
      const meta = res?.meta || {};

      if (reset) state.classResults = rows.slice(); else state.classResults.push(...rows);
      if (reset) refs.allClassGrid.innerHTML = '';
      if (rows.length) {
        refs.allClassGrid.insertAdjacentHTML('beforeend', rows.map((item, index) => renderCard(item, state.offset + index, 'list')).join(''));
        void hydrateBookmarkStates(rows);
      } else if (reset) {
        renderList(true);
      }

      state.offset += rows.length;
      state.hasMore = typeof meta.has_more === 'boolean' ? (meta.has_more && rows.length > 0) : rows.length >= PAGE_SIZE;
      state.totalCount = Number(meta.total || meta.count || state.totalCount || state.offset);
      updateCount(state.totalCount || state.offset);
      updateHeader();
      setNotice('');
      if (state.hasMore) ensureViewportFilled();
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error('[class_list] load error:', error);
      setNotice(error?.message || '클래스 목록을 불러오지 못했습니다.', 'error');
      if (reset && refs.allClassGrid) refs.allClassGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted, #888);">클래스 목록을 불러오지 못했습니다.</div>`;
    } finally {
      if (token === state.requestToken) setLoading(false);
    }
  }

  function updateBookmarkButton(button, classId, bookmarked, count) {
    if (!button) return;
    button.dataset.classId = classId;
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(Number(count || 0));
    button.classList.toggle('is-bookmarked', !!bookmarked);
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '찜 취소' : '찜하기');
    button.textContent = bookmarked ? '♥' : '♡';
  }

  function syncBookmarkUi(classId, bookmarked, count) {
    const id = text(classId);
    if (!id) return;
    const nextCount = Number(count || 0);
    state.bookmarkMap.set(id, { bookmarked: !!bookmarked, count: nextCount, synced: true });
    const selector = `.class-card[data-class-id="${cssEsc(id)}"]`;
    document.querySelectorAll(selector).forEach((card) => {
      card.querySelectorAll('[data-action="bookmark-class"]').forEach((button) => {
        updateBookmarkButton(button, id, bookmarked, nextCount);
      });
      const likes = card.querySelector('.likes');
      if (likes) likes.textContent = `찜 ${nextCount.toLocaleString()}`;
    });
  }

  async function hydrateBookmarkStates(items = []) {
    if (bookmarkProbeDisabled || !window.BSQ?.isLoggedIn) {
      bookmarkProbeDisabled = true;
      return;
    }
    const ids = Array.from(new Set(items.map((item) => text(item?.id || item?.class_id || item)).filter(Boolean)));
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
        if (/401|403|unauthorized|로그인/i.test(message)) {
          bookmarkProbeDisabled = true;
          return;
        }
      }
    }
  }

  async function toggleBookmark(classId, button) {
    const id = text(classId);
    if (!id) return;
    if (button?.dataset.pending === '1') return;
    if (!window.BSQ?.api) return;
    if (!window.BSQ?.isLoggedIn) {
      setNotice('李?湲곕뒫???ъ슜?섎젮硫?濡쒓렇?명븯?몄슂.', 'error');
      return;
    }

    if (button) {
      button.dataset.pending = '1';
      button.disabled = true;
    }

    const previous = state.bookmarkMap.get(id) || { bookmarked: false, count: 0, synced: true };
    setNotice('찜 상태를 저장하는 중입니다.', 'loading');

    try {
      const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: id });
      if (!res?.success) throw new Error(res?.error || '찜 상태를 변경하지 못했습니다.');
      syncBookmarkUi(id, !!res.data?.bookmarked, Number(res.data?.count || 0));
      setNotice(res.data?.bookmarked ? '클래스가 찜 목록에 추가되었습니다.' : '찜이 해제되었습니다.', 'success');
    } catch (error) {
      syncBookmarkUi(id, previous.bookmarked, previous.count);
      const message = String(error?.message || '');
      setNotice(/401|403|unauthorized|로그인/i.test(message) ? '찜 기능을 사용하려면 로그인하세요.' : (message || '찜 상태를 변경하지 못했습니다.'), 'error');
    } finally {
      if (button) {
        button.dataset.pending = '0';
        button.disabled = false;
      }
    }
  }

  function selectCategory(nextCategory) {
    const category = text(nextCategory || 'all') || 'all';
    state.currentCategory = category;
    state.overlayOpen = false;
    closeOverlay();
    syncUrl({ replace: true });
    updateHeader();
    void loadMore({ reset: true });
  }

  function applySort(nextSort) {
    const sort = text(nextSort || 'newest') || 'newest';
    state.currentSort = ['newest', 'popular', 'price-low', 'price-high'].includes(sort) ? sort : 'newest';
    if (refs.sortSelect) refs.sortSelect.value = state.currentSort;
    syncUrl({ replace: true });
    updateHeader();
    void loadMore({ reset: true });
  }

  function applySearch(nextQuery) {
    const query = text(nextQuery || '');
    state.searchQuery = query;
    if (refs.searchInput) refs.searchInput.value = query;
    syncUrl({ replace: true });
    updateHeader();
    void loadMore({ reset: true });
  }

  function bindEvents() {
    refs.bannerPrev?.addEventListener('click', () => setActiveBanner(state.bannerIndex - 1));
    refs.bannerNext?.addEventListener('click', () => setActiveBanner(state.bannerIndex + 1));
    refs.bannerDots?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-banner-dot]');
      if (!btn) return;
      setActiveBanner(Number(btn.dataset.bannerDot || 0));
    });

    refs.searchInput?.addEventListener('input', (event) => {
      const value = event.target.value || '';
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => applySearch(value), 220);
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

      const toggleBtn = event.target.closest('[data-action="toggle-category-overlay"]');
      if (toggleBtn) {
        event.preventDefault();
        state.overlayOpen ? closeOverlay() : openOverlay();
        return;
      }

      const categoryBtn = event.target.closest('[data-cat]');
      if (categoryBtn && (categoryBtn.closest('#categoryFilter') || categoryBtn.closest('.class-category-overlay'))) {
        event.preventDefault();
        selectCategory(categoryBtn.dataset.cat || 'all');
      }
    });

    window.addEventListener('popstate', () => {
      readUrlState();
      renderCategoryMenu();
      updateHeader();
      void loadMore({ reset: true });
    });

    window.addEventListener('resize', debounce(() => ensureViewportFilled(), 180));
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
    if (rect.bottom < window.innerHeight * 0.95) {
      void loadMore();
    }
  }

  function debounce(fn, wait = 180) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  async function bootstrap() {
    await window.BSQ?.ready;
    cacheRefs();
    readUrlState();
    bindEvents();
    renderCategoryMenu();
    updateHeader();
    updateCount(0);

    await Promise.all([loadBanner(), loadCategories()]);
    renderCategoryMenu();
    updateHeader();

    await Promise.all([loadPopular(), loadMore({ reset: true })]);
    setupInfiniteScroll();
    ensureViewportFilled();
    syncUrl({ replace: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    void bootstrap().catch((error) => {
      console.error('[class_list] bootstrap failed:', error);
      setNotice(error?.message || '클래스 페이지를 초기화하지 못했습니다.', 'error');
    });
  });
  function formatCardMode(item) {
    const classType = text(item?.class_type || '').toUpperCase();
    if (classType === 'ONLINE') return '온라인';
    if (classType === 'OFFLINE') return '오프라인';
    if (classType === 'VOD') return 'VOD';
    if (classType) return classType;

    const operatingMode = text(item?.operating_mode || '').toUpperCase();
    if (operatingMode === 'ONEDAY') return '원데이';
    if (operatingMode === 'SEASON') return '시즌';
    if (operatingMode === 'WEEKLY') return '주간';
    if (operatingMode === 'MONTHLY') return '월간';
    return operatingMode;
  }

  function formatCardBadge() {
    return 'CLASS101+';
  }

  function bookmarkIcon(bookmarked = false) {
    const path = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
    const filled = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"></path>';
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${bookmarked ? filled : path}</svg>`;
  }

  renderCard = function renderCardOverride(item, index, variant = 'list') {
    const id = text(item?.id || item?.class_id || '');
    if (!id) return '';
    const title = text(item?.title || '제목 없음');
    const category = text(item?.category || '미분류');
    const instructor = text(item?.instructor_name || item?.creator_name || '작성자 정보 없음');
    const img = text(item?.thumbnail || item?.image_url || '/assets/default-cover.svg');
    const avg = Number(item?.avg_rating || 0).toFixed(1);
    const reviews = Number(item?.review_count || 0);
    const cached = state.bookmarkMap.get(id);
    const bookmarked = !!cached?.bookmarked;
    const count = Number(cached?.count ?? item?.like_count ?? item?.bookmark_count ?? 0);
    const mode = text(formatCardMode(item));
    const badge = formatCardBadge();

    return `
      <article class="class-card class-list-card${variant === 'popular' ? ' class-card-popular' : ''}" data-class-id="${esc(id)}" style="animation-delay:${index * 0.05}s">
        <a class="class-card-link" href="${esc(classUrl(id))}" aria-label="${esc(title)} 상세 보기">
          <div class="card-thumbnail">
            <img src="${esc(img)}" alt="${esc(title)}" loading="lazy">
            <div class="card-badges" aria-hidden="true">
              <span class="card-badge">${esc(badge)}</span>
            </div>
          </div>
          <div class="card-info">
            <h4 class="title">${esc(title)}</h4>
            <div class="card-topline">
              <span class="card-author">${esc(instructor)}</span>
              ${mode ? '<span class="card-divider" aria-hidden="true">|</span>' : ''}
              ${mode ? `<span class="card-mode">${esc(mode)}</span>` : ''}
            </div>
            <div class="meta">
              <span class="rating">★ ${avg} (${reviews})</span>
              <span class="meta-category">${esc(category)}</span>
            </div>
          </div>
        </a>
        <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${esc(id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${count}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '찜 취소' : '찜하기'}">${bookmarkIcon(bookmarked)}</button>
      </article>
    `;
  };

  updateBookmarkButton = function updateBookmarkButtonOverride(button, classId, bookmarked, count) {
    if (!button) return;
    button.dataset.classId = classId;
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(Number(count || 0));
    button.classList.toggle('is-bookmarked', !!bookmarked);
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '찜 취소' : '찜하기');
    button.innerHTML = bookmarkIcon(bookmarked);
  };
})();
