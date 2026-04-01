const FALLBACK_CLASS_CATEGORIES = [
  { name: '라이프스타일', emoji: '✨' },
  { name: '창작', emoji: '🎨' },
  { name: '운동', emoji: '🏃' },
  { name: '디지털', emoji: '💻' },
  { name: '요리', emoji: '🍳' },
  { name: '스포츠', emoji: '🏅' },
  { name: '음악', emoji: '🎵' },
  { name: '사진', emoji: '📷' },
  { name: '영상', emoji: '🎬' },
  { name: '공예', emoji: '🧵' },
  { name: '비즈니스', emoji: '💼' },
  { name: '교육', emoji: '📚' },
  { name: '힐링', emoji: '🪷' },
  { name: '공연', emoji: '🎭' },
  { name: '여행', emoji: '✈️' },
];

const CLASS_LIST_FETCH_LIMIT = 60;
const CLASS_LIST_BOOKMARK_STORAGE_KEY = 'bsq.class-list.bookmarks';
let reloadTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    allClasses: [],
    categories: [],
    currentCategory: urlParams.get('cat') || 'all',
    currentSort: 'newest',
    searchQuery: '',
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

  function stripHtml(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function truncateText(value = '', maxLength = 84) {
    const text = stripHtml(value);
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
  }

  function getEffectivePrice(cls) {
    const original = Number(cls.price || 0);
    const discount = Number(cls.discount_rate || 0);
    return discount > 0 ? Math.max(Math.round(original * (1 - discount / 100)), 0) : original;
  }

  function getClassSummary(cls) {
    return truncateText(cls.summary || cls.short_description || cls.description || cls.intro || cls.content || '', 84);
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
      const res = await window.BSQ.api('/api/site-settings', { cacheBust: false }).catch(() => null);
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

  function renderBannerCarousel(items = []) {
    const track = document.getElementById('classListBannerTrack');
    const dots = document.getElementById('classListBannerDots');
    const prev = document.getElementById('classListBannerPrev');
    const next = document.getElementById('classListBannerNext');
    if (!track) return;

    const banners = normalizeBannerItems(items, '하단 배너');
    const slides = banners.length ? banners : [{
      imgUrl: '',
      linkUrl: '',
      alt: '하단 배너 준비 중',
    }];

    track.innerHTML = slides.map((item, index) => {
      const slideClass = `home-banner-slide${index === 0 ? ' is-active' : ''}`;
      const content = item.imgUrl
        ? `<img src="${escapeHtml(item.imgUrl)}" alt="${escapeHtml(item.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">`
        : `<div class="home-banner-empty">
              <span class="home-banner-brand">B-Square</span>
              <span class="home-banner-note">하단 배너를 준비 중입니다.</span>
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
    let currentIndex = 0;
    const dotButtons = [];

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

  function updateListingHeroStats(activeCount = state.allClasses.length) {
    const totalEl = document.getElementById('heroClassTotal');
    const categoryEl = document.getElementById('heroCategoryTotal');
    const activeEl = document.getElementById('heroActiveCategoryCount');

    if (totalEl) totalEl.textContent = String(state.allClasses.length || 0);
    if (categoryEl) categoryEl.textContent = String(state.categories.length || FALLBACK_CLASS_CATEGORIES.length || 0);
    if (activeEl) activeEl.textContent = String(activeCount || 0);
  }

  async function loadCategories() {
    try {
      const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        state.categories = res.data
          .map((item) => ({
            name: String(item.name || '').trim(),
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
      const result = await window.BSQ.api(`/api/classes?limit=${CLASS_LIST_FETCH_LIMIT}`, { cacheBust: false });
      state.allClasses = result.success && Array.isArray(result.data) ? result.data : [];
    } catch (error) {
      console.error('[class_list] D1 API load error:', error);
      state.allClasses = [];
    }
  }

  function renderCategorySidebar() {
    const nav = document.getElementById('categoryFilter');
    if (!nav) return;

    const items = [
      { name: 'all', emoji: '📚', class_count: state.allClasses.length, label: '전체' },
      ...state.categories.map((item) => ({
        ...item,
        label: item.name,
      })),
    ];

    nav.innerHTML = `
      <h3 class="sidebar-title">클래스 카테고리</h3>
      <ul>
        ${items.map((item) => `
          <li class="${state.currentCategory === item.name ? 'active' : ''}">
            <a href="#" data-cat="${escapeHtml(item.name)}"${state.currentCategory === item.name ? ' aria-current="page"' : ''}>
              <span class="icon">${escapeHtml(item.emoji || '📚')}</span>
              <span class="cat-label">${escapeHtml(item.label || item.name)}</span>
              <span class="cat-count">${Number(item.class_count || 0)}</span>
            </a>
          </li>
        `).join('')}
      </ul>
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
      items = items.filter((item) => String(item.category || '').trim() === state.currentCategory);
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
    updateListingHeroStats(filteredClasses.length);

    const titleEl = document.querySelector('.group-title');
    if (titleEl) titleEl.textContent = state.currentCategory === 'all' ? '전체 클래스 목록' : `${state.currentCategory} 클래스`;

    if (filteredClasses.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:4rem; color:#888;">
          ${state.searchQuery ? `"${escapeHtml(state.searchQuery)}" 검색 결과가 없습니다.` : '해당 카테고리에 등록된 클래스가 없습니다.'}
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
          <a class="class-card-link" href="${href}" aria-label="${escapeHtml(cls.title || '클래스 이미지')} 상세 보기">
            <div class="card-thumbnail">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cls.title || '클래스 이미지')}" loading="lazy">
              <div class="card-badges">
                ${isNew ? '<span class="badge-new">NEW</span>' : ''}
                ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰 가능</span>' : ''}
                ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
              </div>
            </div>
            <div class="card-info">
              <div class="card-topline">
                <span class="category">${escapeHtml(cls.category || '미분류')}</span>
              </div>
              <h4 class="title">${escapeHtml(cls.title || '제목 없음')}</h4>
              ${summary ? `<p class="card-summary">${escapeHtml(summary)}</p>` : ''}
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
      const link = event.target.closest('a[data-cat]');
      if (!link) return;
      event.preventDefault();
      state.currentCategory = String(link.dataset.cat || 'all');
      renderCategorySidebar();
      renderClasses();
    });

    const sortSelect = document.getElementById('sortSelect');
    sortSelect?.addEventListener('change', (event) => {
      state.currentSort = String(event.target.value || 'newest');
      renderClasses();
    });

    const searchInput = document.getElementById('classSearchInput');
    let searchTimer = null;
    searchInput?.addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchQuery = String(event.target.value || '').trim();
        renderClasses();
      }, 250);
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
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          reloadData();
        }, 120);
      }
    });
  }

  async function reloadData() {
    await Promise.all([loadCategories(), loadClasses()]);
    renderCategorySidebar();
    renderClasses();
    updateListingHeroStats(filterClasses().length);
    await loadHeroBanner();
  }

  loadPersistedBookmarks();
  await reloadData();
  bindEvents();
  renderClasses();
});
