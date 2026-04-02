;(function () {

const RECOMMEND_ADMIN_VERSION = '2026.03.23-05';
const POPULAR_TARGET = Object.freeze({
    folderId: 'popular_main',
    listId: 'popularClassList',
    type: 'popular',
    title: '인기 클래스',
    description: '메인 화면 상단에 노출되는 인기 클래스입니다.',
});
const EMPTY_SELECTION_MESSAGE = '선택된 클래스가 없습니다. 클래스 추가 버튼을 눌러주세요.';
const NO_POPULAR_MESSAGE = '등록된 인기 클래스가 없습니다.';

console.log(`%c[BSQ Admin] admin_recommend.js LOADED (Ver ${RECOMMEND_ADMIN_VERSION})`, 'background:navy; color:yellow; padding:5px;');

const state = {
    popular: emptyPopular(),
    folders: new Map(),
    order: [],
    removed: new Set(),
    catalog: [],
    catalogById: new Map(),
    catalogLoading: null,
    catalogLoaded: false,
    catalogError: null,
    categories: [],
    categoriesLoaded: false,
    categoriesLoading: null,
    q: '',
    category: 'all',
};

let currentTarget = emptyTarget();

document.addEventListener('DOMContentLoaded', init);

function init() {
    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabRecommend') loadRecommendations();
    });

    window.addEventListener('bsq_sync', (event) => {
        if (event.detail?.type === 'class-categories') {
            state.categoriesLoaded = false;
            state.categories = [];
            if (document.getElementById('tabRecommend')?.classList.contains('active')) {
                loadRecommendations();
            }
        }
    });

    document.getElementById('btnAddRecommendFolder')?.addEventListener('click', addNewFolder);
    document.getElementById('btnSaveRecommendations')?.addEventListener('click', () => saveRecommendations('regular'));
    document.getElementById('btnSavePopular')?.addEventListener('click', () => saveRecommendations('popular'));
    document.getElementById('btnOpenPopularSearch')?.addEventListener('click', (e) => openClassSearch(POPULAR_TARGET.folderId, e.currentTarget));
    document.getElementById('btnCloseClassModal')?.addEventListener('click', () => closeClassSearchModal());

    document.getElementById('classSearchInput')?.addEventListener('input', debounce((e) => {
        searchClassesForModal(e.target.value || '');
    }, 250));

    document.getElementById('modalCategorySelect')?.addEventListener('change', (e) => {
        state.category = e.target.value || 'all';
        renderSearchResults();
    });

    const regular = document.getElementById('recommendFolderList');
    regular?.addEventListener('click', handleRegularClick);
    regular?.addEventListener('input', handleRegularFieldChange);
    regular?.addEventListener('change', handleRegularFieldChange);

    document.getElementById('popularClassList')?.addEventListener('click', handlePopularClick);
    document.getElementById('classSearchResultList')?.addEventListener('click', handleSearchClick);
}

function emptyTarget() {
    return { folderId: null, listId: null, type: null, title: '' };
}

function emptyPopular() {
    return {
        id: POPULAR_TARGET.folderId,
        title: POPULAR_TARGET.title,
        description: POPULAR_TARGET.description,
        category: 'all',
        type: 'popular',
        classIds: [],
        classes: [],
        persisted: false,
    };
}

function resetState() {
    state.popular = emptyPopular();
    state.folders = new Map();
    state.order = [];
    state.removed = new Set();
    state.catalogError = null;
    currentTarget = emptyTarget();
}

function idOf(value) {
    return String(value || '').trim();
}

function arr(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    const t = value.trim();
    if (!t) return [];
    try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function uniq(values) {
    return Array.from(new Set(values.map((v) => idOf(v)).filter(Boolean)));
}

function classIdsFrom(raw) {
    const ids = [
        ...arr(raw?.classIds),
        ...arr(raw?.class_ids),
        ...(Array.isArray(raw?.classes) ? raw.classes.map((c) => c?.id ?? c?.class_id ?? c) : []),
    ];
    return uniq(ids);
}

function folderState(raw = {}, persisted = false) {
    const id = idOf(raw.folder_id || raw.id || createFolderId());
    return {
        id,
        title: idOf(raw.title || '새 추천 폴더') || '새 추천 폴더',
        description: idOf(raw.description),
        category: idOf(raw.category || 'all') || 'all',
        type: raw.type === 'popular' ? 'popular' : 'regular',
        classIds: classIdsFrom(raw),
        classes: Array.isArray(raw.classes) ? raw.classes.filter(Boolean) : [],
        persisted: persisted || Boolean(raw.folder_id || raw.id),
        order: Number(raw.sort_order ?? raw.order ?? 0) || 0,
    };
}

function popularState(raw) {
    if (!raw) return emptyPopular();
    const base = folderState(raw, true);
    return {
        ...base,
        id: idOf(raw.folder_id || raw.id || POPULAR_TARGET.folderId) || POPULAR_TARGET.folderId,
        title: idOf(raw.title || POPULAR_TARGET.title) || POPULAR_TARGET.title,
        description: idOf(raw.description || POPULAR_TARGET.description) || POPULAR_TARGET.description,
        category: idOf(raw.category || 'all') || 'all',
        type: 'popular',
    };
}

function createFolderId() {
    return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function esc(v = '') {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function n(v) {
    const num = Number(v || 0);
    return Number.isFinite(num) ? num.toLocaleString('ko-KR') : '0';
}

function priceLabel(c) {
    if (!c) return '가격 정보 없음';
    if (Number(c.is_free) === 1) return '무료';
    const price = Number(c.price || 0);
    const rate = Number(c.discount_rate || 0);
    const finalPrice = rate > 0 ? Math.max(Math.round(price * (1 - rate / 100)), 0) : price;
    return rate > 0 ? `${n(finalPrice)}원 · ${rate}% 할인` : `${n(finalPrice)}원`;
}

function folderListId(folderId) {
    return `list_${folderId}`;
}

function isPopularId(id) {
    return id === POPULAR_TARGET.folderId || id === 'popular' || id === 'popular_folder';
}

function modalEl() {
    return document.getElementById('classSearchModal');
}

function modalActive() {
    const modal = modalEl();
    return !!(modal && modal.style.display === 'flex');
}

function getRegularContainer() {
    return document.getElementById('recommendFolderList');
}

function getPopularContainer() {
    return document.getElementById('popularClassList');
}

function activeFolder() {
    if (!currentTarget.folderId) return null;
    if (currentTarget.type === 'popular') return state.popular;
    return state.folders.get(currentTarget.folderId) || null;
}

function categoryOptions(selected = 'all') {
    const set = new Set(['all']);
    if (state.categories.length > 0) {
        state.categories.forEach((c) => {
            const cat = idOf(c.name);
            if (cat) set.add(cat);
        });
    } else {
        state.catalog.forEach((c) => {
            const cat = idOf(c.category);
            if (cat) set.add(cat);
        });
        state.folders.forEach((f) => {
            const cat = idOf(f.category);
            if (cat) set.add(cat);
        });
        const popCat = idOf(state.popular.category);
        if (popCat) set.add(popCat);
    }
    const current = idOf(selected || 'all') || 'all';
    if (!set.has(current)) set.add(current);

    return Array.from(set)
        .sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b, 'ko')))
        .map((v) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(v === 'all' ? '전체' : v)}</option>`)
        .join('');
}

function refreshSelects() {
    document.querySelectorAll('.folder-category-select').forEach((s) => {
        const current = s.value || 'all';
        s.innerHTML = categoryOptions(current);
        s.value = current;
    });

    const modalSelect = document.getElementById('modalCategorySelect');
    if (modalSelect) {
        const current = modalSelect.value || 'all';
        modalSelect.innerHTML = categoryOptions(current);
        modalSelect.value = current;
    }
}

function stateCardHtml(variant, title, message) {
    const icon = variant === 'error' ? '!' : variant === 'loading' ? '…' : 'i';
    return `
        <div class="recommend-state recommend-state--${esc(variant)}">
            <div class="recommend-state-icon" aria-hidden="true">${icon}</div>
            <strong>${esc(title)}</strong>
            <p>${esc(message)}</p>
        </div>
    `;
}

function renderEmpty(container, type) {
    container.innerHTML = stateCardHtml(
        'neutral',
        type === 'popular' ? NO_POPULAR_MESSAGE : EMPTY_SELECTION_MESSAGE,
        type === 'popular'
            ? '오른쪽 상단의 + 클래스 추가 버튼으로 인기 클래스를 선택하세요.'
            : '각 폴더의 + 클래스 추가 버튼으로 클래스를 채워 넣을 수 있습니다.'
    );
}

// Rendering and API logic continue below.

function selectedCardHtml(folderId, c, type = 'regular') {
    const thumb = c?.thumbnail || c?.image_url || 'https://placehold.co/200x120?text=No+Image';
    return `
        <div class="selected-class-card" data-cid="${esc(c?.id || '')}" style="position:relative; background:#fff; border:1px solid #eee; border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; transition:all 0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <div style="width:100%; height:100px; background:#f0f0f0; border-radius:8px; overflow:hidden;">
                <img src="${esc(thumb)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://placehold.co/200x120?text=No+Image'">
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.7rem; color:var(--mac-primary); font-weight:700;">${esc(c?.category || '기타')}</div>
                <div style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#333;">${esc(c?.title || '')}</div>
                <div style="font-size:0.75rem; color:#888;">${esc(c?.instructor_name || c?.creator_name || '강사')}</div>
                <div style="font-size:0.74rem; color:#666;">${esc(priceLabel(c))} · 평점 ${esc(Number(c?.avg_rating || 0).toFixed(1))} · 후기 ${esc(n(c?.review_count || 0))}개</div>
            </div>
            <button type="button" data-action="remove-class" data-folder-id="${esc(folderId)}" data-class-id="${esc(c?.id || '')}" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;">×</button>
        </div>
    `;
}

function searchCardHtml(c, selected) {
    const thumb = c.thumbnail || c.image_url || 'https://placehold.co/400x250?text=No+Image';
    const approved = Number(c.is_approved || 0) === 1 ? '승인됨' : '미승인';
    return `
        <div class="class-search-card" data-id="${esc(c.id)}" style="opacity:${selected ? '0.55' : '1'};">
            <div class="card-img">
                <img src="${esc(thumb)}" alt="${esc(c.title || '')}" onerror="this.src='https://placehold.co/400x250?text=No+Image'">
                <div style="position:absolute; top:8px; left:8px; display:flex; gap:0.35rem; flex-wrap:wrap;">
                    <span style="background:rgba(0,0,0,0.65); color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:999px;">${esc(c.category || '기타')}</span>
                    <span style="background:${Number(c.is_approved || 0) === 1 ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)'}; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:999px;">${esc(approved)}</span>
                </div>
            </div>
            <div class="card-body">
                <div class="card-category">${esc(c.category || '기타')}</div>
                <div class="card-title">${esc(c.title || '')}</div>
                <div style="font-size:0.78rem; color:#64748b; line-height:1.45; margin-bottom:0.5rem;">${esc(c.instructor_name || c.creator_name || '강사')}</div>
                <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:auto; margin-bottom:0.75rem;">
                    <span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:#eef2ff; color:#4338ca;">${esc(priceLabel(c))}</span>
                    <span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:#ecfeff; color:#0e7490;">평점 ${esc(Number(c.avg_rating || 0).toFixed(1))}</span>
                    <span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:#fef3c7; color:#92400e;">후기 ${esc(n(c.review_count || 0))}개</span>
                    <span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:#e0f2fe; color:#075985;">수강 ${esc(n(c.current_participants || c.total_enrollments || 0))}명</span>
                </div>
                <div class="card-footer">
                    <div class="card-price">${esc(priceLabel(c))}</div>
                    <button type="button" class="btn-small outline select-btn" data-action="add-class" data-class-id="${esc(c.id)}" style="border-radius:20px; font-size:0.7rem; padding:2px 10px; border-color:#e2e8f0; cursor:pointer; ${selected ? 'background:#10b981; color:#fff; border-color:#10b981;' : ''}" ${selected ? 'disabled' : ''}>${selected ? '추가됨' : '선택'}</button>
                </div>
            </div>
        </div>
    `;
}

function folderCardHtml(folder) {
    return `
        <div class="recommend-folder-item" data-id="${esc(folder.id)}" data-type="regular" style="background:#fff; border:1px solid #eef0f7; border-radius:16px; padding:2rem; position:relative; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
            <div style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
                    <div style="display:flex; flex-direction:column; gap:10px; flex:1;">
                        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                            <span style="font-size:1.1rem; font-weight:700; color:var(--mac-primary);">폴더</span>
                            <input type="text" class="folder-title-input admin-form-input" data-field="title" value="${esc(folder.title)}" placeholder="폴더 제목" style="margin:0; font-size:1.05rem; font-weight:700; width:100%; max-width:420px; border-bottom:2px solid #eee; border-radius:0; padding:5px 0;">
                            <div style="display:flex; align-items:center; gap:8px; margin-left:10px;">
                                <span style="font-size:0.85rem; color:#64748b; white-space:nowrap;">카테고리:</span>
                                <select class="folder-category-select admin-form-input" data-field="category" style="margin:0; width:180px; font-size:0.85rem; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px;">${categoryOptions(folder.category)}</select>
                            </div>
                        </div>
                        <input type="text" class="folder-desc-input admin-form-input" data-field="description" value="${esc(folder.description)}" placeholder="폴더 설명" style="margin:0; font-size:0.9rem; color:#666; width:100%; max-width:560px; border:none; padding:5px 0;">
                    </div>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <button type="button" class="btn-small outline" data-action="open-folder-search" data-folder-id="${esc(folder.id)}" style="padding:0.6rem 1rem; font-weight:600; border-color:var(--mac-primary); color:var(--mac-primary);">+ 클래스 추가</button>
                        <button type="button" class="btn-small" data-action="remove-folder" data-folder-id="${esc(folder.id)}" style="background:rgba(255,59,48,0.1); color:var(--admin-danger); border:none;">삭제</button>
                    </div>
                </div>
            </div>
            <div class="selected-class-list" id="${esc(folderListId(folder.id))}" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:1rem; background:#fcfcfe; padding:1.5rem; border-radius:12px; border:1px dashed #e2e8f0; min-height:120px;"></div>
        </div>
    `;
}

function renderSelectedList(containerId, classes, type = 'regular', folderId = '') {
    const list = document.getElementById(containerId);
    if (!list) return;
    const data = Array.isArray(classes) ? classes.filter(Boolean) : [];
    list.innerHTML = data.length
        ? data.map((c) => selectedCardHtml(folderId, c, type)).join('')
        : `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888;">${esc(type === 'popular' ? NO_POPULAR_MESSAGE : EMPTY_SELECTION_MESSAGE)}</div>`;
}

function renderPopular() {
    const list = getPopularContainer();
    if (!list) return;
    list.innerHTML = '';
    renderSelectedList(POPULAR_TARGET.listId, state.popular.classes, 'popular', state.popular.id);
}

function renderRegular() {
    const container = getRegularContainer();
    if (!container) return;
    container.innerHTML = '';
    if (state.order.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:#888; border:2px dashed #eee; border-radius:12px;">등록된 추천 폴더가 없습니다.</div>';
        return;
    }
    const folders = state.order.map((id) => state.folders.get(id)).filter(Boolean);
    container.innerHTML = folders.map((folder) => folderCardHtml(folder)).join('');
    folders.forEach((folder) => {
        renderSelectedList(folderListId(folder.id), folder.classes, folder.type, folder.id);
    });
    refreshSelects();
}

function addFolderUI(data = null) {
    if (!data) return addNewFolder();
    registerFolder(data);
    renderRegular();
}

function registerFolder(raw, prepend = false) {
    const folder = folderState(raw, true);
    state.folders.set(folder.id, folder);
    if (prepend) state.order = [folder.id, ...state.order.filter((id) => id !== folder.id)];
    else if (!state.order.includes(folder.id)) state.order.push(folder.id);
    return folder;
}

function addNewFolder() {
    const folder = folderState({
        id: createFolderId(),
        title: '새 추천 폴더',
        description: '',
        category: 'all',
        classIds: [],
        classes: [],
        type: 'regular',
        order: 0,
    }, false);

    state.folders.set(folder.id, folder);
    state.order = [folder.id, ...state.order.filter((id) => id !== folder.id)];
    state.removed.delete(folder.id);
    renderRegular();

    requestAnimationFrame(() => {
        const card = document.querySelector(`.recommend-folder-item[data-id="${folder.id}"]`);
        const title = card?.querySelector('[data-field="title"]');
        title?.focus();
        title?.select?.();
        card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
}

function removeFolder(folderId) {
    const folder = state.folders.get(folderId);
    if (!folder) return;
    if (!confirm('이 추천 폴더를 삭제할까요?')) return;

    if (folder.persisted) state.removed.add(folderId);
    state.folders.delete(folderId);
    state.order = state.order.filter((id) => id !== folderId);
    if (currentTarget.folderId === folderId) closeClassSearchModal();
    renderRegular();
}

function handleRegularFieldChange(e) {
    const field = e.target?.dataset?.field;
    if (!field) return;
    const card = e.target.closest('.recommend-folder-item');
    if (!card) return;
    const folder = state.folders.get(card.dataset.id);
    if (!folder) return;
    if (field === 'title') folder.title = idOf(e.target.value) || '새 추천 폴더';
    if (field === 'description') folder.description = idOf(e.target.value);
    if (field === 'category') folder.category = idOf(e.target.value) || 'all';
}

function handleRegularClick(e) {
    const openBtn = e.target.closest('[data-action="open-folder-search"]');
    if (openBtn) return openClassSearch(openBtn.dataset.folderId, openBtn);
    const removeBtn = e.target.closest('[data-action="remove-folder"]');
    if (removeBtn) return removeFolder(removeBtn.dataset.folderId);
    const removeClassBtn = e.target.closest('[data-action="remove-class"]');
    if (removeClassBtn) return removeClassFromFolder(removeClassBtn.dataset.folderId, removeClassBtn.dataset.classId);
}

function handlePopularClick(e) {
    const removeClassBtn = e.target.closest('[data-action="remove-class"]');
    if (removeClassBtn) removeClassFromFolder(removeClassBtn.dataset.folderId, removeClassBtn.dataset.classId);
}

function handleSearchClick(e) {
    const addBtn = e.target.closest('[data-action="add-class"]');
    if (addBtn) addClassToTarget(addBtn.dataset.classId);
}

function openClassSearch(id, btn) {
    const target = resolveTarget(id, btn);
    if (!target) return alert('대상을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    setTarget(target);

    const modal = modalEl();
    if (modal) modal.style.display = 'flex';

    const input = document.getElementById('classSearchInput');
    if (input) input.value = '';
    const select = document.getElementById('modalCategorySelect');
    if (select) select.value = 'all';

    state.q = '';
    state.category = 'all';

    ensureCatalogLoaded().then(() => {
        refreshSelects();
        renderSearchResults();
    }).catch(() => renderSearchResults());
}

function resolveTarget(rawId, btn) {
    if (isPopularId(rawId)) {
        return {
            folderId: state.popular.id || POPULAR_TARGET.folderId,
            listId: POPULAR_TARGET.listId,
            type: 'popular',
            title: state.popular.title || POPULAR_TARGET.title,
        };
    }

    let card = btn ? btn.closest('.recommend-folder-item') : null;
    if (!card && rawId) card = document.querySelector(`.recommend-folder-item[data-id="${idOf(rawId)}"]`);
    if (!card) return null;

    const folder = state.folders.get(card.dataset.id);
    if (!folder) return null;
    return { folderId: folder.id, listId: folderListId(folder.id), type: 'regular', title: folder.title };
}

function setTarget(next) {
    currentTarget = {
        folderId: next?.folderId || null,
        listId: next?.listId || null,
        type: next?.type || null,
        title: next?.title || '',
    };

    const modal = modalEl();
    if (!modal) return;
    if (!currentTarget.folderId) {
        delete modal.dataset.targetId;
        delete modal.dataset.targetListId;
        delete modal.dataset.targetType;
        delete modal.dataset.targetTitle;
        return;
    }

    modal.dataset.targetId = currentTarget.folderId;
    modal.dataset.targetListId = currentTarget.listId;
    modal.dataset.targetType = currentTarget.type;
    modal.dataset.targetTitle = currentTarget.title;
}

function closeClassSearchModal(options = {}) {
    const modal = modalEl();
    if (modal && !options.keepHidden) modal.style.display = 'none';
    setTarget(emptyTarget());
}

async function ensureCatalogLoaded() {
    if (state.catalogLoaded) return state.catalog;
    if (state.catalogLoading) return state.catalogLoading;

    state.catalogLoading = (async () => {
        try {
            state.catalogError = null;
            const res = await BSQ.api('/api/admin/classes');
            if (!res.success) throw new Error(res.error || '관리자 클래스 카탈로그를 불러오지 못했습니다.');
            const data = Array.isArray(res.data) ? res.data : [];
            state.catalog = data;
            state.catalogById = new Map(data.map((c) => [String(c.id), c]));
            state.catalogLoaded = true;
            refreshSelects();
            return data;
        } catch (err) {
            state.catalogError = err.message;
            throw err;
        }
    })().finally(() => {
        state.catalogLoading = null;
    });

    return state.catalogLoading;
}

async function ensureCategoriesLoaded() {
    if (state.categoriesLoaded) return state.categories;
    if (state.categoriesLoading) return state.categoriesLoading;

    state.categoriesLoading = (async () => {
        try {
            const res = await BSQ.api('/api/class-categories');
            if (!res.success) throw new Error(res.error || '카테고리를 불러오지 못했습니다.');
            state.categories = Array.isArray(res.data) ? res.data.map((item) => ({
                name: idOf(item.name),
                emoji: idOf(item.emoji || '✨') || '✨',
                class_count: Number(item.class_count || 0),
            })).filter((item) => item.name) : [];
            state.categoriesLoaded = true;
            refreshSelects();
            return state.categories;
        } catch (err) {
            console.warn('[BSQ Admin] category catalog load failed', err);
            state.categories = [];
            state.categoriesLoaded = true;
            return [];
        }
    })().finally(() => {
        state.categoriesLoading = null;
    });

    return state.categoriesLoading;
}

function matches(c, query) {
    if (!query) return true;
    const haystack = [
        c.title,
        c.category,
        c.keywords,
        c.summary,
        c.description,
        c.description_text,
        c.instructor_name,
        c.creator_name,
        c.creator_email,
        c.creator_phone,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
}

function filteredCatalog() {
    const query = idOf(state.q);
    const category = idOf(state.category || 'all') || 'all';
    return state.catalog.filter((c) => {
        if (category !== 'all') {
            const cat = idOf(c.category).toLowerCase();
            if (!cat || !cat.includes(category.toLowerCase())) return false;
        }
        return matches(c, query);
    });
}

function renderSearchResults() {
    const list = document.getElementById('classSearchResultList');
    const count = document.getElementById('modalResultCount');
    if (!list) return;

    if (state.catalogError && !state.catalogLoaded && !state.catalogLoading) {
        list.innerHTML = `<div style="grid-column:1/-1; padding:3rem; text-align:center; color:#ef4444;">${esc(state.catalogError)}</div>`;
        if (count) count.textContent = '총 0개';
        return;
    }

    if (!state.catalogLoaded) {
        list.innerHTML = '<div style="grid-column:1/-1; padding:3rem; text-align:center; color:#94a3b8;">클래스 카탈로그를 불러오는 중입니다...</div>';
        if (count) count.textContent = '총 0개';
        return;
    }

    const folder = activeFolder();
    const selected = new Set((folder?.classIds || []).map((id) => String(id)));
    const items = filteredCatalog();
    if (count) count.textContent = `총 ${items.length}개`;

    list.innerHTML = items.length
        ? items.map((c) => searchCardHtml(c, selected.has(String(c.id)))).join('')
        : '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#94a3b8;"><div style="font-size:3rem; margin-bottom:1rem;">🔍</div><p>검색 결과가 없습니다.</p></div>';
}

function searchClassesForModal(query) {
    state.q = query || '';
    renderSearchResults();
}

function addClassToTarget(classId) {
    const folder = activeFolder();
    if (!folder) return alert('대상을 찾을 수 없습니다. 다시 폴더를 선택해 주세요.');
    const data = state.catalogById.get(String(classId));
    if (!data) return alert('선택한 클래스를 찾을 수 없습니다.');
    if (folder.classIds.includes(String(classId))) return;

    folder.classIds.push(String(classId));
    folder.classes.push(data);

    renderSelectedList(folder.type === 'popular' ? POPULAR_TARGET.listId : folderListId(folder.id), folder.classes, folder.type, folder.id);
    renderSearchResults();
}

function removeClassFromFolder(folderId, classId) {
    const folder = isPopularId(folderId) ? state.popular : state.folders.get(folderId);
    if (!folder) return;

    folder.classIds = folder.classIds.filter((id) => String(id) !== String(classId));
    folder.classes = folder.classes.filter((c) => String(c.id) !== String(classId));

    renderSelectedList(folder.type === 'popular' ? POPULAR_TARGET.listId : folderListId(folder.id), folder.classes, folder.type, folder.id);
    if (currentTarget.folderId === folder.id || (folder.type === 'popular' && currentTarget.type === 'popular')) renderSearchResults();
}

function applyRecommendationData(items) {
    resetState();
    const popular = items.find((i) => i.type === 'popular');
    state.popular = popularState(popular);
    items.filter((i) => i.type !== 'popular')
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .forEach((item) => registerFolder(item));
}

async function loadRecommendations() {
    if (modalActive()) return;
    closeClassSearchModal({ keepHidden: true });
    resetState();

    const regular = getRegularContainer();
    const popular = getPopularContainer();
    if (regular) regular.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';
    if (popular) popular.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';

    try {
        const recPromise = BSQ.api('/api/admin/recommendations');
        const catalogPromise = ensureCatalogLoaded().catch((err) => {
            console.warn('[BSQ Admin] class catalog prefetch failed', err);
            return null;
        });
        const categoriesPromise = ensureCategoriesLoaded().catch((err) => {
            console.warn('[BSQ Admin] category catalog prefetch failed', err);
            return null;
        });
        const [recResult] = await Promise.allSettled([recPromise, catalogPromise, categoriesPromise]);
        if (recResult.status !== 'fulfilled') throw recResult.reason || new Error('추천 데이터 로드 실패');
        if (!recResult.value.success) throw new Error(recResult.value.error || '추천 데이터 로드 실패');

        applyRecommendationData(Array.isArray(recResult.value.data) ? recResult.value.data : []);
        refreshSelects();
        renderPopular();
        renderRegular();
    } catch (err) {
        const html = `<div style="color:red; text-align:center; padding:2rem;">데이터를 불러오지 못했습니다: ${esc(err.message)}</div>`;
        if (regular) regular.innerHTML = html;
        if (popular) popular.innerHTML = html;
    }
}

async function saveRecommendations(targetType) {
    const btnId = targetType === 'popular' ? 'btnSavePopular' : 'btnSaveRecommendations';
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const original = btn.innerText;
    btn.disabled = true;
    btn.innerText = '저장 중...';

    try {
        const payload = { targetType, folders: [] };
        if (targetType === 'popular') {
            payload.folders = [{
                id: state.popular.id || POPULAR_TARGET.folderId,
                title: state.popular.title || POPULAR_TARGET.title,
                description: state.popular.description || POPULAR_TARGET.description,
                category: state.popular.category || 'all',
                type: 'popular',
                classIds: [...state.popular.classIds],
                order: 0,
            }];
        } else {
            payload.folders = state.order.map((id, index) => {
                const folder = state.folders.get(id);
                return folder ? {
                    id: folder.id,
                    title: folder.title,
                    description: folder.description || '',
                    category: folder.category || 'all',
                    type: 'regular',
                    classIds: [...folder.classIds],
                    order: index + 1,
                } : null;
            }).filter(Boolean);
            payload.deletedFolderIds = Array.from(state.removed);
        }

        const res = await BSQ.api('/api/admin/recommendations', 'POST', payload);
        if (!res.success) throw new Error(res.error || '저장 실패');

        if (targetType === 'popular') {
            state.popular.persisted = true;
        } else {
            state.order.forEach((id) => {
                const folder = state.folders.get(id);
                if (folder) folder.persisted = true;
            });
            state.removed.clear();
            renderRegular();
        }

        alert(targetType === 'popular' ? '인기 클래스 설정이 저장되었습니다.' : '추천 폴더가 저장되었습니다.');
    } catch (err) {
        alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerText = original;
    }
}

function debounce(fn, wait) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

window.openClassSearch = openClassSearch;
window.closeClassSearchModal = closeClassSearchModal;
window.addClassToTarget = addClassToTarget;
window.saveRecommendations = saveRecommendations;
window.loadRecommendations = loadRecommendations;
window.renderSelectedClassesInContainer = renderSelectedList;
window.searchClassesForModal = searchClassesForModal;
window.addFolderUI = addFolderUI;
})();
