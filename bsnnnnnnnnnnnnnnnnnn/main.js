// main.js — D1 API 기반 리팩토링 (Curated Sections v2)
document.addEventListener('DOMContentLoaded', async () => {
    // bsq_server.js 초기화 대기
    await window.BSQ.ready;

    // 메인 페이지 데이터 로드 및 렌더링
    initMainPage();

    // 광고 배너 로드
    initBanners();

    // 카테고리 필터링 이벤트 (전체 클래스 섹션으로 이동)
    const categoryLinks = document.querySelectorAll('.category-grid a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryName = link.textContent.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '').trim();
            filterAllClassesByCategory(categoryName);

            // 시각적 피드백
            categoryLinks.forEach(l => {
                l.classList.remove('active');
                l.parentElement.classList.remove('active');
            });
            link.classList.add('active');
            
            document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // 드로어 메뉴 제어
    initDrawer();
});

let globalAllClasses = [];

async function initMainPage() {
    const popularGrid = document.getElementById('popularClassGrid');
    const allGrid = document.getElementById('allClassGrid');
    if (!popularGrid || !allGrid) return;

    const result = await window.BSQ.api('/api/classes?limit=100');
    if (result.success && result.data) {
        globalAllClasses = result.data;
        
        // 1. 지금 인기 있는 (상위 10개)
        const popularOnes = globalAllClasses.slice(0, 10);
        renderClassCards(popularOnes, popularGrid);

        // 2. 추천 클래스 (3개 컬럼 미니 카드)
        const rec1 = globalAllClasses.slice(10, 13);
        const rec2 = globalAllClasses.slice(13, 16);
        const rec3 = globalAllClasses.slice(16, 19);
        renderMiniCards(rec1, document.getElementById('recommendGrid-1'));
        renderMiniCards(rec2, document.getElementById('recommendGrid-2'));
        renderMiniCards(rec3, document.getElementById('recommendGrid-3'));

        // 3. 전체 클래스 살펴보기
        renderClassCards(globalAllClasses, allGrid);
    }
}

function filterAllClassesByCategory(categoryName) {
    const allGrid = document.getElementById('allClassGrid');
    const filtered = globalAllClasses.filter(cls =>
        cls.category && cls.category.includes(categoryName)
    );
    renderClassCards(filtered, allGrid);
}

function renderClassCards(classes, container) {
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="empty-state">해당하는 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const discountRate = parseInt(cls.discount_rate) || 0;
        const originalPrice = parseInt(cls.price) || 0;
        const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;
        const avgRating = cls.avg_rating || '5.0';
        const reviewCount = cls.review_count || 0;

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${cls.image_url || 'https://via.placeholder.com/400x250'}" alt="${cls.title}">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
                <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">🤍</button>
            </div>
            <div class="card-info">
                <span class="category">${cls.category || '미분류'}</span>
                <h4 class="title">${cls.title}</h4>
                <span class="creator">${cls.creator_name || '크리에이터'}</span>
                <div class="meta">
                    <span class="rating">⭐ ${avgRating}(${reviewCount})</span>
                </div>
                <div class="price-area">
                    ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                    <span class="current-price">${Math.round(currentPrice).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `}).join('');
}

function renderMiniCards(classes, container) {
    if (!container) return;
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p style="font-size:0.8rem; color:#999;">준비된 추천 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => `
        <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="mini-thumb" style="background-image:url('${cls.image_url}'); background-size:cover; background-position:center;"></div>
            <div class="mini-info">
                <h5 class="m-title">${cls.title}</h5>
                <p class="m-meta">${cls.category} | ${cls.creator_name}</p>
            </div>
        </div>
    `).join('');
}

async function initBanners() {
    const adBanner = document.querySelector('.main-ad-banner');
    const bottomBanner = document.querySelector('.banner-content');

    const result = await window.BSQ.api('/api/site-settings');
    const banners = result.success && result.data ? result.data.banners : [];

    if (!banners || banners.length === 0) return;

    if (adBanner) {
        let currentSlide = 0;
        adBanner.innerHTML = `
            <div class="banner-slider" style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:24px;">
                ${banners.map((b, i) => `
                    <div class="banner-slide" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:${i === 0 ? 1 : 0};transition:opacity 0.6s ease;cursor:pointer;" onclick="if('${b.linkUrl}')window.open('${b.linkUrl}','_blank')">
                        <img src="${b.imgUrl}" alt="Banner" style="width:100%;height:100%;object-fit:cover;">
                    </div>
                `).join('')}
            </div>
        `;
        if (banners.length > 1) {
            setInterval(() => {
                const slides = adBanner.querySelectorAll('.banner-slide');
                slides[currentSlide].style.opacity = '0';
                currentSlide = (currentSlide + 1) % banners.length;
                slides[currentSlide].style.opacity = '1';
            }, 5000);
        }
    }
}

function initDrawer() {
    const btnHamburger = document.getElementById('btnHamburger');
    const btnCloseDrawer = document.getElementById('btnCloseDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawerMenu = document.getElementById('drawerMenu');

    if (btnHamburger && btnCloseDrawer && drawerOverlay && drawerMenu) {
        const toggleDrawer = (force) => {
            const active = typeof force === 'boolean' ? force : !drawerMenu.classList.contains('active');
            drawerMenu.classList.toggle('active', active);
            drawerOverlay.classList.toggle('active', active);
            document.body.style.overflow = active ? 'hidden' : '';
        };
        btnHamburger.addEventListener('click', toggleDrawer);
        btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
        drawerOverlay.addEventListener('click', () => toggleDrawer(false));
    }
}
