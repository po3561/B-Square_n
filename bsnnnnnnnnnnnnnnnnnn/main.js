// main.js — D1 API 기반 리팩토링
// Firebase/Supabase 직접 호출 → /api/* fetch 호출로 전환

document.addEventListener('DOMContentLoaded', async () => {
    // ★ bsq_server.js 초기화 완전 대기
    await window.BSQ.ready;

    // 1. 메인 페이지 클래스 목록 로드
    initClasses();

    // 2. 추천 클래스 폴더 로드
    initRecommendations();

    // 3. 광고 배너 로드
    initBanners();

    // 4. 카테고리 필터링 이벤트 연결
    const categoryLinks = document.querySelectorAll('.category-grid a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryName = link.textContent.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '').trim();
            filterClassesByCategory(categoryName);

            // 시각적 피드백
            categoryLinks.forEach(l => {
                l.style.fontWeight = '400';
                l.style.color = '';
            });
            link.style.fontWeight = '700';
            link.style.color = 'var(--accent-color)';
        });
    });

    // 5. Hamburger Drawer Menu 제어
    const btnHamburger = document.getElementById('btnHamburger');
    const btnCloseDrawer = document.getElementById('btnCloseDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawerMenu = document.getElementById('drawerMenu');

    if (btnHamburger && btnCloseDrawer && drawerOverlay && drawerMenu) {
        const toggleDrawer = (force) => {
            if (typeof force === 'boolean') {
                if (force) {
                    drawerMenu.classList.add('active');
                    drawerOverlay.classList.add('active');
                    document.body.style.overflow = 'hidden';
                } else {
                    drawerMenu.classList.remove('active');
                    drawerOverlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            } else {
                drawerMenu.classList.toggle('active');
                drawerOverlay.classList.toggle('active');
                document.body.style.overflow = drawerMenu.classList.contains('active') ? 'hidden' : '';
            }
        };

        btnHamburger.addEventListener('click', toggleDrawer);
        btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
        drawerOverlay.addEventListener('click', () => toggleDrawer(false));

        const drawerCats = document.querySelectorAll('.drawer-main-categories li:not(.divider)');
        drawerCats.forEach(li => {
            li.addEventListener('click', function () {
                drawerCats.forEach(c => c.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }
});

let globalAllClasses = [];

// ==========================================
// 클래스 목록 로딩 (D1 API)
// ==========================================
async function initClasses() {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');
    if (!cardGrid) return;

    console.log("📡 Initializing Class List from D1 API...");

    const result = await window.BSQ.api('/api/classes');

    if (result.success && result.data) {
        const allClasses = result.data;
        allClasses.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });

        globalAllClasses = allClasses;
        renderClassCards(allClasses, cardGrid);
        if (largeGrid) renderClassCards(allClasses, largeGrid);

        console.log(`✅ ${allClasses.length}개 클래스 로드 완료 (D1 API)`);
    } else {
        console.warn("⚠️ 클래스 데이터 로드 실패:", result.error);
        cardGrid.innerHTML = '<p class="empty-state">클래스를 불러오는 데 실패했습니다.</p>';
    }
}

function filterClassesByCategory(categoryName) {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');

    const filtered = globalAllClasses.filter(cls =>
        cls.category && cls.category.includes(categoryName)
    );

    renderClassCards(filtered, cardGrid);
    if (largeGrid) renderClassCards(filtered, largeGrid);

    document.querySelector('.class-lists-section')?.scrollIntoView({ behavior: 'smooth' });
}

function renderClassCards(classes, container) {
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="empty-state">등록된 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const discountRate = parseInt(cls.discount_rate) || 0;
        const originalPrice = parseInt(cls.price) || 0;
        const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;
        const avgRating = cls.avg_rating || '0.0';
        const reviewCount = cls.review_count || 0;

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${cls.image_url || cls.thumbnail || 'https://via.placeholder.com/400x250'}" alt="${cls.title}">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
                <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">🔖</button>
            </div>
            <div class="card-info">
                <span class="category">${cls.category || '미분류'}</span>
                <h4 class="title">${cls.title}</h4>
                <span class="creator">작성자: ${cls.creator_name || '크리에이터'}</span>
                <div class="meta">
                    <span class="rating">⭐ ${avgRating}</span>
                    <span class="reviews">(${reviewCount})</span>
                </div>
                <div class="price-area">
                    ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                    <span class="current-price">${Math.round(currentPrice).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `}).join('');
}

// ==========================================
// 광고 배너 로딩 (D1 API)
// ==========================================
async function initBanners() {
    const adBanner = document.querySelector('.main-ad-banner');
    const bottomBanner = document.querySelector('.banner-content');

    const result = await window.BSQ.api('/api/site-settings');
    const banners = result.success && result.data ? result.data.banners : [];

    if (!banners || !Array.isArray(banners) || banners.length === 0) {
        if (adBanner) {
            adBanner.innerHTML = `<div class="ad-content"><h2 style="color:var(--text-secondary);opacity:0.5;">광고 배너 준비 중</h2></div>`;
        }
        return;
    }

    // 상단 메인 배너 슬라이더
    if (adBanner) {
        let currentSlide = 0;
        adBanner.innerHTML = `
            <div class="banner-slider" style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:16px;">
                ${banners.map((b, i) => `
                    <div class="banner-slide" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:${i === 0 ? 1 : 0};transition:opacity 0.6s ease;cursor:${b.linkUrl ? 'pointer' : 'default'};" ${b.linkUrl ? `onclick="window.open('${b.linkUrl}','_blank')"` : ''}>
                        <img src="${b.imgUrl}" alt="배너 ${i + 1}" style="width:100%;height:100%;object-fit:cover;">
                    </div>
                `).join('')}
                ${banners.length > 1 ? `
                    <div class="banner-dots" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:5;">
                        ${banners.map((_, i) => `<span class="dot" data-idx="${i}" style="width:8px;height:8px;border-radius:50%;background:${i === 0 ? '#fff' : 'rgba(255,255,255,0.4)'};cursor:pointer;transition:background 0.3s;"></span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        // 자동 슬라이드
        if (banners.length > 1) {
            const slides = adBanner.querySelectorAll('.banner-slide');
            const dots = adBanner.querySelectorAll('.dot');

            const showSlide = (idx) => {
                slides.forEach((s, i) => s.style.opacity = i === idx ? '1' : '0');
                dots.forEach((d, i) => d.style.background = i === idx ? '#fff' : 'rgba(255,255,255,0.4)');
                currentSlide = idx;
            };

            dots.forEach(dot => {
                dot.addEventListener('click', () => showSlide(parseInt(dot.dataset.idx)));
            });

            setInterval(() => {
                showSlide((currentSlide + 1) % banners.length);
            }, 5000);
        }
    }

    // 하단 배너
    if (bottomBanner && banners.length > 0) {
        bottomBanner.innerHTML = banners.map(b => `
            <div class="bottom-banner-item" style="flex:0 0 auto;min-width:250px;cursor:${b.linkUrl ? 'pointer' : 'default'};border-radius:12px;overflow:hidden;" ${b.linkUrl ? `onclick="window.open('${b.linkUrl}','_blank')"` : ''}>
                <img src="${b.imgUrl}" alt="배너" style="width:100%;height:100%;object-fit:cover;">
            </div>
        `).join('');
        bottomBanner.style.cssText = 'display:flex;gap:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:8px 0;';
    }

    // 하단 배너 좌우 스크롤 버튼
    const btnPrev = document.querySelector('.btn-prev');
    const btnNext = document.querySelector('.btn-next');
    const bannerContent = document.querySelector('.banner-content');

    if (btnPrev && btnNext && bannerContent) {
        btnPrev.addEventListener('click', () => {
            bannerContent.scrollBy({ left: -200, behavior: 'smooth' });
        });
        btnNext.addEventListener('click', () => {
            bannerContent.scrollBy({ left: 200, behavior: 'smooth' });
        });
    }
}

// ==========================================
// 추천 클래스 폴더 (D1 API)
// ==========================================
async function initRecommendations() {
    const recommendColumns = document.querySelector('.recommend-columns');
    if (!recommendColumns) return;

    recommendColumns.style.cssText = 'display: flex !important; overflow-x: auto; gap: 20px; padding: 10px 5px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none;';
    recommendColumns.classList.add('hide-scrollbar');

    const result = await window.BSQ.api('/api/recommendations');
    const folders = result.success ? result.data : [];

    if (!folders || folders.length === 0) {
        recommendColumns.innerHTML = '<p style="color:#888; padding:20px;">공개된 추천 클래스가 없습니다.</p>';
        return;
    }

    recommendColumns.innerHTML = '';

    for (const folder of folders) {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'column';
        folderDiv.style.cssText = 'flex: 0 0 300px; scroll-snap-align: start; background: var(--card-bg); border-radius: var(--card-radius); border: 1px solid var(--border-color); padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);';

        const detailUrl = `recommend_view.html?id=${folder.id}`;

        folderDiv.innerHTML = `
            <div class="column-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <h4 style="margin:0; font-size:1.1rem; font-weight:700;">${folder.title}</h4>
                <a href="${detailUrl}" class="btn-more" style="background:#007aff; color:#fff; width:24px; height:24px; border-radius:4px; display:flex; align-items:center; justify-content:center; text-decoration:none; font-size:12px;">➔</a>
            </div>
            <ul class="column-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
            </ul>
        `;

        recommendColumns.appendChild(folderDiv);

        // 미리보기 클래스 렌더링 (API가 이미 preview_classes를 제공)
        if (folder.preview_classes && folder.preview_classes.length > 0) {
            const listUl = folderDiv.querySelector('.column-list');

            folder.preview_classes.forEach(cData => {
                const li = document.createElement('li');
                li.className = 'list-item';
                li.style.cssText = 'display:flex; align-items:center; gap:12px; cursor:pointer;';
                li.onclick = () => location.href = `../class_view/class_view.html?id=${cData.id}`;
                li.innerHTML = `
                    <div class="item-thumbnail" style="width:50px; height:35px; border-radius:4px; overflow:hidden; background:#eee;">
                        <img src="${cData.thumbnail || cData.image_url || ''}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div class="item-info">
                        <p class="title" style="margin:0; font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${cData.title}</p>
                        <p class="rating" style="margin:0; font-size:0.75rem; color:var(--text-secondary);">⭐ 4.5</p>
                    </div>
                `;
                listUl.appendChild(li);
            });
        }
    }
}
