const FALLBACK_CLASS_CATEGORIES = [
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

document.addEventListener('DOMContentLoaded', async () => {
  if (window.BSQ?.ready) await window.BSQ.ready;

  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    allClasses: [],
    categories: [],
    currentCategory: urlParams.get('cat') || 'all',
    currentSort: 'newest',
    searchQuery: '',
  };

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEffectivePrice(cls) {
    const original = Number(cls.price || 0);
    const discount = Number(cls.discount_rate || 0);
    return discount > 0 ? Math.max(Math.round(original * (1 - discount / 100)), 0) : original;
  }

  async function loadCategories() {
    try {
      const res = await window.BSQ.api(`/api/class-categories?t=${Date.now()}`);
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        state.categories = res.data.map((item) => ({
          name: String(item.name || '').trim(),
          emoji: String(item.emoji || '✨').trim() || '✨',
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
      const result = await window.BSQ.api(`/api/classes?limit=500&t=${Date.now()}`);
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
      { name: 'all', emoji: '🌐', class_count: state.allClasses.length, label: '전체' },
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
            <a href="#" data-cat="${escapeHtml(item.name)}">
              <span class="icon">${escapeHtml(item.emoji || '✨')}</span>
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

    const titleEl = document.querySelector('.group-title');
    if (titleEl) titleEl.textContent = state.currentCategory === 'all' ? '전체 클래스 목록' : `${state.currentCategory} 클래스`;

    if (filteredClasses.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:4rem; color:#888;">
          ${state.searchQuery ? `"${escapeHtml(state.searchQuery)}"에 대한 검색 결과가 없습니다.` : '해당 카테고리에 등록된 클래스가 없습니다.'}
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
      const imageUrl = cls.image_url || cls.thumbnail || 'https://via.placeholder.com/400x250';
      const avgRating = cls.avg_rating ? Number(cls.avg_rating).toFixed(1) : '0.0';
      const reviewCount = Number(cls.review_count || 0);
      const likeCount = Number(cls.like_count || cls.bookmark_count || 0);
      const totalParticipants = Number(cls.current_participants || cls.total_enrollments || 0);

      return `
        <div class="class-card card-animate" style="animation-delay:${index * 0.05}s" onclick="location.href='../class_view/class_view.html?id=${encodeURIComponent(cls.id)}'" role="button" tabindex="0">
          ${isNew ? '<div class="badge-new">NEW</div>' : ''}
          <div class="card-thumbnail">
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cls.title || '클래스')}" loading="lazy">
            <button type="button" class="btn-bookmark" data-action="bookmark-class" data-class-id="${escapeHtml(cls.id)}" data-bookmarked="0" aria-label="찜하기" onclick="event.stopPropagation()">♡</button>
            <div class="card-badges">
              ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
              ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
            </div>
          </div>
          <div class="card-info">
            <span class="category">${escapeHtml(cls.category || '미분류')}</span>
            <h4 class="title">${escapeHtml(cls.title || '제목 없음')}</h4>
            <span class="creator">${escapeHtml(cls.instructor_name || cls.creator_name || '크리에이터')}</span>
            <div class="meta">
              <span class="rating">⭐ ${avgRating} (${reviewCount})</span>
              <span class="likes">♥ ${likeCount}</span>
              <span class="students">👥 ${totalParticipants}</span>
            </div>
            <div class="price-area">
              ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
              <span class="current-price">${currentPrice === 0 ? '무료' : `${currentPrice.toLocaleString()}원`}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-action="bookmark-class"]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const classId = button.dataset.classId;
        if (!window.BSQ?.isLoggedIn) {
          if (confirm('찜하기를 사용하려면 로그인이 필요합니다. 로그인 화면으로 이동할까요?')) {
            window.location.href = `../login/login.html?redirect=${encodeURIComponent(window.location.href)}`;
          }
          return;
        }

        const original = button.textContent;
        button.disabled = true;
        try {
          const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: classId });
          if (!res.success) throw new Error(res.error || '찜하기 실패');
          const bookmarked = Boolean(res.data?.bookmarked);
          button.textContent = bookmarked ? '♥' : '♡';
          button.dataset.bookmarked = bookmarked ? '1' : '0';
        } catch (error) {
          alert(`찜하기 처리에 실패했습니다: ${error.message}`);
          button.textContent = original;
        } finally {
          button.disabled = false;
        }
      });
    });
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
        reloadData();
      }
    });
  }

  async function reloadData() {
    await loadCategories();
    await loadClasses();
    renderCategorySidebar();
    renderClasses();
  }

  await reloadData();
  bindEvents();
  renderClasses();
});
