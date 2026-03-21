// admin_recommend.js - Handles Recommended Class Folders Management
console.log("%c[BSQ Admin] admin_recommend.js LOADED (Ver 2026.03.21-20:10)", "background:navy; color:yellow; padding:5px;");

document.addEventListener('DOMContentLoaded', () => {
    // The initial load on DOMContentLoaded for 'tabRecommend' is removed.
    // Loading will now be solely handled by the 'adminTabChanged' event.

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

    // Modal Close
    document.getElementById('btnCloseClassModal')?.addEventListener('click', () => {
        document.getElementById('classSearchModal').style.display = 'none';
    });

    // Global Search Input
    document.getElementById('classSearchInput')?.addEventListener('input', debounce((e) => {
        searchClassesForModal(e.target.value);
    }, 500));

    // Modal Category Select Listener
    document.getElementById('modalCategorySelect')?.addEventListener('change', (e) => {
        modalCurrentCategory = e.target.value;
        searchClassesForModal(document.getElementById('classSearchInput').value);
    });
});

let currentTargetFolderId = null;
let modalCurrentCategory = 'all';

/**
 * 추천/인기 항목 데이터를 불러와 각 섹션에 렌더링
 */
async function loadRecommendations() {
    // [Safety Guard] 모달이 열려있을 때는 검색 중이므로 외부 리프레시 방지 (데이터 유실 방합)
    const modal = document.getElementById('classSearchModal');
    if (modal && modal.style.display === 'flex') {
        console.warn("[BSQ Admin] loadRecommendations SKIPPED: Modal is currently active.");
        return;
    }

    const regularContainer = document.getElementById('recommendFolderList');
    const popularContainer = document.getElementById('popularClassList');
    
    if (regularContainer) regularContainer.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';
    if (popularContainer) popularContainer.innerHTML = '<div style="text-align:center; padding:3rem;"><div class="admin-spinner"></div>로딩 중...</div>';

    try {
        // [Optimization] 캐시 방지 파라미터 추가
        const res = await BSQ.api(`/api/admin/recommendations?t=${Date.now()}`);
        if (!res.success) throw new Error(res.error);

        const allItems = res.data || [];
        if (regularContainer) regularContainer.innerHTML = '';
        if (popularContainer) popularContainer.innerHTML = '';

        const popularItems = allItems.filter(f => f.type === 'popular');
        const regularItems = allItems.filter(f => f.type !== 'popular');

        // 1. 인기 클래스 렌더링 (단일 목록)
        if (popularContainer) {
            if (popularItems.length > 0) {
                const pop = popularItems[0];
                renderSelectedClassesInContainer('popularClassList', pop.classes || []);
            } else {
                popularContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888; border:1px dashed #ddd; border-radius:12px;">등록된 인기 클래스가 없습니다.</div>';
            }
        }

        // 2. 추천 폴더 렌더링
        if (regularContainer) {
            if (regularItems.length === 0) {
                regularContainer.innerHTML = '<div style="text-align:center; padding:3rem; color:#888; border:2px dashed #eee; border-radius:12px;">등록된 추천 폴더가 없습니다.</div>';
            } else {
                regularItems.forEach(folder => {
                    addFolderUI(folder); // 객체 그대로 전달하여 일관성 유지
                });
            }
        }
    } catch (err) {
        console.error("Load recommendations failed", err);
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

    // [Core Fix] ID가 중복되지 않도록 타임스탬프 뒤에 난수를 추가
    const folderId = String(folderData?.folder_id || folderData?.id || 'folder_' + Date.now() + '_' + Math.floor(Math.random() * 1000)).trim();
    console.log("[BSQ Admin] Creating Folder UI with Unique ID:", folderId);
    
    const div = document.createElement('div');
    div.className = 'recommend-folder-item';
    div.dataset.id = folderId;
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
        <div class="selected-class-list" id="list_${folderId}" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:1.5rem; background:#fcfcfe; padding:1.5rem; border-radius:12px; border:1px dashed #e2e8f0; min-height:80px;">
            <!-- Selected Classes will appear here -->
        </div>
    `;

    container.appendChild(div);

    if (folderData?.classes && Array.isArray(folderData.classes)) {
        renderSelectedClassesInContainer(`list_${folderId}`, folderData.classes);
    }
}

/**
 * 컨테이너 내부에 선택된 클래스 카드들 렌더링
 */
function renderSelectedClassesInContainer(containerId, classes) {
    const listEl = document.getElementById(containerId);
    if (!listEl) return;

    listEl.innerHTML = '';
    if (classes.length === 0) {
        listEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888;">클래스를 추가해 주세요.</div>';
        return;
    }

    classes.forEach(data => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'selected-class-card';
        itemDiv.dataset.cid = data.id;
        itemDiv.style.cssText = 'position:relative; background:#fff; border:1px solid #eee; border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; transition:all 0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.05);';
        
        const thumb = data.thumbnail || data.image_url || '';
        itemDiv.innerHTML = `
            <div style="width:100%; height:100px; background:#f0f0f0; border-radius:8px; overflow:hidden;">
                <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://placehold.co/200x120?text=No+Image'">
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.7rem; color:var(--mac-primary); font-weight:700;">${data.category || '기타'}</div>
                <div style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#333;">${data.title}</div>
                <div style="font-size:0.75rem; color:#888;">${data.instructor_name || data.creator_name || '강사'}</div>
            </div>
            <button style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;" onclick="this.parentElement.remove()">×</button>
        `;
        listEl.appendChild(itemDiv);
    });
}

/**
 * 클래스 검색 모달 열기
 * @param {string} id - 폴더 ID (문자열)
 * @param {HTMLElement} btn - 클릭된 버튼 요소
 */
function openClassSearch(id, btn) {
    console.log("[BSQ Admin] openClassSearch CALL. ID:", id);
    
    let actualId = id;
    let listId = "";
    let title = "";
    let folderItem = null;

    // [Special Case] 인기 섹션 처리
    if (id === 'popular_folder' || id === 'popular' || id === 'popular_main') {
        actualId = 'popular';
        listId = 'popularClassList';
        title = '지금 인기 있는 클래스';
        console.log("[BSQ Admin] Targeting Popular Section directly");
    } else {
        // [General Case] 추천 폴더 처리
        folderItem = btn ? btn.closest('.recommend-folder-item') : null;
        if (!folderItem && id) {
            folderItem = document.querySelector(`.recommend-folder-item[data-id="${id}"]`);
        }

        if (!folderItem) {
            console.error("[BSQ Admin] openClassSearch: Target folder NOT FOUND for id:", id);
            alert("⚠️ 오류: 대상을 찾을 수 없습니다. 페이지를 새로고침해 주세요.");
            return;
        }

        actualId = folderItem.dataset.id;
        listId = "list_" + actualId;
        title = folderItem.querySelector('.folder-title-input')?.value || '';
        
        // 시각적 강조
        document.querySelectorAll('.recommend-folder-item').forEach(el => el.classList.remove('active-target'));
        folderItem.classList.add('active-target');
    }
    
    currentTargetFolderId = actualId;
    
    const modal = document.getElementById('classSearchModal');
    if (modal) {
        modal.dataset.targetId = actualId;
        modal.dataset.targetListId = listId;
        modal.dataset.targetTitle = title;
        modal.style.display = 'flex';
        console.log("[BSQ Admin] Modal Target Anchored:", { actualId, listId, title });
    }
    
    // 3. 모달 초기화 및 검색
    const input = document.getElementById('classSearchInput');
    if (input) input.value = '';
    const catSelect = document.getElementById('modalCategorySelect');
    if (catSelect) catSelect.value = 'all';

    searchClassesForModal('');
}

/**
 * 모달 닫기 (하이라이트 제거 및 정리)
 */
function closeClassSearchModal() {
    const modal = document.getElementById('classSearchModal');
    if (modal) modal.style.display = 'none';
    document.querySelectorAll('.recommend-folder-item').forEach(el => el.classList.remove('active-target'));
    console.log("[BSQ Admin] Modal Closed & States Cleared");
}

async function searchClassesForModal(query) {
    const resultList = document.getElementById('classSearchResultList');
    const countEl = document.getElementById('modalResultCount');
    
    resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#94a3b8;"><div style="display:inline-block; width:30px; height:30px; border:3px solid #f3f3f3; border-top:3px solid #1e293b; border-radius:50%; animation: spin 1s linear infinite; margin-bottom:1rem;"></div><p>클래스 정보를 조회 중입니다...</p></div>';

    try {
        let url = `/api/classes?t=${Date.now()}`;
        if (query) url += `&q=${encodeURIComponent(query)}`;

        const res = await BSQ.api(url);
        if (!res.success) throw new Error(res.error);

        let filtered = res.data || [];
        
        if (modalCurrentCategory !== 'all') {
            filtered = filtered.filter(c => {
                const cat = (c.category || '').toLowerCase();
                // 한글 카테고리명을 직접 비교하거나 포함 여부 확인
                return cat.includes(modalCurrentCategory.toLowerCase());
            });
        }

        if (countEl) countEl.innerText = `총 ${filtered.length}개의 클래스`;

        if (filtered.length === 0) {
            resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#94a3b8;"><div style="font-size:3rem; margin-bottom:1rem;">🔍</div><p>검색 결과가 없습니다.</p></div>';
            return;
        }

        const targetListEl = (currentTargetFolderId === 'popular' || currentTargetFolderId === 'popular_folder')
            ? document.getElementById('popularClassList') 
            : document.getElementById('list_' + currentTargetFolderId);
        
        const existingIds = targetListEl 
            ? Array.from(targetListEl.querySelectorAll('.selected-class-card')).map(c => c.dataset.cid)
            : [];

        resultList.innerHTML = filtered.map(c => {
            const isAdded = existingIds.includes(String(c.id));
            const price = c.is_free ? '무료' : (parseInt(c.tickets_price_one_time || 0)).toLocaleString() + '원';
            const cleanTitle = (c.title || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const cleanInstructor = (c.instructor_name || '강사').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const cleanCategory = (c.category || '기타').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const cleanThumb = (c.thumbnail || c.image_url || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");

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
        console.error("Search failed", err);
        resultList.innerHTML = '<div style="grid-column:1/-1; padding:4rem; text-align:center; color:#ef4444;"><p>정보 로드 중 오류가 발생했습니다.</p></div>';
    }
}

async function addClassToTarget(cid, title, thumb, category, instructor) {
    try {
        console.log("[BSQ Admin] addClassToTarget START:", { cid, title });
        
        const modal = document.getElementById('classSearchModal');
        const targetId = modal ? modal.dataset.targetId : currentTargetFolderId;
        const targetListId = modal ? modal.dataset.targetListId : null;
        const targetTitle = (modal ? modal.dataset.targetTitle : '').trim();
        
        console.log("[BSQ Admin] addClassToTarget - Finding target for:", { targetId, targetListId, targetTitle });
        
        let listEl = null;

        // [Ultimate Bulletproof Matching]
        // 1. 직접 ID 고정 매칭
        if (targetListId) {
            listEl = document.getElementById(targetListId);
        }
        
        // 인기 섹션 특수 처리
        if (!listEl && (targetId === 'popular' || targetId === 'popular_folder' || targetId === 'popular_main')) {
            listEl = document.getElementById('popularClassList');
        }

        // 2. 현재 화면의 하이라이트(.active-target) 확인 (로딩 등에 의해 ID가 변해도 시각적으로 같은 곳)
        if (!listEl) {
            const activeFolder = document.querySelector('.recommend-folder-item.active-target');
            if (activeFolder) {
                listEl = activeFolder.querySelector('.selected-class-list');
                console.log("[BSQ Admin] Found via active-target highlight");
            }
        }

        // 3. [최후 수단] 타이틀 매칭 - 화면 전체에서 해당 제목을 가진 폴더를 수동으로 찾음
        // (사용자가 데이터를 새로고침하여 DOM이 통째로 갈아치워졌을 때도 작동)
        if (!listEl && targetTitle) {
            const allFolders = Array.from(document.querySelectorAll('.recommend-folder-item'));
            const matchedFolder = allFolders.find(el => {
                const titleInput = el.querySelector('.folder-title-input');
                return titleInput && titleInput.value.trim() === targetTitle;
            });
            if (matchedFolder) {
                const innerList = matchedFolder.querySelector('.selected-class-list');
                if (innerList) {
                    listEl = innerList;
                    console.log("[BSQ Admin] Found via Global Title Search:", targetTitle);
                    // 재발 방지를 위해 새로운 리스트 ID와 하이라이트 동기화
                    if (modal) modal.dataset.targetListId = listEl.id;
                    matchedFolder.classList.add('active-target');
                }
            }
        }
        
        if (!listEl) {
            console.error("CRITICAL: Target list not found.");
            const availableTitles = Array.from(document.querySelectorAll('.folder-title-input')).map(input => input.value.trim() || "(제목 없음)");
            
            alert(`⚠️ 대상을 찾을 수 없습니다. (데이터가 새로고침되었을 수 있습니다)\n\n찾는 폴더명: "${targetTitle || '미지정'}"\n사용 가능 폴더: ${availableTitles.join(', ')}\n\n폴더를 다시 한 번 클릭하여 선택해 주세요.`);
            return;
        }

        // Duplicate check
        if (listEl.querySelector(`.selected-class-card[data-cid="${cid}"]`)) {
            alert("이미 이 섹션에 추가된 클래스입니다.");
            return;
        }

        // "Empty" message remove
        if (listEl.innerHTML.includes('등록된 인기 클래스') || listEl.innerHTML.includes('추가해 주세요') || listEl.innerHTML.trim() === '') {
            listEl.innerHTML = '';
        }

        const itemDiv = document.createElement('div');
        itemDiv.className = 'selected-class-card';
        itemDiv.dataset.cid = cid;
        itemDiv.style.cssText = 'position:relative; background:#fff; border:1px solid #eee; border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; transition:all 0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.05);';
        
        itemDiv.innerHTML = `
            <div style="width:100%; height:100px; background:#f0f0f0; border-radius:8px; overflow:hidden;">
                <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://placehold.co/200x120?text=No+Image'">
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.7rem; color:var(--mac-primary); font-weight:700;">${category}</div>
                <div style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#333;">${title}</div>
                <div style="font-size:0.75rem; color:#888;">${instructor}</div>
            </div>
            <button style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;" onclick="this.parentElement.remove()">×</button>
        `;
        listEl.appendChild(itemDiv);

        // Visual feedback
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
        console.error("[BSQ Admin] addClassToTarget ERROR:", err);
        alert("⚠️ 추가 중 오류가 발생했습니다: " + err.message);
    }
}
window.addClassToTarget = addClassToTarget;

async function saveRecommendations(targetType) {
    const btnId = targetType === 'popular' ? 'btnSavePopular' : 'btnSaveRecommendations';
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '저장 중...';

    const folders = [];

    // 1. 인기 클래스 수집 (targetType이 popular일 때만 수행)
    if (targetType === 'popular') {
        const popIds = Array.from(document.querySelectorAll('#popularClassList .selected-class-card')).map(c => c.dataset.cid);
        folders.push({
            id: 'popular_main',
            title: '지금 인기 있는 클래스',
            description: '실시간으로 가장 핫한 클래스들을 만나보세요.',
            category: 'all',
            type: 'popular',
            classIds: popIds,
            order: 0
        });
    }

    // 2. 추천 폴더 수집 (targetType이 regular일 때만 수행)
    if (targetType === 'regular') {
        const folderItems = document.querySelectorAll('.recommend-folder-item');
        folderItems.forEach((item, index) => {
            const id = item.dataset.id;
            const title = item.querySelector('.folder-title-input').value.trim();
            const description = item.querySelector('.folder-desc-input').value.trim();
            const category = item.querySelector('.folder-category-select').value;
            const classIds = Array.from(item.querySelectorAll('.selected-class-card')).map(c => c.dataset.cid);

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

    // [Safety Check] 저장할 데이터가 없을 때 경고 (단, 삭제 후 저장이 목적일 수 있으므로 진행은 함)
    if (folders.length === 0 && !confirm("저장할 항목이 없습니다. 해당 섹션의 모든 데이터가 삭제됩니다. 계속하시겠습니까?")) {
        btn.disabled = false;
        btn.innerText = originalText;
        return;
    }

    try {
        const res = await BSQ.api('/api/admin/recommendations', 'POST', { folders });
        if (!res.success) throw new Error(res.error);
        
        console.log(`[BSQ Admin] ${targetType} saved successfully.`);
        alert(`${targetType === 'popular' ? '인기 설정' : '추천 폴더'}이 저장되었습니다.`);
        
        // [Optimization] 전체 로드를 하지 않고 현재 상태 유지 (데이터 유실 방지)
        // loadRecommendations(); 제거
    } catch (err) {
        console.error("Save failed", err);
        alert("저장에 실패했습니다: " + err.message);
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

// [Critical] 전역 함수 등록 (HTML onclick 호출 및 외부 연동용)
window.openClassSearch = openClassSearch;
window.closeClassSearchModal = closeClassSearchModal;
window.addClassToTarget = addClassToTarget;
window.saveRecommendations = saveRecommendations;
window.loadRecommendations = loadRecommendations;
window.renderSelectedClassesInContainer = renderSelectedClassesInContainer;
