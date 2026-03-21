// main.js — D1 API 기반 리팩토링 (Curated Sections v2)
document.addEventListener('DOMContentLoaded', async () => {
    // bsq_server.js 초기화 대기
    await window.BSQ.ready;

    // 메인 페이지 데이터 로드 및 렌더링
    initMainPage();

    // [신규] 실시간 동기화 리스너
    window.addEventListener('bsq_sync', (e) => {
        console.log('[BSQ Sync] 데이터 갱신 요청 감지:', e.detail);
        initMainPage();
    });

    // 광고 배너 로드
    initBanners();

    // 카테고리 필터링 이벤트 (전체 클래스 섹션으로 이동)
    const categoryLinks = document.querySelectorAll('.category-grid a');
    categoryLinks.forEach(link => {
        if (link.dataset.cat === currentCategory) {
            document.querySelectorAll('#categoryFilter li').forEach(li => li.classList.remove('active'));
            link.parentElement.classList.add('active');
        }

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
    console.log('[Main] Initializing page from D1...');
    const popularGrid = document.getElementById('popularClassGrid');
    const allGrid = document.getElementById('allClassGrid');
    const recommendContainer = document.getElementById('dynamicRecommendContainer');
    const popularSection = document.getElementById('popularSection');
    const recommendSection = document.getElementById('recommendSection');

    if (!popularGrid || !allGrid || !recommendContainer) return;

    try {
        // 1. 전체 클래스 로드
        const allRes = await window.BSQ.api(`/api/classes?limit=100&t=${Date.now()}`);
        if (allRes.success && allRes.data) {
            globalAllClasses = allRes.data;
            renderClassCards(globalAllClasses, allGrid);
        }

        // 2. 추천/인기 섹션 로드 (운영자 설정 기반)
        const recRes = await window.BSQ.api(`/api/recommendations?t=${Date.now()}`);
        if (recRes.success && recRes.data) {
            const folders = recRes.data;
            console.log('[Main] Recommendation folders received:', folders);

            // 2-1. 인기 클래스 섹션 (type: popular)
            const popularFolder = folders.find(f => f.type === 'popular');
            if (popularFolder && popularFolder.classes && popularFolder.classes.length > 0) {
                const popularTitle = document.getElementById('popularGroupTitle');
                if (popularTitle) popularTitle.textContent = popularFolder.title || '인기 클래스';
                renderClassCards(popularFolder.classes, popularGrid);
                if (popularSection) popularSection.style.display = 'block';
            } else {
                if (popularSection) popularSection.style.display = 'none';
            }

            // 2-2. 추천 클래스 섹션 (type: regular)
            const regularFolders = folders.filter(f => f.type === 'regular');
            if (regularFolders.length > 0) {
                recommendContainer.innerHTML = ''; // 초기화
                
                regularFolders.forEach((folder) => {
                    const columnHTML = `
                        <div class="recommend-column">
                            <div class="column-header">
                                <div class="header-text">
                                    <h4>${folder.title}</h4>
                                    <p class="desc">${folder.description || ''}</p>
                                </div>
                                <a href="../class/class_list.html?cat=${folder.category || 'all'}" class="btn-more-arrow">➜</a>
                            </div>
                            <div class="mini-card-list">
                                ${folder.classes.map(cls => {
                                    const thumb = cls.thumbnail || cls.image_url || '';
                                    return `
                                        <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
                                            <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
                                            <div class="mini-info">
                                                <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${cls.title}</h5>
                                                <p class="m-meta">${cls.category || ''} | ${cls.instructor_name || ''}</p>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                    recommendContainer.insertAdjacentHTML('beforeend', columnHTML);
                });
                
                if (recommendSection) recommendSection.style.display = 'block';
            } else {
                if (recommendSection) recommendSection.style.display = 'none';
            }
        }
    } catch (err) {
        console.error("[Main] Init failed", err);
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
        const thumb = cls.thumbnail || cls.image_url || 'https://via.placeholder.com/400x250';

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${thumb}" alt="${cls.title}" style="width:100%; height:100%; object-fit:cover;">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
                <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">🤍</button>
            </div>
                <div class="card-info">
                    <span class="category">${cls.category || '기타'}</span>
                    <h4 class="title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${cls.title}</h4>
                    <span class="creator">${cls.instructor_name || '강사'}</span>
                    <div class="rating-info">
                        <span class="star">⭐</span>
                        <span class="score">${cls.avg_rating || '0.0'}</span>
                        <span class="count">(${cls.review_count || '0'})</span>
                    </div>
                    <div class="price-info">
                        ${cls.discount_rate > 0 ? `<span class="discount">${cls.discount_rate}%</span>` : ''}
                        <span class="price">${Math.round(currentPrice).toLocaleString()}원</span>
                    </div>
                </div>
        </div>
    `}).join('');
}

function renderMiniCards(classes, container) {
    if (!container) return;
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p style="font-size:0.8rem; color:#999; padding: 1rem;">준비된 추천 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const thumb = cls.thumbnail || cls.image_url || '';
        return `
        <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
            <div class="mini-info">
                <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${cls.title}</h5>
                <p class="m-meta">${cls.category || ''} | ${cls.instructor_name || cls.creator_name || ''}</p>
            </div>
        </div>
    `}).join('');
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
