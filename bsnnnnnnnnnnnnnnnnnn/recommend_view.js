// recommend_view.js - Detailed View for Recommended Folders

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get('id');

    if (!folderId) {
        alert("잘못된 접근입니다.");
        location.href = 'index.html';
        return;
    }

    await window.BSQ.ready;
    loadFolderData(folderId);
    setupCategoryFilter();
});

let currentFolderClasses = [];

async function loadFolderData(folderId) {
    const titleEl = document.getElementById('folderTitle');
    const gridEl = document.getElementById('folderClassGrid');

    if (!window.BSQ || !window.BSQ.api) {
        console.error("BSQ API not ready");
        return;
    }

    try {
        const res = await window.BSQ.api('/api/recommendations');
        if (!res.success || !res.data) {
            titleEl.textContent = "데이터를 불러오는 데 실패했습니다.";
            return;
        }

        const folders = res.data;
        const folder = folders.find(f => String(f.id) === String(folderId));

        if (!folder) {
            titleEl.textContent = "폴더를 찾을 수 없습니다.";
            gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 5rem; color:#888;">준비된 클래스가 없습니다.</div>';
            return;
        }

        titleEl.textContent = folder.title;
        // 설명이 있으면 추가로 보여줄 수 있음 (HTML에 엘리먼트가 있다면)
        const descEl = document.getElementById('folderDesc');
        if (descEl) descEl.textContent = folder.description || '';

        gridEl.innerHTML = '';
        if (folder.classes && Array.isArray(folder.classes) && folder.classes.length > 0) {
            currentFolderClasses = folder.classes;
            renderClasses(folder.classes);
        } else {
            gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 5rem; color:#888;">이 폴더에 담긴 클래스가 없습니다.</div>';
        }
    } catch (err) {
        console.error("Load folder data failed", err);
        titleEl.textContent = "오류가 발생했습니다.";
    }
}

function renderClasses(classes) {
    const container = document.getElementById('folderClassGrid');
    if (classes.length === 0) {
        container.innerHTML = '<p class="empty-state" style="grid-column:1/-1; text-align:center; padding:5rem; color:#888;">해당하는 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const discountRate = parseInt(cls.discount_rate) || 0;
        const originalPrice = parseInt(cls.price) || 0;
        const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${cls.thumbnail || ''}" alt="${cls.title}">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
            </div>
            <div class="card-info">
                <span class="category">${cls.category || '미분류'}</span>
                <h4 class="title">${cls.title}</h4>
                <div class="meta">
                    <span class="rating">⭐ ${cls.rating || '4.5'}</span>
                </div>
                <div class="price-area">
                    <span class="current-price">${Math.round(currentPrice).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `}).join('');
}

function setupCategoryFilter() {
    const links = document.querySelectorAll('#categoryList a');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = link.dataset.cat;

            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            if (cat === 'all') {
                renderClasses(currentFolderClasses);
            } else {
                const filtered = currentFolderClasses.filter(c => c.category && c.category.includes(cat));
                renderClasses(filtered);
            }
        });
    });
}
