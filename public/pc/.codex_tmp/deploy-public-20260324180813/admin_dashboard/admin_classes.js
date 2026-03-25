;(function () {
var ADMIN_CLASSES_VERSION = '2026.03.24-01';

var PREMIUM_EMOJIS = [
  '✨', '💎', '🪄', '🌈', '🔥', '⚡', '🌿', '🍀', '🫧', '🎯',
  '🏆', '🎨', '🧠', '📷', '🎬', '🎵', '🍰', '🥗', '🧶', '✏️',
  '🚀', '🧭', '💫', '🌟', '🎁', '💡', '📚', '🛠️',
];

var DEFAULT_CATEGORY_SEEDS = [
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

var state = {
  categories: [],
  classes: [],
  ranking: [],
  filters: { q: '', sort: 'newest', visibility: 'all', category: 'all' },
  detail: null,
  detailRange: 'day',
  categoryDraft: null,
  categorySaving: false,
  loadingToken: 0,
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value, fallback = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function formatNumber(value) {
  return toNumber(value, 0).toLocaleString('ko-KR');
}

function formatCurrency(value) {
  return `${Math.max(0, toNumber(value, 0)).toLocaleString('ko-KR')}원`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}

function effectivePrice(row) {
  const price = toNumber(row?.price, 0);
  const discount = toNumber(row?.discount_rate, 0);
  if (!discount) return price;
  return Math.max(Math.round(price * (1 - discount / 100)), 0);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function currentActiveCategory() {
  return String(state.filters.category || 'all').trim() || 'all';
}

function classCategoryMeta(name) {
  const normalized = String(name || '').trim();
  const found = state.categories.find((item) => item.name === normalized);
  if (found) return found;
  const fallback = DEFAULT_CATEGORY_SEEDS.find((item) => item.name === normalized);
  return fallback ? { name: fallback.name, emoji: fallback.emoji, class_count: 0, public_class_count: 0 } : null;
}

function isVisibleTab() {
  const section = document.getElementById('tabAllClasses');
  return !!(section && section.classList.contains('active'));
}

function createLoadingNode(message) {
  const node = document.createElement('div');
  node.className = 'class-category-strip-empty';
  node.textContent = message;
  return node;
}

function createTableLoadingRow(colspan, message) {
  const row = document.createElement('tr');
  row.innerHTML = `<td colspan="${colspan}" style="text-align:center; color:var(--mac-text-muted); padding:2rem;">${escapeHtml(message)}</td>`;
  return row;
}

function debounce(fn, wait) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

document.addEventListener('DOMContentLoaded', initAdminClasses);

function initAdminClasses() {
  ensureModals();
  bindControls();

  if (isVisibleTab()) {
    refreshDashboard({ includeCategories: true, includeRanking: true, includeClasses: true });
  }

  window.addEventListener('adminTabChanged', (event) => {
    if (event.detail?.tabId === 'tabAllClasses') {
      refreshDashboard({ includeCategories: true, includeRanking: true, includeClasses: true });
    }
  });

  window.addEventListener('bsq_sync', (event) => {
    const type = String(event.detail?.type || '');
    if (!type || !isVisibleTab()) return;
    if (['create', 'edit', 'delete', 'class-categories', 'recommendations'].includes(type)) {
      refreshDashboard({
        includeCategories: type === 'class-categories',
        includeRanking: true,
        includeClasses: true,
      });
    }
  });
}

function bindControls() {
  const searchInput = document.getElementById('adminClassSearchInput');
  const sortSelect = document.getElementById('adminClassSortSelect');
  const visibilitySelect = document.getElementById('adminClassVisibilitySelect');

  searchInput?.addEventListener('input', debounce((event) => {
    state.filters.q = String(event.target.value || '').trim();
    loadClasses();
  }, 250));

  sortSelect?.addEventListener('change', (event) => {
    state.filters.sort = String(event.target.value || 'newest');
    loadClasses();
  });

  visibilitySelect?.addEventListener('change', (event) => {
    state.filters.visibility = String(event.target.value || 'all');
    loadClasses();
  });

  document.getElementById('btnRefreshClasses')?.addEventListener('click', () => loadClasses(true));
  document.getElementById('btnRefreshRanking')?.addEventListener('click', () => loadRanking(true));
  document.getElementById('btnSyncPopularRecommendation')?.addEventListener('click', () => syncPopularRankingToRecommendations());
  document.getElementById('btnClassCategoryManager')?.addEventListener('click', () => openCategoryModal(state.filters.category || 'all'));
  document.getElementById('btnAddClassCategory')?.addEventListener('click', () => openCategoryModal(''));

  document.getElementById('classCategoryStrip')?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-category-filter]');
    if (!pill) return;
    state.filters.category = String(pill.dataset.categoryFilter || 'all');
    loadClasses(true);
  });

  document.getElementById('hotClassesTableBody')?.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-class-id]');
    if (!row || event.target.closest('[data-action]')) return;
    openClassDetail(row.dataset.classId);
  });

  document.getElementById('allClassesTableBody')?.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-class-id]');
    if (!row || event.target.closest('[data-action]')) return;
    openClassDetail(row.dataset.classId);
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('[data-action="close-class-modal"]')) {
      closeModal('classDetailModal');
      return;
    }
    if (target.closest('[data-action="close-category-modal"]')) {
      closeModal('classCategoryModal');
      return;
    }
    if (target.closest('[data-action="close-delete-modal"]')) {
      closeModal('classDeleteModal');
      return;
    }
    if (target.closest('[data-action="save-category"]')) {
      saveCategoryFromModal();
      return;
    }
    if (target.closest('[data-action="delete-category"]')) {
      deleteCategoryFromModal();
      return;
    }
    if (target.closest('[data-action="confirm-delete-class"]')) {
      confirmDeleteClassFromModalSafe();
      return;
    }
    if (target.closest('[data-action="change-range"]')) {
      const button = target.closest('[data-action="change-range"]');
      state.detailRange = String(button.dataset.range || 'day');
      renderClassDetailModal();
      return;
    }
    if (target.closest('[data-action="select-emoji"]')) {
      const button = target.closest('[data-action="select-emoji"]');
      setCategoryEmoji(button.dataset.emoji || '✨');
      return;
    }
    if (target.closest('[data-action="delete-category-item"]')) {
      const button = target.closest('[data-action="delete-category-item"]');
      openDeleteCategoryConfirm(button.dataset.categoryName || '');
      return;
    }
    if (target.closest('[data-action="edit-category-item"]')) {
      const button = target.closest('[data-action="edit-category-item"]');
      openCategoryModal(button.dataset.categoryName || '');
      return;
    }
    if (target.closest('[data-action="select-category-item"]')) {
      const button = target.closest('[data-action="select-category-item"]');
      openCategoryModal(button.dataset.categoryName || '');
      return;
    }
    if (target.closest('[data-action="view-class-detail"]')) {
      const button = target.closest('[data-action="view-class-detail"]');
      openClassDetail(button.dataset.classId);
      return;
    }
    if (target.closest('[data-action="delete-class-item"]')) {
      const button = target.closest('[data-action="delete-class-item"]');
      openDeleteClassModal(button.dataset.classId, button.dataset.classTitle || '');
      return;
    }
    if (target.closest('[data-action="toggle-class-visibility"]')) {
      const button = target.closest('[data-action="toggle-class-visibility"]');
      const row = button.closest('tr[data-class-id]');
      if (row) toggleClassVisibility(row.dataset.classId, button.checked);
      return;
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target?.id === 'classCategoryName') {
      if (state.categoryDraft) state.categoryDraft.name = String(event.target.value || '').trim();
      renderCategoryPreview();
    }
    if (event.target?.id === 'classCategorySortOrder') {
      if (state.categoryDraft) state.categoryDraft.sort_order = toInteger(event.target.value, 0);
      renderCategoryPreview();
    }
    if (event.target?.id === 'deleteClassConfirmInput') {
      const confirmBtn = document.getElementById('btnConfirmDeleteClass');
      if (confirmBtn) {
        const expected = String(event.target.dataset.expectedTitle || '').trim();
        confirmBtn.disabled = String(event.target.value || '').trim() !== expected;
      }
    }
  });
}

async function refreshDashboard({ includeCategories = false, includeRanking = false, includeClasses = false } = {}) {
  const token = ++state.loadingToken;
  if (includeCategories) document.getElementById('classCategoryStrip')?.replaceChildren(createLoadingNode('카테고리를 불러오는 중입니다...'));
  if (includeRanking) document.getElementById('hotClassesTableBody')?.replaceChildren(createTableLoadingRow(8, '인기 통계를 불러오는 중입니다...'));
  if (includeClasses) document.getElementById('allClassesTableBody')?.replaceChildren(createTableLoadingRow(8, '클래스 목록을 불러오는 중입니다...'));

  const tasks = [];
  if (includeCategories) tasks.push(loadCategories());
  if (includeRanking) tasks.push(loadRanking());
  if (includeClasses) tasks.push(loadClasses());
  if (!tasks.length) tasks.push(loadCategories(), loadRanking(), loadClasses());

  try {
    await Promise.all(tasks);
  } catch (error) {
    console.error('[admin_classes] refresh failed:', error);
  } finally {
    if (token !== state.loadingToken) return;
    renderCategoryStrip();
    renderRankingTable();
    renderClassTable();
  }
}

async function loadCategories() {
  try {
    const response = await window.BSQ.api('/api/admin/class-categories');
    if (!response.success) throw new Error(response.error || '카테고리를 불러오지 못했습니다.');
    const categories = Array.isArray(response.data) ? response.data : [];
    state.categories = categories.map((item) => ({
      name: String(item.name || '').trim(),
      emoji: String(item.emoji || '✨').trim() || '✨',
      sort_order: toInteger(item.sort_order, 0),
      is_active: Number(item.is_active ?? 1) === 1,
      class_count: toNumber(item.class_count, 0),
      public_class_count: toNumber(item.public_class_count, 0),
    })).filter((item) => item.name);

    if (currentActiveCategory() !== 'all' && !state.categories.some((item) => item.name === currentActiveCategory())) {
      state.filters.category = 'all';
    }
  } catch (error) {
    console.warn('[admin_classes] category load failed:', error);
    state.categories = DEFAULT_CATEGORY_SEEDS.map((item, index) => ({
      name: item.name,
      emoji: item.emoji,
      sort_order: (index + 1) * 10,
      is_active: true,
      class_count: 0,
      public_class_count: 0,
    }));
  }
  renderCategoryStrip();
  renderCategoryManagerList();
}

async function loadRanking() {
  try {
    const response = await window.BSQ.api('/api/admin/class-analytics?type=ranking&top=10');
    if (!response.success) throw new Error(response.error || '인기 순위를 불러오지 못했습니다.');
    const items = Array.isArray(response.data) ? response.data : [];
    state.ranking = items.map((item, index) => ({
      ...item,
      rank: index + 1,
      score: toNumber(item.score, 0),
      bookmarks: toNumber(item.bookmarks ?? item.bookmark_count, 0),
      visits: toNumber(item.visits, 0),
      enrollments: toNumber(item.enrollments, 0),
      revenue: toNumber(item.revenue, 0),
      avg_rating: toNumber(item.avg_rating, 0),
      review_count: toNumber(item.review_count, 0),
      passes_issued: toNumber(item.passes_issued, 0),
      passes_used: toNumber(item.passes_used, 0),
      gatherings: toNumber(item.gatherings, 0),
    }));
  } catch (error) {
    console.warn('[admin_classes] ranking load failed:', error);
    state.ranking = [];
  }
  renderRankingTable();
}

function buildClassListUrl() {
  const params = new URLSearchParams();
  params.set('limit', '1000');
  params.set('sort', state.filters.sort || 'newest');
  params.set('visibility', state.filters.visibility || 'all');
  const q = String(state.filters.q || '').trim();
  const category = String(state.filters.category || 'all').trim();
  if (q) params.set('q', q);
  if (category && category !== 'all') params.set('category', category);
  return `/api/admin/classes?${params.toString()}`;
}

async function loadClasses() {
  try {
    const response = await window.BSQ.api(buildClassListUrl());
    if (!response.success) throw new Error(response.error || '클래스 목록을 불러오지 못했습니다.');
    const items = Array.isArray(response.data) ? response.data : [];
    state.classes = items.map((item) => ({
      ...item,
      is_public: Number(item.is_public ?? 1) === 1,
      is_approved: Number(item.is_approved ?? 0) === 1,
      bookmark_count: toNumber(item.bookmark_count, 0),
      recent_active_students: toNumber(item.recent_active_students, 0),
      total_enrollments: toNumber(item.total_enrollments ?? item.current_participants, 0),
      current_participants: toNumber(item.current_participants ?? item.total_enrollments, 0),
      total_visits: toNumber(item.total_visits, 0),
      hot_score: toNumber(item.hot_score, 0),
      effective_price: toNumber(item.effective_price, effectivePrice(item)),
    }));
  } catch (error) {
    console.error('[admin_classes] class load failed:', error);
    state.classes = [];
    renderCategoryStrip();
    renderClassTable(error.message);
    return;
  }
  renderClassTable();
  renderCategoryStrip();
}

function renderCategoryStrip() {
  const strip = document.getElementById('classCategoryStrip');
  if (!strip) return;

  const active = currentActiveCategory();
  const totalCount = state.categories.reduce((sum, item) => sum + toNumber(item.class_count, 0), 0) || state.classes.length;
  const categories = [
    { name: 'all', emoji: '🌐', class_count: totalCount, public_class_count: state.categories.reduce((sum, item) => sum + toNumber(item.public_class_count, 0), 0) },
    ...state.categories,
  ];

  if (!categories.length) {
    strip.innerHTML = '<div class="class-category-strip-empty">카테고리를 불러오는 중입니다...</div>';
    return;
  }

  strip.innerHTML = categories.map((item) => {
    const isActive = item.name === active;
    return `
      <button type="button" class="class-category-pill${isActive ? ' is-active' : ''}" data-category-filter="${escapeAttr(item.name)}">
        <span class="class-category-pill-emoji">${escapeHtml(item.emoji || '✨')}</span>
        <span class="class-category-pill-name">${escapeHtml(item.name === 'all' ? '전체' : item.name)}</span>
        <span class="class-category-pill-count">${formatNumber(item.class_count || 0)}</span>
      </button>
    `;
  }).join('');
}

function renderCategoryManagerList() {
  const list = document.getElementById('classCategoryManagerList');
  const count = document.getElementById('classCategoryManagerCount');
  if (!list) return;
  if (count) count.textContent = `${formatNumber(state.categories.length)}개`;

  if (!state.categories.length) {
    list.innerHTML = '<div class="class-category-empty">등록된 카테고리가 없습니다.</div>';
    return;
  }

  list.innerHTML = state.categories.map((item) => {
    const activeClass = item.is_active ? 'is-active' : 'is-inactive';
    return `
      <article class="class-category-manager-item ${activeClass}" data-action="select-category-item" data-category-name="${escapeAttr(item.name)}" role="button" tabindex="0">
        <div class="class-category-manager-icon">${escapeHtml(item.emoji || '✨')}</div>
        <div class="class-category-manager-body">
          <strong>${escapeHtml(item.name)}</strong>
          <span>클래스 ${formatNumber(item.class_count || 0)}개 · 공개 ${formatNumber(item.public_class_count || 0)}개</span>
        </div>
        <div class="class-category-manager-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-small outline" data-action="edit-category-item" data-category-name="${escapeAttr(item.name)}">수정</button>
          <button type="button" class="btn-small outline" data-action="delete-category-item" data-category-name="${escapeAttr(item.name)}" style="color:var(--mac-danger); border-color:rgba(255,59,48,0.25);">삭제</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderRankingTable() {
  const tbody = document.getElementById('hotClassesTableBody');
  if (!tbody) return;

  if (!state.ranking.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--mac-text-muted); padding:2rem;">인기 통계가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = state.ranking.map((item) => {
    const category = classCategoryMeta(item.category);
    const thumb = item.thumbnail || item.image_url || 'https://placehold.co/120x80?text=No+Image';
    return `
      <tr data-class-id="${escapeAttr(item.id)}" class="class-row class-ranking-row">
        <td><span class="class-rank-badge">#${item.rank}</span></td>
        <td>
          <div class="class-cell class-cell-title">
            <div class="class-thumb"><img src="${escapeAttr(thumb)}" alt="${escapeAttr(item.title || '')}" loading="lazy"></div>
            <div class="class-copy">
              <strong title="${escapeAttr(item.title || '')}">${escapeHtml(item.title || '제목 없음')}</strong>
              <span>${escapeHtml(item.instructor_name || item.creator_name || item.instructor_id || '-')}</span>
            </div>
          </div>
        </td>
        <td><span class="class-category-chip">${escapeHtml(category?.emoji || '✨')} ${escapeHtml(item.category || '미분류')}</span></td>
        <td>${formatNumber(item.bookmarks)}</td>
        <td>${formatNumber(item.review_count)}</td>
        <td>${formatNumber(item.visits)}</td>
        <td>${Number(item.avg_rating || 0).toFixed(1)}</td>
        <td><strong>${formatNumber(item.score)}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderClassTable(errorMessage = '') {
  const tbody = document.getElementById('allClassesTableBody');
  if (!tbody) return;

  if (errorMessage) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--mac-danger); padding:2rem;">${escapeHtml(errorMessage)}</td></tr>`;
    return;
  }

  if (!state.classes.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--mac-text-muted); padding:2rem;">등록된 클래스가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = state.classes.map((item) => {
    const category = classCategoryMeta(item.category);
    const thumb = item.thumbnail || item.image_url || 'https://placehold.co/120x80?text=No+Image';
    const instructorId = item.instructor_id || item.creator_id || '-';
    const instructorName = item.creator_name || item.instructor_name || '-';
    const priceText = item.is_free ? '무료' : formatCurrency(item.effective_price ?? effectivePrice(item));
    const rawPrice = Number(item.price || 0);
    const discount = Number(item.discount_rate || 0);
    return `
      <tr data-class-id="${escapeAttr(item.id)}" class="class-row">
        <td>
          <div class="class-cell class-cell-title">
            <div class="class-thumb"><img src="${escapeAttr(thumb)}" alt="${escapeAttr(item.title || '')}" loading="lazy"></div>
            <div class="class-copy">
              <div class="class-copy-main">
                <strong title="${escapeAttr(item.title || '')}">${escapeHtml(item.title || '제목 없음')}</strong>
                <span class="class-public-mini">${item.is_public ? '공개' : '비공개'}</span>
              </div>
              <span class="class-copy-sub">ID: ${escapeHtml(String(item.id || '').slice(0, 12))}${String(item.id || '').length > 12 ? '…' : ''}</span>
            </div>
          </div>
        </td>
        <td><span class="class-category-chip">${escapeHtml(category?.emoji || '✨')} ${escapeHtml(item.category || '미분류')}</span></td>
        <td>
          <div class="class-instructor-cell">
            <div class="class-avatar">${escapeHtml(String(instructorName).trim().charAt(0) || 'A')}</div>
            <div class="class-instructor-copy">
              <strong>${escapeHtml(instructorName)}</strong>
              <span>${escapeHtml(instructorId)}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="class-price-cell">
            <strong>${escapeHtml(priceText)}</strong>
            ${discount > 0 ? `<span>${formatCurrency(rawPrice)} · ${formatNumber(discount)}% 할인</span>` : `<span>${item.is_free ? '무료 공개' : '기본 가격'}</span>`}
          </div>
        </td>
        <td>
          <div class="class-stat-cell">
            <strong>${formatNumber(item.total_enrollments || item.current_participants || 0)}</strong>
            <span>총 수강생</span>
          </div>
        </td>
        <td>
          <div class="class-stat-cell">
            <strong>${formatNumber(item.recent_active_students || 0)}</strong>
            <span>최근 30일</span>
          </div>
        </td>
        <td>
          <div class="class-switch-cell">
            <label class="mac-switch" title="${item.is_public ? '공개' : '비공개'}">
              <input type="checkbox" ${item.is_public ? 'checked' : ''} data-action="toggle-class-visibility" data-class-id="${escapeAttr(item.id)}">
              <span class="mac-slider"></span>
            </label>
            <span class="class-switch-label">${item.is_public ? '공개' : '비공개'}</span>
          </div>
        </td>
        <td>
          <div class="class-row-actions">
            <button type="button" class="btn-small outline" data-action="view-class-detail" data-class-id="${escapeAttr(item.id)}">보기</button>
            <button type="button" class="btn-small outline" data-action="delete-class-item" data-class-id="${escapeAttr(item.id)}" data-class-title="${escapeAttr(item.title || '')}" style="color:var(--mac-danger); border-color:rgba(255,59,48,0.25);">삭제</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCategoryModal(categoryName = '') {
  const modal = document.getElementById('classCategoryModal');
  if (!modal) return;

  state.categorySaving = false;
  const found = state.categories.find((item) => item.name === categoryName) || null;
  state.categoryDraft = found
    ? {
        originalName: found.name,
        name: found.name,
        emoji: found.emoji || '✨',
        sort_order: toInteger(found.sort_order, 0),
        is_active: Boolean(found.is_active),
      }
    : {
        originalName: '',
        name: '',
        emoji: '✨',
        sort_order: state.categories.length ? Math.max(...state.categories.map((item) => toInteger(item.sort_order, 0))) + 10 : 10,
        is_active: true,
      };

  modal.classList.add('is-open');
  renderCategoryModal();
}

function renderCategoryModal() {
  if (!state.categoryDraft) return;

  const title = document.getElementById('classCategoryModalTitle');
  const subtitle = document.getElementById('classCategoryModalSubtitle');
  const nameInput = document.getElementById('classCategoryName');
  const sortInput = document.getElementById('classCategorySortOrder');
  const emojiGrid = document.getElementById('classCategoryEmojiGrid');
  const preview = document.getElementById('classCategoryPreview');
  const deleteBtn = document.getElementById('btnDeleteCategory');
  const saveBtn = document.getElementById('btnSaveCategory');

  const editing = Boolean(state.categoryDraft.originalName);
  if (title) title.textContent = editing ? '카테고리 수정' : '카테고리 추가';
  if (subtitle) subtitle.textContent = editing
    ? '이름, 이모지, 순서를 수정하면 사이트 전역에 즉시 반영됩니다.'
    : '새 카테고리를 만들고 이모지를 지정하면 전 페이지에 동일하게 반영됩니다.';
  if (nameInput) nameInput.value = state.categoryDraft.name || '';
  if (sortInput) sortInput.value = String(state.categoryDraft.sort_order || 0);
  if (deleteBtn) deleteBtn.style.display = editing ? 'inline-flex' : 'none';
  if (saveBtn) saveBtn.textContent = editing ? '수정 저장' : '추가 저장';

  if (emojiGrid) {
    emojiGrid.innerHTML = PREMIUM_EMOJIS.map((emoji) => `
      <button type="button" class="class-emoji-choice${emoji === state.categoryDraft.emoji ? ' selected' : ''}" data-action="select-emoji" data-emoji="${escapeAttr(emoji)}">${escapeHtml(emoji)}</button>
    `).join('');
  }

  renderCategoryPreview();
}

function renderCategoryPreview() {
  const preview = document.getElementById('classCategoryPreview');
  if (!preview || !state.categoryDraft) return;

  preview.innerHTML = `
    <div class="class-category-preview-emoji">${escapeHtml(state.categoryDraft.emoji || '✨')}</div>
    <div class="class-category-preview-copy">
      <strong>${escapeHtml(state.categoryDraft.name || '카테고리 이름')}</strong>
      <span>정렬 순서 ${formatNumber(state.categoryDraft.sort_order || 0)}</span>
    </div>
  `;

  document.querySelectorAll('#classCategoryEmojiGrid .class-emoji-choice').forEach((button) => {
    button.classList.toggle('selected', button.dataset.emoji === state.categoryDraft.emoji);
  });
}

function setCategoryEmoji(emoji) {
  if (!state.categoryDraft) return;
  state.categoryDraft.emoji = emoji;
  renderCategoryPreview();
}

async function saveCategoryFromModal() {
  if (!state.categoryDraft || state.categorySaving) return;

  const name = String(state.categoryDraft.name || '').trim();
  if (!name) {
    alert('카테고리 이름을 입력해 주세요.');
    return;
  }

  const payload = {
    name,
    emoji: state.categoryDraft.emoji || '✨',
    sort_order: toInteger(state.categoryDraft.sort_order, 0),
    is_active: state.categoryDraft.is_active ? 1 : 0,
  };

  state.categorySaving = true;
  const saveBtn = document.getElementById('btnSaveCategory');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const editing = Boolean(state.categoryDraft.originalName);
    const previousName = state.categoryDraft.originalName;
    const response = await window.BSQ.api(
      '/api/admin/class-categories',
      editing ? 'PUT' : 'POST',
      editing ? { ...payload, original_name: state.categoryDraft.originalName } : payload,
    );

    if (!response.success) throw new Error(response.error || '카테고리 저장 실패');

    closeModal('classCategoryModal');
    if (editing && state.filters.category === previousName) {
      state.filters.category = name;
    }
    state.categoryDraft = null;
    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('class-categories');
    await refreshDashboard({ includeCategories: true, includeRanking: false, includeClasses: true });
    alert(response.message || '카테고리가 저장되었습니다.');
  } catch (error) {
    alert(`카테고리 저장에 실패했습니다: ${error.message}`);
  } finally {
    state.categorySaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

function openDeleteCategoryConfirm(categoryName) {
  if (!categoryName) return;
  const found = state.categories.find((item) => item.name === categoryName);
  if (!found) return;
  if (!confirm(`"${found.name}" 카테고리를 삭제할까요?\n\n이 카테고리를 사용 중인 클래스는 미분류로 변경됩니다.`)) return;
  state.categoryDraft = {
    originalName: found.name,
    name: found.name,
    emoji: found.emoji || '✨',
    sort_order: toInteger(found.sort_order, 0),
    is_active: Boolean(found.is_active),
  };
  deleteCategoryFromModal();
}

async function deleteCategoryFromModal() {
  if (!state.categoryDraft?.originalName) return;

  try {
    const response = await window.BSQ.api('/api/admin/class-categories', 'DELETE', {
      name: state.categoryDraft.originalName,
    });

    if (!response.success) throw new Error(response.error || '카테고리 삭제 실패');

    closeModal('classCategoryModal');
    state.categoryDraft = null;
    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('class-categories');
    await refreshDashboard({ includeCategories: true, includeRanking: false, includeClasses: true });
    alert(response.message || '카테고리가 삭제되었습니다.');
  } catch (error) {
    alert(`카테고리 삭제에 실패했습니다: ${error.message}`);
  }
}

async function openClassDetail(classId) {
  const modal = document.getElementById('classDetailModal');
  if (!modal) return;
  modal.classList.add('is-open');
  modal.dataset.classId = classId;
  document.getElementById('classDetailBody').innerHTML = '<div class="class-modal-loading">클래스 상세를 불러오는 중입니다...</div>';

  try {
    const response = await window.BSQ.api(`/api/admin/classes/${encodeURIComponent(classId)}`);
    if (!response.success) throw new Error(response.error || '클래스 상세를 불러오지 못했습니다.');
    state.detail = response.data;
    state.detailRange = 'day';
    renderClassDetailModal();
  } catch (error) {
    const message = String(error?.message || '');
    if (/클래스를 찾을 수 없습니다|not found|404/i.test(message)) {
      document.getElementById('classDetailBody').innerHTML = `
        <div class="class-empty-inline" style="padding:2rem; text-align:center;">
          <strong style="display:block; margin-bottom:0.5rem;">해당 클래스는 이미 삭제되었거나 동기화가 지연되었습니다.</strong>
          <span>목록을 새로고침한 뒤 다시 확인해 주세요.</span>
        </div>
      `;
      refreshDashboard({ includeCategories: false, includeRanking: true, includeClasses: true }).catch(() => {});
      return;
    }
    document.getElementById('classDetailBody').innerHTML = `<div class="class-modal-error">${escapeHtml(message)}</div>`;
  }
}

function renderRevenueRangeButton(range, label) {
  const active = state.detailRange === range ? ' is-active' : '';
  return `<button type="button" class="class-range-button${active}" data-action="change-range" data-range="${escapeAttr(range)}">${escapeHtml(label)}</button>`;
}

function renderRefundCard(refund) {
  return `
    <article class="class-refund-card">
      <div class="class-refund-card-head">
        <strong>${escapeHtml(refund.user_name || refund.user_email || '회원')}</strong>
        <span>${formatCurrency(refund.refund_amount || 0)}</span>
      </div>
      <div class="class-refund-card-meta">
        <span>${escapeHtml(refund.refund_type || 'full')}</span>
        <span>${escapeHtml(formatDateTime(refund.processed_at || refund.created_at))}</span>
      </div>
      <p>${escapeHtml(refund.reason_note || refund.reason_tags || '사유 없음')}</p>
    </article>
  `;
}

function renderProfileAvatar(person = {}, className = 'class-instructor-avatar', fallback = 'A') {
  const image = person.profile_image_url || person.avatar || person.image_url || '';
  const label = String(person.name || person.nickname || fallback).trim().charAt(0) || fallback;
  const avatarStyle = image
    ? ` style="background-image:url('${escapeAttr(image)}'); background-size:cover; background-position:center; background-repeat:no-repeat; color:transparent;"`
    : '';

  return `<div class="${className}"${avatarStyle}>${image ? '' : escapeHtml(label)}</div>`;
}

function renderSubInstructorCard(person, index) {
  const name = person.name || person.nickname || `서브 강사 ${index + 1}`;
  const roleLabel = person.role === 'admin'
    ? '관리자'
    : person.role === 'operator'
      ? '운영자'
      : '서브 강사';

  return `
    <article class="class-sub-instructor-card">
      ${renderProfileAvatar(person, 'class-sub-instructor-avatar', '서')}
      <div class="class-sub-instructor-copy">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(person.email || '이메일 정보 없음')}</span>
        <span>${escapeHtml(person.phone || '연락처 정보 없음')}</span>
      </div>
      <div class="class-sub-instructor-meta">
        <span class="class-sub-instructor-role">${escapeHtml(roleLabel)}</span>
        <span>ID ${escapeHtml(person.id || person.user_id || '-')}</span>
      </div>
    </article>
  `;
}

function renderClassDetailModal() {
  const body = document.getElementById('classDetailBody');
  if (!body || !state.detail) return;

  const detail = state.detail;
  const cls = detail.class || {};
  const instructor = detail.instructor || {};
  const summary = detail.summary || {};
  const revenue = detail.revenue_by_range || {};
  const meetingStats = detail.meeting_stats || {};
  const refunds = Array.isArray(detail.refund_logs) ? detail.refund_logs : [];
  const subInstructors = Array.isArray(cls.sub_instructors)
    ? cls.sub_instructors
    : Array.isArray(detail.sub_instructors)
      ? detail.sub_instructors
      : [];
  const selectedRevenue = toNumber(revenue[state.detailRange], 0);
  const instructorName = instructor.name || cls.instructor_name || '-';
  const instructorAvatar = instructor.profile_image_url || cls.instructor_profile_image || cls.creator_profile_image || '';
  const instructorInitial = String(instructorName).trim().charAt(0) || 'A';
  const metricCards = [
    { label: '총 수강생수', value: formatNumber(summary.total_students ?? cls.total_students ?? cls.total_enrollments ?? cls.current_participants ?? 0) },
    { label: '최근 활동인원', value: formatNumber(summary.recent_active_students ?? cls.recent_active_students ?? 0) },
    { label: '최근 모임참석 수강생', value: formatNumber(summary.recent_meeting_attendee_count ?? summary.recent_meeting_attendance ?? cls.recent_meeting_attendee_count ?? cls.recent_meeting_attendance ?? meetingStats.recent_attendee_count ?? 0) },
    { label: '수강권 총 발행', value: formatNumber(summary.total_passes_issued ?? cls.total_passes_issued ?? 0) },
    { label: '수강권 사용', value: formatNumber(summary.total_passes_used ?? cls.total_passes_used ?? 0) },
    { label: '총 모임 수', value: formatNumber(summary.total_meetings ?? cls.total_meetings ?? cls.total_gatherings ?? 0) },
    { label: '모임 1회 평균 매출', value: formatCurrency(summary.avg_revenue_per_meeting ?? 0) },
    { label: '좋아요 수', value: formatNumber(summary.bookmark_count ?? cls.bookmark_count ?? cls.like_count ?? 0) },
    { label: '조회수', value: formatNumber(summary.total_visits ?? cls.total_visits ?? 0) },
    { label: '리뷰 수', value: formatNumber(summary.review_count ?? cls.review_count ?? 0) },
    { label: '별점', value: Number(summary.avg_rating ?? cls.avg_rating ?? 0).toFixed(1) },
    { label: '환불 누적', value: formatCurrency(summary.total_refund_amount ?? cls.total_refund_amount ?? 0) },
    { label: '공개 상태', value: cls.is_public ? '공개' : '비공개', wide: true },
  ];

  body.innerHTML = `
    <div class="class-detail-shell">
      <div class="class-detail-hero">
        <div class="class-detail-hero-copy">
          <div class="class-detail-kicker">클래스 상세 정보</div>
          <h3>${escapeHtml(cls.title || '제목 없음')}</h3>
          <div class="class-detail-subline">
            <span>${escapeHtml(cls.category || '미분류')}</span>
            <span>${cls.is_public ? '공개' : '비공개'}</span>
            <span>생성일 ${escapeHtml(formatDateTime(cls.created_at))}</span>
          </div>
        </div>
        <div class="class-detail-hero-side">
          <button type="button" class="btn-small outline" data-action="close-class-modal">닫기</button>
        </div>
      </div>

      <div class="class-detail-grid">
        <div class="class-detail-panel class-detail-instructor">
          <div class="class-detail-panel-title">메인 강사상세정보</div>
          <div class="class-detail-instructor-card">
            ${renderProfileAvatar({
              profile_image_url: instructorAvatar,
              name: instructorName,
            }, 'class-instructor-avatar large', instructorInitial)}
            <div class="class-instructor-copy">
              <strong>${escapeHtml(instructorName)}</strong>
              <span>ID ${escapeHtml(instructor.id || cls.instructor_id || '-')}</span>
              <span>${escapeHtml(instructor.email || cls.instructor_email || '-')}</span>
              <span>${escapeHtml(instructor.phone || cls.instructor_phone || '-')}</span>
            </div>
          </div>

          <div class="class-detail-sub-instructors">
            <div class="class-detail-panel-title class-detail-sub-instructors-title">
              서브 강사 정보
              <span>${formatNumber(subInstructors.length)}명</span>
            </div>
            ${subInstructors.length
              ? `<div class="class-detail-sub-instructor-list">
                  ${subInstructors.map((person, index) => renderSubInstructorCard(person, index)).join('')}
                </div>`
              : '<div class="class-empty-inline class-detail-sub-instructor-empty">등록된 서브 강사가 없습니다.</div>'}
          </div>
        </div>

        <div class="class-detail-panel">
          <div class="class-detail-panel-title">매출 범위 선택</div>
          <div class="class-range-buttons">
            ${renderRevenueRangeButton('day', '일일 매출')}
            ${renderRevenueRangeButton('week', '주간 매출')}
            ${renderRevenueRangeButton('month', '월간 매출')}
            ${renderRevenueRangeButton('year', '연간 매출')}
          </div>
          <div class="class-detail-revenue-card">
            <span>선택 매출</span>
            <strong>${formatCurrency(selectedRevenue)}</strong>
          </div>
          <div class="class-detail-range-grid">
            <div><span>일일</span><strong>${formatCurrency(revenue.day || 0)}</strong></div>
            <div><span>주간</span><strong>${formatCurrency(revenue.week || 0)}</strong></div>
            <div><span>월간</span><strong>${formatCurrency(revenue.month || 0)}</strong></div>
            <div><span>연간</span><strong>${formatCurrency(revenue.year || 0)}</strong></div>
          </div>
        </div>
      </div>

      <div class="class-detail-stats-grid">
        ${metricCards.map((item) => `
          <div class="class-detail-stat-card${item.wide ? ' class-detail-stat-card--wide' : ''}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join('')}
      </div>

      <div class="class-detail-panel">
        <div class="class-detail-panel-title">환불 내역</div>
        <div class="class-refund-list">
          ${refunds.length ? refunds.map((refund) => renderRefundCard(refund)).join('') : '<div class="class-empty-inline">등록된 환불 내역이 없습니다.</div>'}
        </div>
      </div>
    </div>
  `;
}

function openDeleteClassModal(classId, classTitle) {
  const modal = document.getElementById('classDeleteModal');
  if (!modal) return;

  modal.dataset.classId = classId;
  modal.dataset.expectedTitle = classTitle || '';
  document.getElementById('deleteClassModalTitle').textContent = classTitle || '클래스 삭제';
  const input = document.getElementById('deleteClassConfirmInput');
  input.value = '';
  input.dataset.expectedTitle = classTitle || '';
  document.getElementById('btnConfirmDeleteClass').disabled = true;
  modal.classList.add('is-open');
}

async function confirmDeleteClassFromModal() {
  const modal = document.getElementById('classDeleteModal');
  if (!modal) return;

  const classId = String(modal.dataset.classId || '').trim();
  const expected = String(modal.dataset.expectedTitle || '').trim();
  const input = String(document.getElementById('deleteClassConfirmInput')?.value || '').trim();
  if (!classId) return;
  if (input !== expected) {
    alert('클래스명을 정확히 입력해야 삭제할 수 있습니다.');
    return;
  }

  try {
    const response = await window.BSQ.api(`/api/admin/classes/${encodeURIComponent(classId)}`, 'DELETE', {
      confirm_title: input,
    });

    if (!response.success) throw new Error(response.error || '클래스 삭제 실패');

    closeModal('classDeleteModal');
    closeModal('classDetailModal');
    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('delete');
    await refreshDashboard({ includeCategories: false, includeRanking: true, includeClasses: true });
    alert(response.message || '클래스가 영구 삭제되었습니다.');
  } catch (error) {
    alert(`클래스 삭제에 실패했습니다: ${error.message}`);
  }
}

async function confirmDeleteClassFromModalSafe() {
  const modal = document.getElementById('classDeleteModal');
  if (!modal) return;

  const classId = String(modal.dataset.classId || '').trim();
  const expected = String(modal.dataset.expectedTitle || '').trim();
  const input = String(document.getElementById('deleteClassConfirmInput')?.value || '').trim();
  if (!classId) return;
  if (input !== expected) {
    alert('클래스명을 정확히 입력해야 삭제할 수 있습니다.');
    return;
  }

  try {
    const response = await window.BSQ.api(`/api/admin/classes/${encodeURIComponent(classId)}`, 'DELETE', {
      confirm_title: input,
    });

    if (!response.success) {
      if (/클래스를 찾을 수 없습니다|not found|404/i.test(String(response.error || ''))) {
        closeModal('classDeleteModal');
        closeModal('classDetailModal');
        await refreshDashboard({ includeCategories: false, includeRanking: true, includeClasses: true });
        alert('이미 삭제된 클래스라서 목록만 새로고침했습니다.');
        return;
      }
      throw new Error(response.error || '클래스 삭제에 실패했습니다.');
    }

    closeModal('classDeleteModal');
    closeModal('classDetailModal');
    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('delete');
    await refreshDashboard({ includeCategories: false, includeRanking: true, includeClasses: true });
    alert(response.message || '클래스가 삭제되었습니다.');
  } catch (error) {
    alert(`클래스 삭제에 실패했습니다: ${error.message}`);
  }
}

async function toggleClassVisibility(classId, nextChecked) {
  const row = document.querySelector(`tr[data-class-id="${CSS.escape(classId)}"]`);
  const switchInput = row?.querySelector('[data-action="toggle-class-visibility"]');
  const label = row?.querySelector('.class-switch-label');
  if (switchInput) switchInput.disabled = true;

  try {
    const response = await window.BSQ.api(`/api/admin/classes/${encodeURIComponent(classId)}`, 'PATCH', {
      is_public: !!nextChecked,
    });
    if (!response.success) throw new Error(response.error || '공개 상태 변경 실패');
    if (label) label.textContent = nextChecked ? '공개' : '비공개';
    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('edit');
  } catch (error) {
    alert(`공개 상태 변경에 실패했습니다: ${error.message}`);
    if (switchInput) switchInput.checked = !nextChecked;
    if (label) label.textContent = !nextChecked ? '공개' : '비공개';
  } finally {
    if (switchInput) switchInput.disabled = false;
  }
}

async function syncPopularRankingToRecommendations() {
  const button = document.getElementById('btnSyncPopularRecommendation');
  if (!button) return;
  if (!state.ranking.length) {
    alert('반영할 인기 랭킹 데이터가 없습니다.');
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '반영 중...';

  try {
    const recRes = await window.BSQ.api('/api/admin/recommendations');
    if (!recRes.success) throw new Error(recRes.error || '추천 데이터를 불러오지 못했습니다.');

    const recommendations = Array.isArray(recRes.data) ? recRes.data : [];
    const popular = recommendations.find((item) => item.type === 'popular') || {
      id: 'popular_main',
      title: '인기 클래스',
      description: '메인 화면 상단에 노출되는 인기 클래스입니다.',
      category: 'all',
      type: 'popular',
      classIds: [],
      classes: [],
    };

    const manualIds = uniqueStrings(popular.classIds || popular.class_ids || []);
    const rankingIds = state.ranking.slice(0, 10).map((item) => String(item.id)).filter(Boolean);
    const mergedIds = [...manualIds, ...rankingIds.filter((id) => !manualIds.includes(id))];

    const saveRes = await window.BSQ.api('/api/admin/recommendations', 'POST', {
      targetType: 'popular',
      folders: [{
        id: popular.id || popular.folder_id || 'popular_main',
        title: popular.title || '인기 클래스',
        description: popular.description || '메인 화면 상단에 노출되는 인기 클래스입니다.',
        category: popular.category || 'all',
        type: 'popular',
        classIds: mergedIds,
        order: 0,
      }],
    });

    if (!saveRes.success) throw new Error(saveRes.error || '추천 설정 반영 실패');

    if (window.BSQ?.triggerSync) window.BSQ.triggerSync('recommendations');
    alert('인기 클래스 추천 설정이 반영되었습니다. 수동 선택 항목이 먼저 나오고, 통계 추천 항목이 뒤에 이어집니다.');
  } catch (error) {
    alert(`추천 설정 반영에 실패했습니다: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function ensureModals() {
  if (document.getElementById('classAdminModals')) return;

  const root = document.createElement('div');
  root.id = 'classAdminModals';
  root.innerHTML = `
    <div class="class-admin-modal" id="classCategoryModal" aria-hidden="true">
      <div class="class-admin-modal-backdrop" data-action="close-category-modal"></div>
      <div class="class-admin-modal-panel class-admin-modal-panel--wide">
        <div class="class-admin-modal-header">
          <div>
            <h3 id="classCategoryModalTitle">카테고리 추가</h3>
            <p id="classCategoryModalSubtitle">카테고리 정보를 추가하거나 수정합니다.</p>
          </div>
          <button type="button" class="class-modal-close" data-action="close-category-modal">×</button>
        </div>
        <div class="class-admin-modal-body class-category-modal-body">
          <aside class="class-category-list-pane">
            <div class="class-category-list-head">
              <strong>전체 카테고리</strong>
              <span id="classCategoryManagerCount">${formatNumber(state.categories.length)}개</span>
            </div>
            <div id="classCategoryManagerList" class="class-category-list"></div>
          </aside>
          <section class="class-category-form-pane">
            <div class="class-category-preview" id="classCategoryPreview"></div>
            <div class="class-category-form">
              <div class="field-group">
                <label>카테고리 이름</label>
                <input type="text" id="classCategoryName" class="admin-form-input" placeholder="예: 드로잉">
              </div>
              <div class="field-group">
                <label>정렬 순서</label>
                <input type="number" id="classCategorySortOrder" class="admin-form-input" min="0" step="10" value="0">
              </div>
            </div>
            <div class="class-category-helper">프리미엄 이모지를 선택해 카테고리 톤을 통일합니다.</div>
            <div id="classCategoryEmojiGrid" class="class-emoji-grid"></div>
          </section>
        </div>
        <div class="class-admin-modal-footer">
          <button type="button" class="btn-small outline" data-action="close-category-modal">취소</button>
          <button type="button" class="btn-small outline" data-action="delete-category" id="btnDeleteCategory" style="display:none; color:var(--mac-danger); border-color:rgba(255,59,48,0.25);">삭제</button>
          <button type="button" class="btn-primary" data-action="save-category" id="btnSaveCategory">저장</button>
        </div>
      </div>
    </div>

    <div class="class-admin-modal" id="classDetailModal" aria-hidden="true">
      <div class="class-admin-modal-backdrop" data-action="close-class-modal"></div>
      <div class="class-admin-modal-panel">
        <div class="class-admin-modal-header">
          <div>
            <h3>클래스 상세</h3>
            <p>매출, 수강생, 리뷰, 환불 내역을 한 곳에서 확인합니다.</p>
          </div>
          <button type="button" class="class-modal-close" data-action="close-class-modal">×</button>
        </div>
        <div class="class-admin-modal-body" id="classDetailBody"></div>
      </div>
    </div>

    <div class="class-admin-modal" id="classDeleteModal" aria-hidden="true">
      <div class="class-admin-modal-backdrop" data-action="close-delete-modal"></div>
      <div class="class-admin-modal-panel class-admin-modal-panel--narrow class-delete-panel">
        <div class="class-admin-modal-header class-delete-header">
          <div>
            <h3 id="deleteClassModalTitle">클래스 삭제</h3>
            <p>클래스명을 정확히 입력해야 영구 삭제할 수 있습니다.</p>
          </div>
          <button type="button" class="class-modal-close" data-action="close-delete-modal">×</button>
        </div>
        <div class="class-admin-modal-body">
          <div class="class-delete-warning">
            <strong>주의</strong>
            <p>이 작업은 되돌릴 수 없습니다. 관련 데이터는 서버에서 영구 삭제됩니다.</p>
          </div>
          <div class="field-group">
            <label>클래스명 입력</label>
            <input type="text" id="deleteClassConfirmInput" class="admin-form-input" placeholder="정확한 클래스명을 입력하세요">
          </div>
        </div>
        <div class="class-admin-modal-footer">
          <button type="button" class="btn-small outline" data-action="close-delete-modal">취소</button>
          <button type="button" class="btn-primary" id="btnConfirmDeleteClass" data-action="confirm-delete-class" disabled>영구 삭제</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('is-open');
}

window.loadAdminClasses = loadClasses;
window.openClassDetail = openClassDetail;
window.openCategoryModal = openCategoryModal;
window.loadRanking = loadRanking;
window.syncPopularRankingToRecommendations = syncPopularRankingToRecommendations;
})();
