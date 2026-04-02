const FALLBACK_CLASS_CATEGORIES = [
  { name: '어도비', emoji: '🅰️' },
  { name: '평생교육이용권', emoji: '🎟️' },
  { name: 'AI 스킬업', emoji: '✨' },
  { name: '창업·부업', emoji: '🏪' },
  { name: '디지털 드로잉', emoji: '✏️' },
  { name: '라이프스타일', emoji: '🌿' },
  { name: '금융·재테크', emoji: '💰' },
  { name: '디자인', emoji: '🎨' },
  { name: '생산성', emoji: '📈' },
  { name: '사진·영상', emoji: '🎬' },
  { name: '운동', emoji: '🏃' },
  { name: '비즈니스', emoji: '💼' },
  { name: '프로그래밍', emoji: '💻' },
  { name: '제2 외국어', emoji: '🈯' },
  { name: '마케팅', emoji: '📣' },
  { name: '아이 교육', emoji: '👶' },
  { name: '외국어 시험', emoji: '📝' },
  { name: '부모 교육', emoji: '👨‍👩‍👧' },
];

const CLASS_LIST_FETCH_LIMIT = 60;
const CLASS_LIST_BOOKMARK_STORAGE_KEY = 'bsq.class-list.bookmarks';
const CATEGORY_COLLAPSED_COUNT = 11;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    allClasses: [],
    categories: [],
    currentCategory: urlParams.get('cat') || 'all',
    currentSort: 'newest',
    searchQuery: urlParams.get('q') || '',
    categoryMenuExpanded: false,
    bookmarkCounts: new Map(),
    bookmarkedIds: new Set(),
  };

  function showNotice(type, message, duration = 2800) {
    const host = document.getElementById('classListNotice');
    if (!host) return;
    host.innerHTML = '';

    const chip = document.createElement('div');
    chip.className = `notice-chip ${type || 'info'}`;
    chip.textContent = message;
    host.appendChild(chip);

    if (duration > 0) {
      window.setTimeout(() => {
        if (chip.isConnected) chip.remove();
      }, duration);
    }
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function truncateText(value = '', maxLength = 84) {
    const text = normalizeText(value);
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
  }

  function formatCouponDetailSummary(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parts = [];
        const code = String(parsed.code || parsed.coupon_code || '').trim();
        if (code) parts.push(code);
        const type = String(parsed.discount_type || parsed.type || '').trim().toLowerCase();
        const amount = Number(parsed.discount_value ?? parsed.amount ?? 0);
        if (amount > 0) {
          parts.push(type === 'percent' ? `${amount}% 할인` : `${amount.toLocaleString()}원 할인`);
        }
        const quantity = Number(parsed.issue_count ?? parsed.quantity ?? parsed.limit_count ?? 0);
        if (quantity > 0) parts.push(`발행 ${quantity.toLocaleString()}개`);
        const description = String(parsed.description || parsed.note || '').trim();
        if (description) parts.push(description);
        return parts.join(' · ') || text;
      }
    } catch {
      // plain text fallback
    }
    return text;
  }

  function normalizeCategoryName(value = '') {
    return String(value || '').trim();
  }

  function renderCategoryMedia(item, baseClass = 'class-category-media-stack') {
    const image = String(item?.image_url || '').trim();
    const imageMarkup = image
      ? `<span class="${baseClass}-image-wrap"><img class="${baseClass}-image" src="${escapeHtml(image)}" alt="${escapeHtml(item?.label || item?.name || '')}" loading="lazy"></span>`
      : '';
    return `
      <span class="${baseClass}">
        <span class="${baseClass}-emoji">${escapeHtml(item?.emoji || '✨')}</span>
        ${imageMarkup}
      </span>
    `;
  }

  function syncClassListUrl() {
    const nextUrl = new URL(window.location.href);
    const category = normalizeCategoryName(state.currentCategory || 'all');
    const query = String(state.searchQuery || '').trim();

    if (category && category !== 'all') nextUrl.searchParams.set('cat', category);
    else nextUrl.searchParams.delete('cat');

    if (query) nextUrl.searchParams.set('q', query);
    else nextUrl.searchParams.delete('q');

    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  function getEffectivePrice(cls) {
    const original = Number(cls.price || 0);
    const discount = Number(cls.discount_rate || 0);
    return discount > 0 ? Math.max(Math.round(original * (1 - discount / 100)), 0) : original;
  }

  function getClassSummary(cls) {
    return truncateText(cls.summary || cls.short_description || cls.description || cls.intro || cls.content || '', 86);
  }

  function normalizeBannerItems(items = [], fallbackLabel = '배너') {
    return (Array.isArray(items) ? items : [])
      .map((item, index) => {
        const imgUrl = String(item?.imgUrl || item?.image || item?.src || '').trim();
        const linkUrl = String(item?.linkUrl || item?.link || '').trim();
        const alt = String(item?.alt || item?.title || item?.label || `${fallbackLabel} ${index + 1}`).trim();
        return { imgUrl, linkUrl, alt };
      })
      .filter((item) => item.imgUrl);
  }

  async function getSiteSettings() {
    if (window.__BSQ_SITE_SETTINGS__) return window.__BSQ_SITE_SETTINGS__;
    if (window.BSQ?.siteSettingsReady) {
      try {
        return await window.BSQ.siteSettingsReady;
      } catch {
        return window.__BSQ_SITE_SETTINGS__ || null;
      }
    }
    if (window.BSQ?.api) {
      const res = await window.BSQ.api('/api/site-settings').catch(() => null);
      return res?.success ? (res.data || null) : null;
    }
    return null;
  }

  function loadPersistedBookmarks() {
    try {
      const raw = localStorage.getItem(CLASS_LIST_BOOKMARK_STORAGE_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      ids.forEach((id) => {
        const normalized = String(id || '').trim();
        if (normalized) state.bookmarkedIds.add(normalized);
      });
    } catch (error) {
      console.warn('[class_list] bookmark cache load failed:', error);
    }
  }

  function persistBookmarks() {
    try {
      localStorage.setItem(CLASS_LIST_BOOKMARK_STORAGE_KEY, JSON.stringify(Array.from(state.bookmarkedIds)));
    } catch (error) {
      console.warn('[class_list] bookmark cache save failed:', error);
    }
  }

  function getBookmarkCount(classId, fallbackCount = 0) {
    const key = String(classId || '').trim();
    if (state.bookmarkCounts.has(key)) {
      return Number(state.bookmarkCounts.get(key) || 0);
    }
    return Number(fallbackCount || 0);
  }

  function getBookmarkState(classId, fallbackCount = 0) {
    const key = String(classId || '').trim();
    return {
      bookmarked: state.bookmarkedIds.has(key),
      count: getBookmarkCount(key, fallbackCount),
    };
  }

  function setBookmarkState(classId, bookmarked, count) {
    const key = String(classId || '').trim();
    if (!key) return;

    if (bookmarked) state.bookmarkedIds.add(key);
    else state.bookmarkedIds.delete(key);

    state.bookmarkCounts.set(key, Number(count || 0));
    persistBookmarks();
  }

  function applyBookmarkButtonState(button, bookmarked, count) {
    if (!button) return;
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(Number(count || 0));
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '찜 취소' : '찜하기');
    button.classList.toggle('is-bookmarked', bookmarked);
    button.textContent = bookmarked ? '♥' : '♡';
  }

  function getCategoryCount(name) {
    const key = normalizeCategoryName(name);
    if (!key || key === 'all') return state.allClasses.length;
    return state.allClasses.reduce((count, cls) => {
      return normalizeCategoryName(cls.category) === key ? count + 1 : count;
    }, 0);
  }

  function buildCategoryItems() {
    const merged = [];
    const seen = new Set();
    const pushItem = (item) => {
      const name = normalizeCategoryName(item?.name);
      if (!name || seen.has(name)) return;
      seen.add(name);
      merged.push({
        name,
        label: String(item?.label || name).trim(),
        image_url: String(item?.image_url || '').trim(),
        emoji: String(item?.emoji || '📚').trim() || '📚',
      });
    };

    pushItem({ name: 'all', label: '전체', emoji: '✨' });

    const primaryCategories = state.categories.length ? state.categories : FALLBACK_CLASS_CATEGORIES;
    primaryCategories.forEach(pushItem);
    FALLBACK_CLASS_CATEGORIES.forEach(pushItem);

    return merged.map((item) => ({
      ...item,
      class_count: getCategoryCount(item.name),
    }));
  }

  function renderBannerCarousel(items = []) {
    const track = document.getElementById('classListBannerTrack');
    const dots = document.getElementById('classListBannerDots');
    const prev = document.getElementById('classListBannerPrev');
    const next = document.getElementById('classListBannerNext');
    if (!track) return;

    const banners = normalizeBannerItems(items, '배너');
    const slides = banners.length ? banners : [{
      imgUrl: '',
      linkUrl: '',
      alt: '배너 준비 중',
    }];

    track.innerHTML = slides.map((item, index) => {
      const slideClass = `home-banner-slide${index === 0 ? ' is-active' : ''}`;
      const content = item.imgUrl
        ? `<img src="${escapeHtml(item.imgUrl)}" alt="${escapeHtml(item.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">`
        : `<div class="home-banner-empty">
              <span class="home-banner-brand">B-Square</span>
              <span class="home-banner-note">상단 배너를 준비 중입니다.</span>
           </div>`;

      if (item.linkUrl) {
        return `
          <div class="${slideClass}" data-banner-index="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
            <a href="${escapeHtml(item.linkUrl)}" aria-label="${escapeHtml(item.alt)}">
              ${content}
            </a>
          </div>
        `;
      }

      return `
        <div class="${slideClass}" data-banner-index="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
          <div>
            ${content}
          </div>
        </div>
      `;
    }).join('');

    const slideEls = Array.from(track.querySelectorAll('.home-banner-slide'));
    const dotButtons = [];
    let currentIndex = 0;

    const setActive = (nextIndex) => {
      if (!slideEls.length) return;
      currentIndex = ((nextIndex % slideEls.length) + slideEls.length) % slideEls.length;

      slideEls.forEach((slide, index) => {
        const active = index === currentIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });

      dotButtons.forEach((dot, index) => {
        const active = index === currentIndex;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      if (track.parentElement) {
        track.parentElement.dataset.bannerCount = String(slideEls.length);
      }
    };

    if (dots) {
      dots.replaceChildren();
      slides.forEach((_, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `home-banner-dot${index === 0 ? ' is-active' : ''}`;
        button.setAttribute('aria-label', `배너 ${index + 1}`);
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        button.addEventListener('click', () => setActive(index));
        dotButtons.push(button);
        dots.appendChild(button);
      });
      dots.hidden = slideEls.length <= 1;
    }

    if (prev) {
      prev.hidden = slideEls.length <= 1;
      prev.onclick = () => setActive(currentIndex - 1);
    }

    if (next) {
      next.hidden = slideEls.length <= 1;
      next.onclick = () => setActive(currentIndex + 1);
    }

    setActive(0);
  }

  async function loadHeroBanner() {
    try {
      const settings = await getSiteSettings();
      renderBannerCarousel(settings?.bottom_banners || []);
    } catch (error) {
      console.warn('[class_list] hero banner load failed:', error);
      renderBannerCarousel([]);
    }
  }

  async function loadCategories() {
    try {
      const res = await window.BSQ.api('/api/class-categories');
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        state.categories = res.data
          .map((item) => ({
            name: normalizeCategoryName(item.name),
            image_url: String(item.image_url || '').trim(),
            emoji: String(item.emoji || '📚').trim() || '📚',
            class_count: Number(item.class_count || 0),
          }))
          .filter((item) => item.name);
        return;
      }
    } catch (error) {
      console.warn('[class_list] category load failed, using fallback:', error);
    }

    state.categories = FALLBACK_CLASS_CATEGORIES.map((item) => ({ ...item, class_count: 0 }));
  }

  async function loadClasses() {
    try {
      const result = await window.BSQ.api(`/api/classes?limit=${CLASS_LIST_FETCH_LIMIT}`);
      state.allClasses = result.success && Array.isArray(result.data) ? result.data : [];
    } catch (error) {
      console.error('[class_list] D1 API load error:', error);
      state.allClasses = [];
    }
  }

  function renderCategoryMenu() {
    const nav = document.getElementById('categoryFilter');
    if (!nav) return;

    const items = buildCategoryItems();
    const isExpanded = state.categoryMenuExpanded || items.length <= CATEGORY_COLLAPSED_COUNT;
    const visibleItems = isExpanded ? items : items.slice(0, CATEGORY_COLLAPSED_COUNT);
    const hasMore = items.length > CATEGORY_COLLAPSED_COUNT;

    const tiles = visibleItems.map((item) => {
      const isActive = state.currentCategory === item.name;
      return `
        <button type="button"
                class="class-category-tile${isActive ? ' is-active' : ''}"
                data-cat="${escapeHtml(item.name)}"
                aria-pressed="${isActive ? 'true' : 'false'}"
                title="${escapeHtml(item.label)}">
          ${renderCategoryMedia(item, 'class-category-icon-stack')}
          <span class="class-category-label">${escapeHtml(item.label)}</span>
        </button>
      `;
    }).join('');

    const toggleTile = hasMore ? `
      <button type="button"
              class="class-category-tile class-category-toggle"
              data-action="toggle-categories"
              aria-pressed="${state.categoryMenuExpanded ? 'true' : 'false'}"
              title="${state.categoryMenuExpanded ? '접기' : '더보기'}">
        <span class="class-category-icon">${state.categoryMenuExpanded ? '⌃' : '⌄'}</span>
        <span class="class-category-label">${state.categoryMenuExpanded ? '접기' : '더보기'}</span>
      </button>
    ` : '';

    nav.innerHTML = `
      <div class="class-category-panel">
        <div class="class-category-panel-head">
          <div>
            <span class="banner-eyebrow">Categories</span>
            <h2>카테고리</h2>
          </div>
          <p>원하는 분야를 빠르게 골라보세요.</p>
        </div>
        <div class="class-category-grid">
          ${tiles}
          ${toggleTile}
        </div>
      </div>
    `;
  }

  function sortClasses(classes) {
    const items = [...classes];
    switch (state.currentSort) {
      case 'popular':
        items.sort((a, b) => getBookmarkCount(b.id, b.like_count || b.bookmark_count || 0) - getBookmarkCount(a.id, a.like_count || a.bookmark_count || 0));
        break;
      case 'price-low':
        items.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
        break;
      case 'price-high':
        items.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
        break;
      case 'newest':
      default:
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
    }
    return items;
  }

  function filterClasses() {
    let items = [...state.allClasses];
    if (state.currentCategory !== 'all') {
      items = items.filter((item) => normalizeCategoryName(item.category) === state.currentCategory);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      items = items.filter((item) => {
        const haystack = [
          item.title,
          item.category,
          item.instructor_name,
          item.creator_name,
          item.creator_email,
          item.keywords,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    return sortClasses(items);
  }

  function renderClasses() {
    const grid = document.getElementById('allClassGrid');
    if (!grid) return;

    const filteredClasses = filterClasses();
    const countEl = document.getElementById('totalClassCount');
    if (countEl) countEl.textContent = `총 ${filteredClasses.length}개`;

    const titleEl = document.querySelector('.group-title');
    if (titleEl) titleEl.textContent = state.currentCategory === 'all' ? '전체 클래스 목록' : `${state.currentCategory} 클래스`;

    if (filteredClasses.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:4rem; color:#888;">
          ${state.searchQuery ? `"${escapeHtml(state.searchQuery)}" 검색결과가 없습니다.` : '해당 카테고리의 클래스가 없습니다.'}
        </div>
      `;
      return;
    }

    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;

    grid.innerHTML = filteredClasses.map((cls, index) => {
      const createdTime = cls.created_at ? new Date(cls.created_at).getTime() : 0;
      const isNew = createdTime && (now - createdTime < fortyEightHours);
      const discountRate = Number(cls.discount_rate || 0);
      const originalPrice = Number(cls.price || 0);
      const currentPrice = getEffectivePrice(cls);
      const imageUrl = cls.image_url || cls.thumbnail || '/assets/default-cover.svg';
      const avgRating = cls.avg_rating ? Number(cls.avg_rating).toFixed(1) : '0.0';
      const reviewCount = Number(cls.review_count || 0);
      const bookmarkData = getBookmarkState(cls.id, cls.like_count || cls.bookmark_count || 0);
      const likeCount = Number(bookmarkData.count || 0);
      const isBookmarked = bookmarkData.bookmarked;
      const summary = getClassSummary(cls);
      const href = `../class_view/class_view.html?id=${encodeURIComponent(cls.id)}`;

      return `
        <article class="class-card card-animate" style="animation-delay:${index * 0.05}s">
          <a class="class-card-link" href="${href}" aria-label="${escapeHtml(cls.title || '클래스 상세 보기')}">
            <div class="card-thumbnail">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cls.title || '클래스 이미지')}" loading="lazy">
              <div class="card-badges">
                ${isNew ? '<span class="badge-new">NEW</span>' : ''}
                ${cls.coupon_pack ? `<span class="badge-coupon" title="${escapeHtml(formatCouponDetailSummary(cls.coupon_detail) || '쿠폰팩 발행 가능')}">쿠폰 가능</span>` : ''}
                ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
              </div>
            </div>
            <div class="card-info">
              <div class="card-topline">
                <span class="category">${escapeHtml(cls.category || '미분류')}</span>
              </div>
              <h4 class="title">${escapeHtml(cls.title || '제목 없음')}</h4>
              ${summary ? `<p class="card-summary">${escapeHtml(summary)}</p>` : ''}
              ${cls.coupon_pack && cls.coupon_detail ? `<p class="card-summary" style="margin-top:0.35rem; font-size:0.78rem; color:#8b9bb4;">쿠폰: ${escapeHtml(formatCouponDetailSummary(cls.coupon_detail))}</p>` : ''}
              <div class="meta">
                <span class="rating">★ ${avgRating} (${reviewCount})</span>
                <span class="likes" data-like-count="${likeCount}">찜 ${likeCount}</span>
              </div>
              <div class="price-info">
                ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                <span class="current-price">${currentPrice === 0 ? '무료' : `${currentPrice.toLocaleString()}원`}</span>
              </div>
            </div>
          </a>
          <button type="button"
                  class="btn-bookmark${isBookmarked ? ' is-bookmarked' : ''}"
                  data-action="bookmark-class"
                  data-class-id="${escapeHtml(cls.id)}"
                  data-bookmarked="${isBookmarked ? '1' : '0'}"
                  data-like-count="${likeCount}"
                  aria-pressed="${isBookmarked ? 'true' : 'false'}"
                  aria-label="${isBookmarked ? '찜 취소' : '찜하기'}">${isBookmarked ? '♥' : '♡'}</button>
        </article>
      `;
    }).join('');
  }

  function bindEvents() {
    const categoryNav = document.getElementById('categoryFilter');
    categoryNav?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-cat], button[data-action="toggle-categories"]');
      if (!button) return;

      if (button.dataset.action === 'toggle-categories') {
        event.preventDefault();
        state.categoryMenuExpanded = !state.categoryMenuExpanded;
        renderCategoryMenu();
        return;
      }

      event.preventDefault();
      state.currentCategory = String(button.dataset.cat || 'all');
      state.categoryMenuExpanded = false;
      syncClassListUrl();
      renderCategoryMenu();
      renderClasses();
    });

    const sortSelect = document.getElementById('sortSelect');
    sortSelect?.addEventListener('change', (event) => {
      state.currentSort = String(event.target.value || 'newest');
      renderClasses();
    });

    const searchInput = document.getElementById('classSearchInput');
    let searchTimer = null;
    if (searchInput) searchInput.value = state.searchQuery;
    searchInput?.addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchQuery = String(event.target.value || '').trim();
        syncClassListUrl();
        renderClasses();
      }, 220);
    });

    const grid = document.getElementById('allClassGrid');
    grid?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action="bookmark-class"]');
      if (!button || !grid.contains(button)) return;

      event.preventDefault();
      event.stopPropagation();

      const classId = String(button.dataset.classId || '').trim();
      if (!classId) return;

      if (!window.BSQ?.session?.user?.id && !window.__BSQ_DEV_MODE__) {
        showNotice('error', '로그인이 필요합니다.');
        return;
      }

      if (button.dataset.loading === '1') return;
      button.dataset.loading = '1';
      button.disabled = true;

      try {
        const response = await window.BSQ.api('/api/class-bookmarks', {
          method: 'POST',
          body: JSON.stringify({ class_id: classId }),
        });

        if (!response?.success) {
          throw new Error(response?.error || '찜 상태를 변경하지 못했습니다.');
        }

        const bookmarked = !!response.data?.bookmarked;
        const count = Number(response.data?.count ?? button.dataset.likeCount ?? 0);
        setBookmarkState(classId, bookmarked, count);

        const card = button.closest('.class-card');
        const likesEl = card?.querySelector('.likes');
        if (likesEl) likesEl.textContent = `찜 ${count}`;
        applyBookmarkButtonState(button, bookmarked, count);

        if (state.currentSort === 'popular') {
          renderClasses();
        } else {
          showNotice(bookmarked ? 'success' : 'info', bookmarked ? '찜한 클래스에 추가했습니다.' : '찜을 취소했습니다.', 1800);
        }
      } catch (error) {
        console.error('[class_list] bookmark toggle failed:', error);
        showNotice('error', error?.message || '찜 기능을 사용할 수 없습니다.');
      } finally {
        button.disabled = false;
        delete button.dataset.loading;
      }
    });

    window.addEventListener('bsq_sync', (event) => {
      const type = String(event.detail?.type || '');
      if (['create', 'edit', 'delete', 'class-categories', 'recommendations', 'site-settings'].includes(type)) {
        reloadData();
      }
    });
  }

  async function reloadData() {
    await Promise.all([loadCategories(), loadClasses()]);
    renderCategoryMenu();
    renderClasses();
    await loadHeroBanner();
  }

  loadPersistedBookmarks();
  await reloadData();
  bindEvents();
  renderClasses();
});
