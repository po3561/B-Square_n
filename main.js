// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
    const currentCategory = getCurrentHomeCategory();
    const allGrid = document.getElementById('allClassGrid');

    if (allGrid && !allGrid.children.length) {
        allGrid.innerHTML = '<p class="empty-state">클래스 정보를 불러오는 중...</p>';
    }

    await Promise.all([
        renderHomeCategoryMenu(currentCategory),
        initMainPage(currentCategory),
        initBanners(),
    ]);

    window.addEventListener('bsq_sync', (e) => {
        console.log('[BSQ Sync] Data refresh requested:', e.detail);
        scheduleHomeRefresh(e.detail?.type);
    });

    document.querySelector('.category-grid')?.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-category-toggle]');
        if (toggle) {
            event.preventDefault();
            const shell = toggle.closest('[data-home-category-shell]');
            const expanded = shell?.dataset.expanded === 'true';
            setHomeCategoryExpandedState(!expanded);
            void renderHomeCategoryMenu(getCurrentHomeCategory());
            return;
        }

        const link = event.target.closest('a[data-cat]');
        if (!link) return;
        event.preventDefault();
        const categoryName = String(link.dataset.cat || 'all');
        const allGrid = document.getElementById('allClassGrid');
        const nextUrl = new URL(window.location.href);
        if (categoryName === 'all') {
            nextUrl.searchParams.delete('cat');
        } else {
            nextUrl.searchParams.set('cat', categoryName);
        }
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

        if (categoryName === 'all') {
            if (allGrid) renderClassCards(globalAllClasses, allGrid);
            document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
            void renderHomeCategoryMenu(categoryName);
            return;
        }
        if (allGrid) {
            const filtered = globalAllClasses.filter((item) => String(item.category || '').trim() === categoryName);
            renderClassCards(filtered, allGrid);
        }
        void renderHomeCategoryMenu(categoryName);
        document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
    });
});

let globalAllClasses = [];
let globalHomeCategories = [];
let homeRefreshTimer = null;
const HOME_CLASS_FETCH_LIMIT = 60;

function getCurrentHomeCategory() {
    return new URLSearchParams(window.location.search).get('cat') || 'all';
}

function getHomeCategoryExpandedState() {
    try {
        return localStorage.getItem('bsq.home.categories.expanded') === '1';
    } catch {
        return false;
    }
}

function setHomeCategoryExpandedState(expanded) {
    try {
        localStorage.setItem('bsq.home.categories.expanded', expanded ? '1' : '0');
    } catch { }
}

const HOME_CATEGORY_ACCENTS = ['#ff5a5f', '#ffaa00', '#00c3a0', '#00a8ff', '#9c27b0'];

const HOME_CATEGORY_ICON_RULES = [
    { pattern: /(구독|이벤트|쿠폰|선물)/, icon: 'ticket', accent: '#ff5a5f' },
    { pattern: /(특강|라이브|실시간|스트리밍)/, icon: 'live', accent: '#ffaa00' },
    { pattern: /(AI|데이터|프로그래밍|개발|코딩|IT)/, icon: 'code', accent: '#00a8ff' },
    { pattern: /(창업|부업|비즈니스|성공|생산성)/, icon: 'briefcase', accent: '#9c27b0' },
    { pattern: /(드로잉|디자인|공예|사진|영상|예술)/, icon: 'pen', accent: '#ff8d4f' },
    { pattern: /(운동|스포츠|피트니스|레저)/, icon: 'dumbbell', accent: '#00c3a0' },
    { pattern: /(요리|베이킹|심야|맛집|카페)/, icon: 'pot', accent: '#ffaa00' },
    { pattern: /(소모임|동아리|커뮤니티|문화|여행)/, icon: 'heart', accent: '#ff5a5f' },
];

function resolveHomeCategoryMeta(name, index = 0) {
    const value = String(name || '').trim();
    const rule = HOME_CATEGORY_ICON_RULES.find((entry) => entry.pattern.test(value));
    return {
        icon: rule?.icon || 'spark',
        accent: rule?.accent || HOME_CATEGORY_ACCENTS[index % HOME_CATEGORY_ACCENTS.length],
    };
}

function svgIcon(kind) {
    const icons = {
        spark: '<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z"></path>',
        ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7z"></path>',
        live: '<path d="M5 8a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0z"></path>',
        pen: '<path d="M4 20l4-1 11-11-3-3L5 16 4 20z"></path>',
        dumbbell: '<path d="M5 9v6"></path><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M19 9v6"></path><path d="M8 12h8"></path>',
        pot: '<path d="M7 9h10l-1 8H8L7 9z"></path>',
        briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"></rect>',
        code: '<path d="M9 8l-4 4 4 4"></path><path d="M15 8l4 4-4 4"></path>',
        'chevron-down': '<path d="M6 9l6 6 6-6"></path>',
        'chevron-up': '<path d="M6 15l6-6 6 6"></path>',
        'chevron-left': '<path d="M15 6l-6 6 6 6"></path>',
        'chevron-right': '<path d="M9 6l6 6-6 6"></path>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>',
        bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
        'bookmark-filled': '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor"></path>',
    };
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${icons[kind] || icons.spark}</svg>`;
}

async function renderHomeCategoryMenu(currentCategory = 'all') {
    const nav = document.querySelector('.category-grid');
    if (!nav) return;

    let categories = [];
    try {
        const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
        if (res.success && Array.isArray(res.data)) {
            categories = res.data.map(c => ({
                name: c.name,
                class_count: Number(c.class_count || 0),
            }));
        }
    } catch (e) { console.warn(e); }

    if (!categories.length) {
        categories = [
            { name: '디자인', class_count: 0 },
            { name: '생산성', class_count: 0 },
            { name: '비즈니스', class_count: 0 },
            { name: '요리', class_count: 0 },
            { name: '운동', class_count: 0 },
        ];
    }

    globalHomeCategories = categories;

    const expanded = getHomeCategoryExpandedState();
    const limit = 10;
    const hasMore = categories.length > limit;
    const displayList = expanded ? categories : categories.slice(0, limit);

    nav.innerHTML = `
        <div class="home-category-shell">
            <div class="home-category-grid">
                <a href="#" class="home-category-item${currentCategory === 'all' ? ' is-active' : ''}" data-cat="all">
                    <div class="home-category-icon" style="background:#f5f5f5;">
                        ${svgIcon('spark')}
                    </div>
                    <span class="home-category-name">전체</span>
                    <span class="home-category-count">${globalAllClasses.length || 0}</span>
                </a>
                ${displayList.map((item, index) => {
                    const meta = resolveHomeCategoryMeta(item.name, index);
                    return `
                        <a href="#" class="home-category-item${currentCategory === item.name ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}">
                            <div class="home-category-icon" style="background:${meta.accent}15; color:${meta.accent};">
                                ${svgIcon(meta.icon)}
                            </div>
                            <span class="home-category-name">${escapeHtml(item.name)}</span>
                            <span class="home-category-count">${Number(item.class_count || 0)}</span>
                        </a>
                    `;
                }).join('')}
                ${hasMore ? `
                    <button type="button" class="home-category-item home-category-toggle" data-category-toggle>
                        <span class="home-category-icon" style="background:#f5f5f5;">${svgIcon(expanded ? 'chevron-up' : 'chevron-down')}</span>
                        <span class="home-category-label">${expanded ? '접기' : '더보기'}</span>
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    updateHomeHeroStats();
}

async function initMainPage(currentCategory = 'all', forceRefresh = false) {
    const allGrid = document.getElementById('allClassGrid');
    if (!allGrid) return;

    try {
        if (!forceRefresh && globalAllClasses.length > 0) {
            if (currentCategory === 'all') {
                renderClassCards(globalAllClasses, allGrid);
            } else {
                const filtered = globalAllClasses.filter(c => c.category === currentCategory);
                renderClassCards(filtered, allGrid);
            }
            return;
        }

        const res = await window.BSQ.api(`/api/classes?limit=${HOME_CLASS_FETCH_LIMIT}`, { cacheBust: false });
        if (res.success) {
            globalAllClasses = res.data?.classes || res.data || [];
            if (currentCategory === 'all') {
                renderClassCards(globalAllClasses, allGrid);
            } else {
                const filtered = globalAllClasses.filter(c => c.category === currentCategory);
                renderClassCards(filtered, allGrid);
            }
            updateHomeHeroStats();
        }
    } catch (e) { console.error(e); }
}

function renderClassCards(classes, container) {
    if (!container) return;
    if (!classes.length) {
        container.innerHTML = '<p class="empty-state">검색된 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map((cls, index) => {
        const href = `class_view/class_view.html?id=${encodeURIComponent(cls.id)}`;
        const title = escapeHtml(cls.title || '제목 없음');
        const category = escapeHtml(cls.category || '미분류');
        const instructor = escapeHtml(cls.instructor_name || cls.creator_name || '작성자 정보 없음');
        const summary = getClassSummary(cls);
        const price = Number(cls.price || 0);
        const discountRate = Number(cls.discount_rate || 0);
        const currentPrice = discountRate > 0 ? Math.max(Math.round(price * (1 - discountRate / 100)), 0) : price;
        const avgRating = cls.avg_rating ? Number(cls.avg_rating).toFixed(1) : '0.0';
        const reviewCount = Number(cls.review_count || 0);
        const likeCount = Number(cls.like_count || cls.bookmark_count || 0);
        const students = Number(cls.current_participants || cls.total_enrollments || 0);
        return `
        <article class="class-card class-card-home card-animate" style="animation-delay:${index * 0.05}s">
            <a class="class-card-link" href="${href}" aria-label="${title} 상세 보기">
                <div class="card-thumbnail">
                    <img src="${escapeHtml(cls.thumbnail || cls.image_url || '/assets/default-cover.svg')}" alt="${title}" loading="lazy">
                    <div class="card-badges">
                        ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰 가능</span>' : ''}
                        ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-topline">
                        <span class="category">${category}</span>
                        <span class="card-chip">${instructor}</span>
                    </div>
                    <h4 class="title">${title}</h4>
                    ${summary ? `<p class="card-summary">${escapeHtml(summary)}</p>` : ''}
                    <div class="meta">
                        <span class="rating">★ ${avgRating} (${reviewCount})</span>
                        <span class="likes">찜 ${likeCount}</span>
                        <span class="students">👥 ${students}</span>
                    </div>
                    <div class="price-info">
                        ${discountRate > 0 ? `<span class="original-price">${price.toLocaleString()}원</span>` : ''}
                        <span class="price">${currentPrice === 0 ? '무료' : `${currentPrice.toLocaleString()}원`}</span>
                    </div>
                </div>
            </a>
            <button type="button" class="btn-bookmark" aria-label="찜하기" onclick="event.preventDefault(); event.stopPropagation();">${svgIcon('bookmark')}</button>
        </article>
    `;
    }).join('');
}

async function initBanners() {
    // Basic banner placeholder
}

function scheduleHomeRefresh(syncType = '') {
    clearTimeout(homeRefreshTimer);
    const shouldForceRefresh = ['create', 'edit', 'delete', 'class-categories', 'recommendations'].includes(String(syncType || ''));
    homeRefreshTimer = window.setTimeout(() => {
        const activeCategory = getCurrentHomeCategory();
        void Promise.all([
            initMainPage(activeCategory, shouldForceRefresh),
            initBanners(),
            renderHomeCategoryMenu(activeCategory),
        ]).catch((error) => console.warn('[BSQ Sync] refresh failed:', error));
    }, shouldForceRefresh ? 50 : 120);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function stripHtml(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getClassSummary(cls) {
    const raw = stripHtml(cls.summary || cls.short_description || cls.description || cls.intro || cls.content || '');
    if (!raw) return '';
    return raw.length > 88 ? `${raw.slice(0, 88).trimEnd()}…` : raw;
}

function updateHomeHeroStats() {
    const classTotal = document.getElementById('homeClassTotal');
    const categoryTotal = document.getElementById('homeCategoryTotal');
    const freshCount = document.getElementById('homeFreshCount');

    if (classTotal) classTotal.textContent = String(globalAllClasses.length || 0);
    if (categoryTotal) categoryTotal.textContent = String(globalHomeCategories.length || 0);

    if (freshCount) {
        const now = Date.now();
        const recentWindow = 14 * 24 * 60 * 60 * 1000;
        const recentClasses = globalAllClasses.filter((cls) => {
            const created = cls?.created_at ? new Date(cls.created_at).getTime() : 0;
            return created && (now - created <= recentWindow);
        });
        freshCount.textContent = String(recentClasses.length || 0);
    }
}
