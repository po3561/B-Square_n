// admin_recommend.js - Handles Recommended Class Folders Management
const RECOMMEND_ADMIN_VERSION = '2026.03.22-01:stable';
const POPULAR_TARGET = Object.freeze({
    folderId: 'popular',
    storageId: 'popular_main',
    listId: 'popularClassList',
    type: 'popular',
    title: '지금 인기 있는 클래스'
});
const EMPTY_SELECTION_MESSAGE = '클래스를 추가해 주세요.';
const NO_POPULAR_MESSAGE = '등록된 인기 클래스가 없습니다.';

console.log(`%c[BSQ Admin] admin_recommend.js LOADED (Ver ${RECOMMEND_ADMIN_VERSION})`, 'background:navy; color:yellow; padding:5px;');

let currentTargetFolderId = null;
let modalCurrentCategory = 'all';
let currentModalTarget = createEmptyTargetState();

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabRecommend') {
            loadRecommendations();
        }
    });

    document.getElementById('btnAddRecommendFolder')?.addEventListener('click', () => {
        addFolderUI();
    });

    document.getElementById('btnSaveRecommendations')?.addEventListener('click', () => {
        saveRecommendations('regular');
    });

    document.getElementById('btnSavePopular')?.addEventListener('click', () => {
        saveRecommendations('popular');
    });

    document.getElementById('btnCloseClassModal')?.addEventListener('click', () => {
        closeClassSearchModal();
    });

    document.getElementById('classSearchInput')?.addEventListener('input', debounce((e) => {
        searchClassesForModal(e.target.value);
    }, 500));

    document.getElementById('modalCategorySelect')?.addEventListener('change', (e) => {
        modalCurrentCategory = e.target.value;
        searchClassesForModal(document.getElementById('classSearchInput')?.value || '');
    });
});

function createEmptyTargetState() {
    return {
        folderId: null,
        listId: null,
        type: null,
        title: ''
    };
}

function normalizeFolderType(id) {
    return isPopularTarget(id) ? POPULAR_TARGET.type : 'regular';
}

function isPopularTarget(id) {
    return id === POPULAR_TARGET.folderId || id === POPULAR_TARGET.storageId || id === 'popular_folder';
}

function getFolderListId(folderId) {
    return `list_${folderId}`;
}

function createFolderId() {
    return `folder_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function clearActiveTargetHighlight() {
    document.querySelectorAll('.recommend-folder-item').forEach(el => el.classList.remove('active-target'));
}

function setCurrentModalTarget(nextTarget) {
    currentModalTarget = {
        folderId: nextTarget?.folderId || null,
        listId: nextTarget?.listId || null,
        type: nextTarget?.type || null,
        title: nextTarget?.title || ''
    };
    currentTargetFolderId = currentModalTarget.folderId;

    const modal = document.getElementById('classSearchModal');
    if (!modal) return;

    if (!currentModalTarget.folderId) {
        delete modal.dataset.targetId;
        delete modal.dataset.targetListId;
        delete modal.dataset.targetType;
        delete modal.dataset.targetTitle;
        return;
    }

    modal.dataset.targetId = currentModalTarget.folderId;
    modal.dataset.targetListId = currentModalTarget.listId;
    modal.dataset.targetType = currentModalTarget.type;
    modal.dataset.targetTitle = currentModalTarget.title;
}

function getModalElement() {
    return document.getElementById('classSearchModal');
}

function isModalActive() {
    const modal = getModalElement();
    return !!(modal && modal.style.display === 'flex');
}

function readFolderTitle(folderItem) {
    return folderItem?.querySelector('.folder-title-input')?.value?.trim() || '';
}

function resolveTargetState(rawId, btn) {
    if (isPopularTarget(rawId)) {
        return { ...POPULAR_TARGET };
    }

    let folderItem = btn ? btn.closest('.recommend-folder-item') : null;
    if (!folderItem && rawId) {
        folderItem = document.querySelector(`.recommend-folder-item[data-id="${rawId}"]`);
    }

    if (!folderItem) return null;

    const folderId = folderItem.dataset.id;
    return {
        folderId,
        listId: getFolderListId(folderId),
        type: 'regular',
        title: readFolderTitle(folderItem)
    };
}

function syncTargetStateFromDom() {
    if (!currentModalTarget.folderId) return null;

    if (currentModalTarget.type === POPULAR_TARGET.type) {
        const listEl = document.getElementById(POPULAR_TARGET.listId);
        if (!listEl) return null;
        currentModalTarget = {
            ...POPULAR_TARGET,
            title: POPULAR_TARGET.title
        };
        setCurrentModalTarget(currentModalTarget);
        return listEl;
    }

    const folderItem = document.querySelector(`.recommend-folder-item[data-id="${currentModalTarget.folderId}"]`);
    if (!folderItem) return null;

    const listEl = folderItem.querySelector('.selected-class-list');
    if (!listEl) return null;

    currentModalTarget = {
        folderId: folderItem.dataset.id,
        listId: listEl.id,
        type: 'regular',
        title: readFolderTitle(folderItem)
    };
    setCurrentModalTarget(currentModalTarget);
    return listEl;
}

function getCurrentTargetListElement() {
    const syncedList = syncTargetStateFromDom();
    if (syncedList) return syncedList;

    if (currentModalTarget.listId) {
        return document.getElementById(currentModalTarget.listId);
    }

    return null;
}

function getSelectedClassIdsFromList(listEl) {
    if (!listEl) return [];
    return Array.from(listEl.querySelectorAll('.selected-class-card')).map(card => String(card.dataset.cid));
}

function createSelectedClassCard(data) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'selected-class-card';
    itemDiv.dataset.cid = String(data.id);
    itemDiv.style.cssText = 'position:relative; background:#fff; border:1px solid #eee; border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; transition:all 0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.05);';

    const thumb = data.thumbnail || data.image_url || '';
    itemDiv.innerHTML = `
        <div style="width:100%; height:100px; background:#f0f0f0; border-radius:8px; overflow:hidden;">
            <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://placehold.co/200x120?text=No+Image'">
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-size:0.7rem; color:var(--mac-primary); font-weight:700;">${data.category || '기타'}</div>
            <div style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#333;">${data.title || ''}</div>
            <div style="font-size:0.75rem; color:#888;">${data.instructor_name || data.creator_name || '강사'}</div>
        </div>
        <button style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;" onclick="this.parentElement.remove()">×</button>
    `;
    return itemDiv;
}

function getEmptyMessage(type) {
    return type === POPULAR_TARGET.type ? NO_POPULAR_MESSAGE : EMPTY_SELECTION_MESSAGE;
}

function renderEmptyState(listEl, type) {
    listEl.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888;">${getEmptyMessage(type)}</div>`;
}

/**
 * 추천/인기 항목 데이터를 불러와 각 섹션에 렌더링
 */
async function loadRecommendations() {
    if (isModalActive()) {
        console.warn('[BSQ Admin] loadRecommendations SKIPPED: Modal is currently active.');
        return;
    }

    closeClassSearchModal({ keepHidden: true });

    const regularContainer = document.getElementById('recommendFolderList');
    const popularContainer = document.getElementById('popularClassList');

    if (regularContainer) regularContainer.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';
    if (popularContainer) popularContainer.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';

    try {
        const res = await BSQ.api(`/api/admin/recommendations?t=${Date.now()}`);
        if (!res.success) throw new Error(res.error);

        const allItems = Array.isArray(res.data) ? res.data : [];
        if (regularContainer) regularContainer.innerHTML = '';
        if (popularContainer) popularContainer.innerHTML = '';

        const popularItems = allItems.filter(item => item.type === POPULAR_TARGET.type);
        const regularItems = allItems.filter(item => item.type !== POPULAR_TARGET.type);

        if (popularContainer) {
            const popularItem = popularItems[0];
            if (popularItem) {
                renderSelectedClassesInContainer(POPULAR_TARGET.listId, popularItem.classes || [], POPULAR_TARGET.type);
            } else {
                renderEmptyState(popularContainer, POPULAR_TARGET.type);
            }
        }

        if (regularContainer) {
            if (regularItems.length === 0) {
                regularContainer.innerHTML = '<div style="text-align:center; padding:3rem; color:#888; border:2px dashed #eee; border-radius:12px;">등록된 추천 폴더가 없습니다.</div>';
            } else {
                regularItems.forEach(folder => addFolderUI(folder));
            }
        }
    } catch (err) {
        console.error('Load recommendations failed', err);
        const errHtml = `<div style="color:red; text-align:center; padding:2rem;">데이터를 불러오는 데 실패했습니다: ${err.message}</div>`;
        if (regularContainer) regularContainer.innerHTML = errHtml;
        if (popularContainer) popularContainer.innerHTML = errHtml;
    }
}

/**
 * 추천 폴더 UI 추가
 */
function addFolderUI(folderData = null) {
    const container = document.getElementById('recommendFolderList');
    if (!container) return;

    const noMsg = container.querySelector('div[style*="dashed"]');
    if (noMsg) noMsg.remove();

    const folderId = String(folderData?.folder_id || folderData?.id || createFolderId()).trim();
    const listId = getFolderListId(folderId);
    const div = document.createElement('div');
    div.className = 'recommend-folder-item';
    div.dataset.id = folderId;
    div.dataset.type = 'regular';
    div.style.cssText = 'background:#fff; border:1px solid #eef0f7; border-radius:16px; padding:2rem; position:relative; margin-bottom:2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.03);';

    const categories = [
        { val: 'all', lab: '전체' },
        { val: '디자인', lab: '디자인' },
        { val: '생산성', lab: '생산성' },
        { val: '스포츠', lab: '스포츠' },
        { val: '디지털 드로잉', lab: '디지털 드로잉' },
        { val: '성공 마인드', lab: '성공 마인드' },
        { val: '음악', lab: '음악' },
        { val: '베이킹', lab: '베이킹' },
        { val: '사진', lab: '사진' },
        { val: '영상', lab: '영상' },
        { val: '공예', lab: '공예' }
    ];

    const categoryOptions = categories.map(cat =>
        `<option value="${cat.val}" ${folderData?.category === cat.val ? 'selected' : ''}>${cat.lab}</option>`
    ).join('');

    div.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:2rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column; gap:10px; flex:1;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:1.4rem;">📁</span>
                        <input type="text" class="folder-title-input admin-form-input" placeholder="섹션 제목 (예: 경제 | 제테크)" value="${folderData?.title || ''}" style="margin:0; font-size:1.1rem; font-weight:700; width:100%; max-width:400px; border-bottom: 2px solid #eee; border-radius:0; padding:5px 0;">

                        <div style="display:flex; align-items:center; gap:8px; margin-left:10px;">
                            <span style="font-size:0.85rem; color:#64748b; white-space:nowrap;">연결 카테고리:</span>
                            <select class="folder-category-select admin-form-input" style="margin:0; width:140px; font-size:0.85rem; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px;">
                                ${categoryOptions}
                            </select>
                        </div>
                    </div>
                    <input type="text" class="folder-desc-input admin-form-input" placeholder="섹션 설명 (예: 부의 추월차선을 위한 로드맵)" value="${folderData?.description || ''}" style="margin:0; font-size:0.9rem; color:#666; width:100%; max-width:500px; border:none; padding:5px 0;">
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <button class="btn-small outline" onclick="window.openClassSearch('${folderId}', this)" style="padding:0.6rem 1rem; font-weight:600; border-color:var(--mac-primary); color:var(--mac-primary);">+ 클래스 추가</button>
                    <button class="btn-small" style="background:rgba(255,59,48,0.1); color:var(--admin-danger); border:none;" onclick="this.closest('.recommend-folder-item').remove()">삭제</button>
                </div>
            </div>
        </div>
        <div class="selected-class-list" id="${listId}" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:1.5rem; background:#fcfcfe; padding:1.5rem; border-radius:12px; border:1px dashed #e2e8f0; min-height:80px;">
            <!-- Selected Classes will appear here -->
        </div>
    `;

    container.appendChild(div);

    if (Array.isArray(folderData?.classes) && folderData.classes.length > 0) {
        renderSelectedClassesInContainer(listId, folderData.classes, 'regular');
    } else {
        renderSelectedClassesInContainer(listId, [], 'regular');
    }
}

/**
 * 컨테이너 내부에 선택된 클래스 카드들 렌더링
 */
function renderSelectedClassesInContainer(containerId, classes, type = normalizeFolderType(containerId === POPULAR_TARGET.listId ? POPULAR_TARGET.folderId : null)) {
    const listEl = document.getElementById(containerId);
    if (!listEl) return;

    listEl.innerHTML = '';
    if (!Array.isArray(classes) || classes.length === 0) {
        renderEmptyState(listEl, type);
        return;
    }

    classes.forEach(data => {
        listEl.appendChild(createSelectedClassCard(data));
    });
}

/**
 * 클래스 검색 모달 열기
 * @param {string} id - 폴더 ID (문자열)
 * @param {HTMLElement} btn - 클릭된 버튼 요소
 */
function openClassSearch(id, btn) {
    const target = resolveTargetState(id, btn);
    if (!target) {
        console.error('[BSQ Admin] openClassSearch: Target folder NOT FOUND for id:', id);
        alert('⚠️ 오류: 대상을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
        return;
    }

    clearActiveTargetHighlight();
    if (target.type === 'regular' && btn) {
        btn.closest('.recommend-folder-item')?.classList.add('active-target');
    } else if (target.type === 'regular') {
        document.querySelector(`.recommend-folder-item[data-id="${target.folderId}"]`)?.classList.add('active-target');
    }

    setCurrentModalTarget(target);

    const modal = getModalElement();
    if (modal) {
        modal.style.display = 'flex';
    }

    const input = document.getElementById('classSearchInput');
    if (input) input.value = '';

    const catSelect = document.getElementById('modalCategorySelect');
    if (catSelect) catSelect.value = 'all';
    modalCurrentCategory = 'all';

    searchClassesForModal('');
}

/**
 * 모달 닫기 (하이라이트 제거 및 정리)
 */
function closeClassSearchModal(options = {}) {
    const modal = getModalElement();
    if (modal && !options.keepHidden) {
        modal.style.display = 'none';
    }

    clearActiveTargetHighlight();
    setCurrentModalTarget(createEmptyTargetState());
    console.log('[BSQ Admin] Modal Closed & States Cleared');
}

async function searchClassesForModal(query) {
    const resultList = document.getElementById('classSearchResultList');
    const countEl = document.getElementById('modalResultCount');
    if (!resultList) return;

    resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#94a3b8;"><div style="display:inline-block; width:30px; height:30px; border:3px solid #f3f3f3; border-top:3px solid #1e293b; border-radius:50%; animation: spin 1s linear infinite; margin-bottom:1rem;"></div><p>클래스 정보를 조회 중입니다...</p></div>';

    try {
        let url = `/api/classes?t=${Date.now()}`;
        if (query) url += `&q=${encodeURIComponent(query)}`;

        const res = await BSQ.api(url);
        if (!res.success) throw new Error(res.error);

        let filtered = Array.isArray(res.data) ? res.data : [];

        if (modalCurrentCategory !== 'all') {
            filtered = filtered.filter(c => {
                const cat = (c.category || '').toLowerCase();
                return cat.includes(modalCurrentCategory.toLowerCase());
            });
        }

        if (countEl) countEl.innerText = `총 ${filtered.length}개의 클래스`;

        if (filtered.length === 0) {
            resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#94a3b8;"><div style="font-size:3rem; margin-bottom:1rem;">🔍</div><p>검색 결과가 없습니다.</p></div>';
            return;
        }

        const targetListEl = getCurrentTargetListElement();
        const existingIds = getSelectedClassIdsFromList(targetListEl);

        resultList.innerHTML = filtered.map(c => {
            const isAdded = existingIds.includes(String(c.id));
            const cleanTitle = (c.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const cleanInstructor = (c.instructor_name || '강사').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const cleanCategory = (c.category || '기타').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const cleanThumb = (c.thumbnail || c.image_url || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            return `
                <div class="class-search-card" data-id="${c.id}"
                     style="${isAdded ? 'opacity:0.5;' : ''}"
                     onclick="addClassToTarget('${c.id}', '${cleanTitle}', '${cleanThumb}', '${cleanCategory}', '${cleanInstructor}')">
                    <div class="card-img">
                        <img src="${c.thumbnail || c.image_url || ''}" alt="${c.title}" onerror="this.src='https://placehold.co/400x250?text=No+Image'">
                        <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.6); color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:4px;">${c.category || '기타'}</div>
                    </div>
                    <div class="card-body">
                        <div class="card-title">${c.title}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${c.instructor_name || '강사'}</div>
                        <div class="card-footer">
                            <button class="btn-small outline select-btn"
                                    onclick="event.stopPropagation(); window.addClassToTarget('${c.id}', '${cleanTitle}', '${cleanThumb}', '${cleanCategory}', '${cleanInstructor}')"
                                    style="border-radius:20px; font-size:0.7rem; padding:2px 10px; border-color:#e2e8f0; cursor:pointer; ${isAdded ? 'background:#10b981; color:#fff; border-color:#10b981;' : ''}">
                                ${isAdded ? '추가됨' : '선택'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Search failed', err);
        resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#ef4444;"><p>정보 로드 중 오류가 발생했습니다.</p></div>';
    }
}

async function addClassToTarget(cid, title, thumb, category, instructor) {
    try {
        const listEl = getCurrentTargetListElement();

        if (!listEl) {
            console.error('[BSQ Admin] addClassToTarget ERROR: Target list not found.', currentModalTarget);
            alert('⚠️ 대상을 찾을 수 없습니다. 다시 폴더를 선택해 주세요.');
            return;
        }

        if (listEl.querySelector(`.selected-class-card[data-cid="${cid}"]`)) {
            alert('이미 이 섹션에 추가된 클래스입니다.');
            return;
        }

        const currentType = currentModalTarget.type || normalizeFolderType(currentModalTarget.folderId);
        if (
            listEl.innerHTML.includes(NO_POPULAR_MESSAGE) ||
            listEl.innerHTML.includes(EMPTY_SELECTION_MESSAGE) ||
            listEl.innerHTML.trim() === ''
        ) {
            listEl.innerHTML = '';
        }

        listEl.appendChild(createSelectedClassCard({
            id: cid,
            title,
            thumbnail: thumb,
            category,
            instructor_name: instructor
        }));

        if (!currentModalTarget.type) {
            setCurrentModalTarget({
                ...currentModalTarget,
                type: currentType
            });
        }

        const searchCard = document.querySelector(`.class-search-card[data-id="${cid}"]`);
        if (searchCard) {
            searchCard.style.opacity = '0.5';
            const cardBtn = searchCard.querySelector('.select-btn');
            if (cardBtn) {
                cardBtn.innerText = '추가됨';
                cardBtn.style.background = '#10b981';
                cardBtn.style.color = '#fff';
                cardBtn.style.borderColor = '#10b981';
            }
        }
    } catch (err) {
        console.error('[BSQ Admin] addClassToTarget ERROR:', err);
        alert('⚠️ 추가 중 오류가 발생했습니다: ' + err.message);
    }
}

async function saveRecommendations(targetType) {
    const btnId = targetType === POPULAR_TARGET.type ? 'btnSavePopular' : 'btnSaveRecommendations';
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '저장 중...';

    const folders = [];

    if (targetType === POPULAR_TARGET.type) {
        const popIds = getSelectedClassIdsFromList(document.getElementById(POPULAR_TARGET.listId));
        folders.push({
            id: POPULAR_TARGET.storageId,
            title: POPULAR_TARGET.title,
            description: '실시간으로 가장 핫한 클래스들을 만나보세요.',
            category: 'all',
            type: POPULAR_TARGET.type,
            classIds: popIds,
            order: 0
        });
    }

    if (targetType === 'regular') {
        const folderItems = document.querySelectorAll('.recommend-folder-item');
        folderItems.forEach((item, index) => {
            const id = item.dataset.id;
            const title = item.querySelector('.folder-title-input')?.value.trim() || '';
            const description = item.querySelector('.folder-desc-input')?.value.trim() || '';
            const category = item.querySelector('.folder-category-select')?.value || 'all';
            const classIds = getSelectedClassIdsFromList(item.querySelector('.selected-class-list'));

            if (title) {
                folders.push({
                    id,
                    title,
                    description,
                    category,
                    type: 'regular',
                    classIds,
                    order: index + 1
                });
            }
        });
    }

    if (targetType === 'regular' && folders.length === 0 && !confirm('저장할 추천 폴더가 없습니다. 기존 추천 폴더 데이터가 모두 삭제됩니다. 계속하시겠습니까?')) {
        btn.disabled = false;
        btn.innerText = originalText;
        return;
    }

    try {
        const res = await BSQ.api('/api/admin/recommendations', 'POST', {
            targetType,
            folders
        });
        if (!res.success) throw new Error(res.error);

        alert(`${targetType === POPULAR_TARGET.type ? '인기 설정' : '추천 폴더'}이 저장되었습니다.`);
    } catch (err) {
        console.error('Save failed', err);
        alert('저장에 실패했습니다: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

window.openClassSearch = openClassSearch;
window.closeClassSearchModal = closeClassSearchModal;
window.addClassToTarget = addClassToTarget;
window.saveRecommendations = saveRecommendations;
window.loadRecommendations = loadRecommendations;
window.renderSelectedClassesInContainer = renderSelectedClassesInContainer;
