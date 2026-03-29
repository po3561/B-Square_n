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

const CLASS_LIST_FETCH_LIMIT = 80;
let reloadTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    allClasses: [],
    categories: [],
    currentCategory: urlParams.get('cat') || 'all',
    currentSort: 'newest',
    searchQuery: '',
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

  function truncateText(value = '', maxLength = 88) {
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
    return truncateText(cls.summary || cls.short_description || cls.description || cls.intro || cls.content || '', 96);
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
        state.categories = res.data.map((item) => ({
          name: String(item.name || '').trim(),
          emoji: String(item.emoji || '📚').trim() || '📚',
          class_count: Number(item.class_count || 0),
        })).filter((item) => item.name);
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
        items.sort((a, b) => Number(b.like_count || b.bookmark_count || 0) - Number(a.like_count || a.bookmark_count || 0));
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
      const likeCount = Number(cls.like_count || cls.bookmark_count || 0);
      const totalParticipants = Number(cls.current_participants || cls.total_enrollments || 0);
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
                <span class="card-chip">${escapeHtml(cls.instructor_name || cls.creator_name || '작성자 정보 없음')}</span>
              </div>
              <h4 class="title">${escapeHtml(cls.title || '제목 없음')}</h4>
              ${summary ? `<p class="card-summary">${escapeHtml(summary)}</p>` : ''}
              <div class="meta">
                <span class="rating">★ ${avgRating} (${reviewCount})</span>
                <span class="likes">찜 ${likeCount}</span>
                <span class="students">👥 ${totalParticipants}</span>
              </div>
              <div class="price-info">
                ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                <span class="current-price">${currentPrice === 0 ? '무료' : `${currentPrice.toLocaleString()}원`}</span>
              </div>
            </div>
          </a>
          <button type="button" class="btn-bookmark" data-action="bookmark-class" data-class-id="${escapeHtml(cls.id)}" data-bookmarked="0" aria-label="찜하기" onclick="event.preventDefault(); event.stopPropagation();">♡</button>
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

    window.addEventListener('bsq_sync', (event) => {
      const type = String(event.detail?.type || '');
      if (['create', 'edit', 'delete', 'class-categories', 'recommendations'].includes(type)) {
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
  }

  await reloadData();
  bindEvents();
  renderClasses();
});
