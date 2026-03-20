// class_list.js — 클래스 목록 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    // BSQ.ready 대기
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    // 상태 변수
    let allClasses = [];
    let currentCategory = 'all';
    let currentSort = 'newest';
    let searchQuery = '';

    // ★ D1 API에서 클래스 목록 로드
    try {
        const result = await window.BSQ.api('/api/classes?limit=200');
        if (result.success && result.data) {
            allClasses = result.data;
        }
    } catch (err) {
        console.error('[class_list.js] D1 API load error:', err);
    }

    renderClasses();

    // 카테고리 필터 이벤트
    const categoryLinks = document.querySelectorAll('#categoryFilter a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // li 요소에서 active 클래스 제어
            document.querySelectorAll('#categoryFilter li').forEach(li => li.classList.remove('active'));
            link.parentElement.classList.add('active');
            
            currentCategory = link.dataset.cat;

            const titleEl = document.querySelector('.group-title');
            if (titleEl) {
                titleEl.textContent = currentCategory === 'all' ? '전체 클래스 목록' : `${currentCategory} 클래스`;
            }
            renderClasses();
        });
    });

    // 정렬 이벤트
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderClasses();
        });
    }

    // 검색 이벤트 (디바운스)
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

    // 정렬 함수
    function sortClasses(classes) {
        const sorted = [...classes];
        switch (currentSort) {
            case 'newest':
                sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                break;
            case 'popular':
                sorted.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
                break;
            case 'price-low':
                sorted.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
                break;
            case 'price-high':
                sorted.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
                break;
        }
        return sorted;
    }

    function getEffectivePrice(cls) {
        const original = parseInt(cls.price) || 0;
        const discount = parseInt(cls.discount_rate) || 0;
        return discount > 0 ? original * (1 - discount / 100) : original;
    }

    // 클래스 렌더링
    function renderClasses() {
        const grid = document.getElementById('allClassGrid');
        if (!grid) return;

        let filteredClasses = allClasses;
        if (currentCategory !== 'all') {
            filteredClasses = filteredClasses.filter(c => c.category === currentCategory);
        }

        if (searchQuery) {
            filteredClasses = filteredClasses.filter(c => {
                const title = (c.title || '').toLowerCase();
                const creator = (c.creator_name || '').toLowerCase();
                const category = (c.category || '').toLowerCase();
                return title.includes(searchQuery) || creator.includes(searchQuery) || category.includes(searchQuery);
            });
        }

        filteredClasses = sortClasses(filteredClasses);

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

        grid.innerHTML = filteredClasses.map((cls, idx) => {
            const createdTime = cls.created_at ? new Date(cls.created_at).getTime() : 0;
            const isNew = createdTime && (now - createdTime < FORTY_EIGHT_HOURS);
            const newBadge = isNew ? `<div class="badge-new">NEW</div>` : '';
            const discountRate = parseInt(cls.discount_rate) || 0;
            const originalPrice = parseInt(cls.price) || 0;
            const currentPrice = getEffectivePrice(cls);
            const imageUrl = cls.image_url || 'https://via.placeholder.com/400x250';
            const avgRating = cls.avg_rating ? parseFloat(cls.avg_rating).toFixed(1) : null;
            const ratingText = avgRating ? `⭐ ${avgRating}(${cls.review_count})` : '👍 만족';

            return `
                <div class="class-card card-animate" style="animation-delay: ${idx * 0.05}s"
                     onclick="location.href='../class_view/class_view.html?id=${cls.id}'" role="button" tabindex="0">
                    ${newBadge}
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
                        <div class="meta"><span class="rating">${ratingText}</span></div>
                        <div class="price-area">
                            ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                            <span class="current-price">${currentPrice === 0 ? '무료' : currentPrice.toLocaleString() + '원'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
});
