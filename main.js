// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
    const currentCategory = getCurrentHomeCategory();

    await Promise.all([
        renderHomeCategoryMenu(currentCategory),
        initMainPage(currentCategory),
        initBanners(),
    ]);

    window.addEventListener('bsq_sync', (e) => {
        console.log('[BSQ Sync] Data refresh requested:', e.detail);
        const activeCategory = getCurrentHomeCategory();
        void Promise.all([
            initMainPage(activeCategory),
            initBanners(),
            renderHomeCategoryMenu(activeCategory),
        ]).catch((error) => console.warn('[BSQ Sync] refresh failed:', error));
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
        filterAllClassesByCategory(categoryName);
        void renderHomeCategoryMenu(categoryName);
        document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
    });
});

let globalAllClasses = [];

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
            categories = res.data.map(c => ({ name: c.name }));
        }
    } catch (e) { console.warn(e); }

    if (!categories.length) {
        categories = [{ name: '디자인' }, { name: '생산성' }, { name: '비즈니스' }, { name: '요리' }, { name: '운동' }];
    }

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
                </a>
                ${displayList.map((item, index) => {
                    const meta = resolveHomeCategoryMeta(item.name, index);
                    return `
                        <a href="#" class="home-category-item${currentCategory === item.name ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}">
                            <div class="home-category-icon" style="background:${meta.accent}15; color:${meta.accent};">
                                ${svgIcon(meta.icon)}
                            </div>
                            <span class="home-category-name">${escapeHtml(item.name)}</span>
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
}

async function initMainPage(currentCategory = 'all') {
    const allGrid = document.getElementById('allClassGrid');
    if (!allGrid) return;

    try {
        const res = await window.BSQ.api('/api/classes?limit=100', { cacheBust: false });
        if (res.success) {
            globalAllClasses = res.data?.classes || res.data || [];
            if (currentCategory === 'all') {
                renderClassCards(globalAllClasses, allGrid);
            } else {
                const filtered = globalAllClasses.filter(c => c.category === currentCategory);
                renderClassCards(filtered, allGrid);
            }
        }
    } catch (e) { console.error(e); }
}

function renderClassCards(classes, container) {
    if (!container) return;
    if (!classes.length) {
        container.innerHTML = '<p class="empty-state">검색된 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => `
        <div class="class-card" onclick="location.href='class_view/class_view.html?id=${cls.id}'">
            <div class="card-thumbnail">
                <img src="${cls.thumbnail || cls.image_url || ''}" loading="lazy">
                <button class="btn-bookmark" onclick="event.stopPropagation()">${svgIcon('bookmark')}</button>
            </div>
            <div class="card-info">
                <span class="category">${cls.category}</span>
                <h4 class="title">${cls.title}</h4>
                <div class="price-info">
                    <span class="price">${Number(cls.price).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function initBanners() {
    // Basic banner placeholder
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
