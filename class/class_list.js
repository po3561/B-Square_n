// class_list.js — 클래스 목록 로딩, 카테고리 필터, 정렬, 검색
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
        setTimeout(resolve, 3000);
    });

    await waitForInit();

    const supabaseClient = window.supabaseClient;
    const db = window.firebaseDB || (typeof firebase !== 'undefined' ? firebase.database() : null);

    if (!db) {
        console.warn('[class_list.js] Firebase DB not available');
        return;
    }

    // 2. 상태 변수
    let allClasses = [];
    let currentCategory = 'all';
    let currentSort = 'newest';
    let searchQuery = '';

    // 3. Firebase에서 클래스 목록 로드
    try {
        const snapshot = await db.ref('classes').once('value');
        const data = snapshot.val();
        if (data) {
            allClasses = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        }
    } catch (err) {
        console.error('[class_list.js] Firebase load error:', err);
    }

    renderClasses();

    // 4. 카테고리 필터 이벤트
    const categoryLinks = document.querySelectorAll('#categoryFilter a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            categoryLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            currentCategory = link.dataset.cat;

            // 카테고리 변경 시 타이틀도 업데이트
            const titleEl = document.querySelector('.group-title');
            if (titleEl) {
                titleEl.textContent = currentCategory === 'all' ? '전체 클래스 목록' : `${currentCategory} 클래스`;
            }

            renderClasses();
        });
    });

    // 5. 정렬 이벤트
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderClasses();
        });
    }

    // 6. 검색 이벤트 (디바운스 적용)
    const searchInput = document.getElementById('classSearchInput');
    let searchTimer = null;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchQuery = e.target.value.trim().toLowerCase();
                renderClasses();
            }, 300);
        });
    }

    // 7. 정렬 함수
    function sortClasses(classes) {
        const sorted = [...classes];
        switch (currentSort) {
            case 'newest':
                sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                break;
            case 'popular':
                sorted.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
                break;
            case 'price-low':
                sorted.sort((a, b) => {
                    const priceA = getEffectivePrice(a);
                    const priceB = getEffectivePrice(b);
                    return priceA - priceB;
                });
                break;
            case 'price-high':
                sorted.sort((a, b) => {
                    const priceA = getEffectivePrice(a);
                    const priceB = getEffectivePrice(b);
                    return priceB - priceA;
                });
                break;
        }
        return sorted;
    }

    function getEffectivePrice(cls) {
        const original = parseInt(cls.price) || 0;
        const discount = parseInt(cls.discount_rate) || 0;
        return discount > 0 ? original * (1 - discount / 100) : original;
    }

    // 8. 클래스 렌더링
    function renderClasses() {
        const grid = document.getElementById('allClassGrid');
        if (!grid) return;

        // 카테고리 필터
        let filteredClasses = allClasses;
        if (currentCategory !== 'all') {
            filteredClasses = filteredClasses.filter(c => c.category === currentCategory);
        }

        // 검색 필터
        if (searchQuery) {
            filteredClasses = filteredClasses.filter(c => {
                const title = (c.title || '').toLowerCase();
                const creator = (c.creator_name || '').toLowerCase();
                const category = (c.category || '').toLowerCase();
                return title.includes(searchQuery) || creator.includes(searchQuery) || category.includes(searchQuery);
            });
        }

        // 정렬
        filteredClasses = sortClasses(filteredClasses);

        // 카운트 표시
        const countEl = document.getElementById('totalClassCount');
        if (countEl) countEl.textContent = `총 ${filteredClasses.length}개`;

        if (filteredClasses.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem; color:#888;">
                ${searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : '해당 카테고리에 등록된 클래스가 없습니다.'}
            </div>`;
            return;
        }

        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        const cardsHtml = filteredClasses.map((cls, idx) => {
            const isNew = cls.created_at && (now - cls.created_at < FORTY_EIGHT_HOURS);
            const newBadgeHtml = isNew ? `<div class="badge-new">NEW</div>` : '';
            const discountRate = parseInt(cls.discount_rate) || 0;
            const originalPrice = parseInt(cls.price) || 0;
            const currentPrice = getEffectivePrice(cls);
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
                            <span class="current-price">${currentPrice === 0 ? '무료' : currentPrice.toLocaleString() + '원'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHtml;
    }
});
