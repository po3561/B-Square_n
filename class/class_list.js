// class_list.js — 클래스 목록 로딩, 카테고리 필터
// header.js가 Supabase/Firebase 초기화 및 유저 메뉴를 처리함

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Supabase/Firebase 가져오기 (header.js에서 이미 초기화됨)
    const waitForInit = () => new Promise((resolve) => {
        const check = () => {
            if (window.supabaseClient && (typeof firebase !== 'undefined' && firebase.apps.length > 0)) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
        // 3초 타임아웃
        setTimeout(resolve, 3000);
    });

    await waitForInit();

    const supabaseClient = window.supabaseClient;
    const db = window.firebaseDB || (typeof firebase !== 'undefined' ? firebase.database() : null);

    if (!db) {
        console.warn('[class_list.js] Firebase DB not available');
        return;
    }

    // 2. 클래스 전체 목록 불러오기
    let allClasses = [];
    let currentCategory = 'all';

    try {
        const snapshot = await db.ref('classes').once('value');
        const data = snapshot.val();
        if (data) {
            allClasses = Object.entries(data).map(([id, val]) => ({ id, ...val }));
            allClasses.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }
    } catch (err) {
        console.error('[class_list.js] Firebase load error:', err);
    }

    renderClasses();

    // 3. 필터 클릭 이벤트
    const categoryLinks = document.querySelectorAll('#categoryFilter a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            categoryLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            currentCategory = link.dataset.cat;
            renderClasses();
        });
    });

    // 4. 클래스 렌더링
    function renderClasses() {
        const grid = document.getElementById('allClassGrid');
        if (!grid) return;

        let filteredClasses = allClasses;
        if (currentCategory !== 'all') {
            filteredClasses = allClasses.filter(c => c.category === currentCategory);
        }

        const countEl = document.getElementById('totalClassCount');
        if (countEl) countEl.textContent = `총 ${filteredClasses.length}개`;

        if (filteredClasses.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem; color:#888;">해당 카테고리에 등록된 클래스가 없습니다.</div>`;
            return;
        }

        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        const cardsHtml = filteredClasses.map((cls, idx) => {
            const isNew = cls.created_at && (now - cls.created_at < FORTY_EIGHT_HOURS);
            const newBadgeHtml = isNew ? `<div class="badge-new">NEW</div>` : '';
            const discountRate = parseInt(cls.discount_rate) || 0;
            const originalPrice = parseInt(cls.price) || 0;
            const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;
            const imageUrl = cls.image_url || 'https://via.placeholder.com/400x250';
            const satisfaction = Math.floor(Math.random() * 30 + 60);

            return `
                <div class="class-card card-animate" style="animation-delay: ${idx * 0.05}s"
                     onclick="location.href='../class_view/class_view.html?id=${cls.id}'" role="button" tabindex="0">
                    ${newBadgeHtml}
                    <div class="card-thumbnail">
                        <img src="${imageUrl}" alt="${cls.title || '클래스'}" loading="lazy">
                        <button class="btn-bookmark" aria-label="찜하기" onclick="event.stopPropagation()">🤍</button>
                        <div class="card-badges">
                            ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                            ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                        </div>
                    </div>
                    <div class="card-info">
                        <span class="category">${cls.category || '미분류'}</span>
                        <h4 class="title">${cls.title || '제목 없음'}</h4>
                        <span class="creator">${cls.creator_name || '크리에이터'}</span>
                        <div class="meta">
                            <span class="rating">👍 ${satisfaction}% 만족도</span>
                        </div>
                        <div class="price-area">
                            ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                            <span class="current-price">${currentPrice.toLocaleString()}원</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHtml;
    }
});
