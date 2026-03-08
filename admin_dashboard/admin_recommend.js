// admin_recommend.js - Handles Recommended Class Folders Management

document.addEventListener('DOMContentLoaded', () => {
    const tabRecommend = document.getElementById('tabRecommend');

    if (tabRecommend && tabRecommend.classList.contains('active')) {
        loadRecommendations();
    }

    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabRecommend') {
            loadRecommendations();
        }
    });

    document.getElementById('btnAddRecommendFolder')?.addEventListener('click', () => {
        addFolderUI();
    });

    document.getElementById('btnSaveRecommendations')?.addEventListener('click', () => {
        saveRecommendations();
    });

    // Modal Close
    document.getElementById('btnCloseClassModal')?.addEventListener('click', () => {
        document.getElementById('classSearchModal').style.display = 'none';
    });

    // Global Search Input
    document.getElementById('classSearchInput')?.addEventListener('input', debounce((e) => {
        searchClassesForModal(e.target.value);
    }, 500));
});

let currentTargetFolderId = null;

async function loadRecommendations() {
    const container = document.getElementById('recommendFolderList');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:3rem;">로딩 중...</div>';

    try {
        const db = firebase.database();
        const snap = await db.ref('site_design/recommendations').once('value');
        const data = snap.val() || {};

        container.innerHTML = '';
        const folders = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));

        if (folders.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:#888; border:2px dashed #eee; border-radius:12px;">등록된 추천 폴더가 없습니다.</div>';
        } else {
            folders.forEach(folder => addFolderUI(folder));
        }
    } catch (err) {
        console.error("Load recommendations failed", err);
        container.innerHTML = '<div style="color:red; text-align:center;">데이터를 불러오는 데 실패했습니다.</div>';
    }
}

function addFolderUI(folderData = null) {
    const container = document.getElementById('recommendFolderList');
    const noMsg = container.querySelector('div[style*="dashed"]');
    if (noMsg) noMsg.remove();

    const folderId = folderData?.id || 'folder_' + Date.now();
    const div = document.createElement('div');
    div.className = 'recommend-folder-item';
    div.dataset.id = folderId;
    div.style.cssText = 'background:#f9f9fb; border:1px solid #e2e8f0; border-radius:12px; padding:1.5rem; position:relative;';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <div style="display:flex; gap:10px; align-items:center; flex:1;">
                <span style="font-size:1.2rem; filter: grayscale(1);">📁</span>
                <input type="text" class="folder-title-input admin-form-input" placeholder="폴더 제목 (예: 경제 | 재테크)" value="${folderData?.title || ''}" style="margin:0; font-size:1rem; font-weight:700; width:300px;">
            </div>
            <div style="display:flex; gap:10px;">
                <button class="btn-small outline" onclick="openClassSearch('${folderId}')">+ 클래스 추가</button>
                <button class="btn-small outline" style="color:var(--admin-danger); border-color:rgba(255,59,48,0.3);" onclick="this.closest('.recommend-folder-item').remove()">정삭제</button>
            </div>
        </div>
        <div class="selected-class-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:1rem;">
            <!-- Selected Classes will appear here -->
        </div>
    `;

    container.appendChild(div);

    // If existing folder, load its classes
    if (folderData?.classIds && Array.isArray(folderData.classIds)) {
        renderSelectedClasses(folderId, folderData.classIds);
    }
}

async function renderSelectedClasses(folderId, classIds) {
    const folderEl = document.querySelector(`.recommend-folder-item[data-id="${folderId}"]`);
    const listEl = folderEl?.querySelector('.selected-class-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    // We need class details. Supabase or Firebase? 
    // implementation_plan says search/add from Supabase.
    // Let's assume class details are in Supabase or Firebase. 
    // For now, let's fetch from Firebase as admin_classes.js does.

    try {
        const db = firebase.database();
        for (const cid of classIds) {
            const snap = await db.ref(`classes/${cid}`).once('value');
            const data = snap.val();
            if (data) {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'selected-class-card';
                itemDiv.dataset.cid = cid;
                itemDiv.style.cssText = 'position:relative; background:#fff; border:1px solid #eee; border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px;';
                itemDiv.innerHTML = `
                    <div style="width:100%; height:80px; background:#f0f0f0; border-radius:4px; overflow:hidden;">
                        <img src="${data.thumbnail || ''}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div style="font-size:0.8rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${data.title}</div>
                    <button style="position:absolute; top:-5px; right:-5px; width:20px; height:20px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:12px; cursor:pointer;" onclick="this.parentElement.remove()">&times;</button>
                `;
                listEl.appendChild(itemDiv);
            }
        }
    } catch (err) {
        console.error("Fetch class details failed", err);
    }
}

function openClassSearch(folderId) {
    currentTargetFolderId = folderId;
    document.getElementById('classSearchModal').style.display = 'flex';
    document.getElementById('classSearchInput').value = '';
    document.getElementById('classSearchResultList').innerHTML = '<div style="padding:2rem; text-align:center; color:#888;">검색어를 입력하세요.</div>';
}

async function searchClassesForModal(query) {
    const resultList = document.getElementById('classSearchResultList');
    if (!query || query.trim().length === 0) {
        resultList.innerHTML = '<div style="padding:2rem; text-align:center; color:#888;">검색어를 입력하세요.</div>';
        return;
    }

    resultList.innerHTML = '<div style="padding:2rem; text-align:center; color:#888;">검색 중...</div>';

    try {
        // Fetch from Firebase (since classes are currently there based on admin_classes.js)
        const db = firebase.database();
        const snap = await db.ref('classes').once('value');
        const classes = snap.val() || {};

        const filtered = Object.entries(classes)
            .map(([id, val]) => ({ id, ...val }))
            .filter(c => c.title.toLowerCase().includes(query.toLowerCase()));

        if (filtered.length === 0) {
            resultList.innerHTML = '<div style="padding:2rem; text-align:center; color:#888;">검색 결과가 없습니다.</div>';
            return;
        }

        resultList.innerHTML = filtered.map(c => `
            <div style="padding:10px 15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; cursor:pointer; hover:background:#f8f9fa;" onclick="addClassToFolder('${c.id}', '${c.title.replace(/'/g, "\\'")}', '${c.thumbnail || ''}')">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${c.thumbnail || ''}" style="width:40px; height:26px; border-radius:4px; object-fit:cover; background:#eee;">
                    <div>
                        <div style="font-size:0.9rem; font-weight:600;">${c.title}</div>
                        <div style="font-size:0.75rem; color:#888;">${c.instructorName || '강사'}</div>
                    </div>
                </div>
                <button class="btn-small outline" style="pointer-events:none;">선택</button>
            </div>
        `).join('');
    } catch (err) {
        console.error("Search failed", err);
        resultList.innerHTML = '<div style="padding:2rem; text-align:center; color:red;">검색 중 오류 발생</div>';
    }
}

function addClassToFolder(cid, title, thumbnail) {
    if (!currentTargetFolderId) return;
    const folderEl = document.querySelector(`.recommend-folder-item[data-id="${currentTargetFolderId}"]`);
    const listEl = folderEl?.querySelector('.selected-class-list');
    if (!listEl) return;

    // Check if duplicate
    if (listEl.querySelector(`.selected-class-card[data-cid="${cid}"]`)) {
        alert("이미 추가된 클래스입니다.");
        return;
    }

    const itemDiv = document.createElement('div');
    itemDiv.className = 'selected-class-card';
    itemDiv.dataset.cid = cid;
    itemDiv.style.cssText = 'position:relative; background:#fff; border:1px solid #eee; border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px;';
    itemDiv.innerHTML = `
        <div style="width:100%; height:80px; background:#f0f0f0; border-radius:4px; overflow:hidden;">
            <img src="${thumbnail}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="font-size:0.8rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
        <button style="position:absolute; top:-5px; right:-5px; width:20px; height:20px; background:#ff3b30; color:#fff; border:none; border-radius:50%; font-size:12px; cursor:pointer;" onclick="this.parentElement.remove()">&times;</button>
    `;
    listEl.appendChild(itemDiv);

    document.getElementById('classSearchModal').style.display = 'none';
}

async function saveRecommendations() {
    const folderItems = document.querySelectorAll('.recommend-folder-item');
    const data = {};

    folderItems.forEach((item, index) => {
        const id = item.dataset.id;
        const title = item.querySelector('.folder-title-input').value.trim();
        const classIds = Array.from(item.querySelectorAll('.selected-class-card')).map(c => c.dataset.cid);

        if (title) {
            data[id] = {
                id,
                title,
                classIds,
                order: index
            };
        }
    });

    try {
        const db = firebase.database();
        await db.ref('site_design/recommendations').set(data);
        alert("추천 폴더 설정이 저장되었습니다.");
    } catch (err) {
        console.error("Save failed", err);
        alert("저장에 실패했습니다.");
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
