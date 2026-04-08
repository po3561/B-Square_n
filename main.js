document.addEventListener('DOMContentLoaded', async () => {
    bindHomeEvents();
    ensureBsqHelperLoaded();

    const currentCategory = getCurrentHomeCategory();
    setHomeCategoryExpandedState(false);
    syncHomeCategoryBackdrop(false);
    await Promise.all([
        renderHomeCategoryMenu(currentCategory),
        initMainPage(currentCategory, true),
        initBanners(),
    ]);

    syncHomeCategoryBackdrop(getHomeCategoryExpandedState());

    window.addEventListener('bsq_sync', (event) => {
        scheduleHomeRefresh(event.detail?.type);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && getHomeCategoryExpandedState()) {
            setHomeCategoryExpandedState(false);
            syncHomeCategoryBackdrop(false);
            void renderHomeCategoryMenu(getCurrentHomeCategory());
        }
    });
});

let globalAllClasses = [];
let globalHomeCategories = [];
let globalRecommendationFolders = [];
let homeRefreshTimer = null;
let homeBannerCarousels = { main: null, bottom: null };
const HOME_CLASS_FETCH_LIMIT = 48;
const homeBookmarkMap = new Map();

function getCurrentHomeCategory() {
    return new URLSearchParams(window.location.search).get('cat') || 'all';
}

function setCurrentHomeCategory(category) {
    const nextUrl = new URL(window.location.href);
    if (!category || category === 'all') nextUrl.searchParams.delete('cat');
    else nextUrl.searchParams.set('cat', category);
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
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
    } catch {
        // no-op
    }
}

function syncHomeCategoryBackdrop(expanded) {
    document.body.classList.toggle('home-category-expanded', !!expanded);
    const id = 'homeCategoryBackdrop';
    const existing = document.getElementById(id);

    if (expanded) {
        if (existing) return;
        const backdrop = document.createElement('div');
        backdrop.id = id;
        backdrop.className = 'home-category-backdrop';
        backdrop.addEventListener('click', () => {
            setHomeCategoryExpandedState(false);
            syncHomeCategoryBackdrop(false);
            void renderHomeCategoryMenu(getCurrentHomeCategory());
        });
        document.body.appendChild(backdrop);
        return;
    }

    existing?.remove();
}

function ensureBsqHelperLoaded() {
    if (window.__BSQ_HELPER_LOADED__) return;
    if (document.querySelector('script[data-bsq-helper="1"]')) return;
    if (document.getElementById('bsqHelperLauncher') || window.__BSQ_HELPER_READY__) {
        window.__BSQ_HELPER_LOADED__ = true;
        return;
    }

    const src = new URL('kakao_quick.js?v=20260408_02', window.location.href).toString();
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.bsqHelper = '1';
    script.onload = () => { window.__BSQ_HELPER_LOADED__ = true; };
    script.onerror = () => {
        window.__BSQ_HELPER_LOADED__ = true;
        console.warn('[home] helper script load failed:', src);
    };
    document.head.appendChild(script);
}

function bindHomeEvents() {
    document.addEventListener('click', (event) => {
        const bookmarkBtn = event.target.closest('[data-action="bookmark-class"]');
        if (bookmarkBtn) {
            event.preventDefault();
            event.stopPropagation();
            void toggleHomeBookmark(bookmarkBtn.dataset.classId, bookmarkBtn);
            return;
        }

        const toggle = event.target.closest('[data-category-toggle]');
        if (toggle) {
            event.preventDefault();
            const expanded = !getHomeCategoryExpandedState();
            setHomeCategoryExpandedState(expanded);
            syncHomeCategoryBackdrop(expanded);
            void renderHomeCategoryMenu(getCurrentHomeCategory());
            return;
        }

        const categoryLink = event.target.closest('[data-cat]');
        if (!categoryLink) return;

        const categoryScope = categoryLink.closest('#homeCategoryShell, #headerCategoryMega');
        if (!categoryScope) return;

        event.preventDefault();
        const categoryName = String(categoryLink.dataset.cat || 'all');
        setHomeCategoryExpandedState(false);
        syncHomeCategoryBackdrop(false);
        const headerCategoryMenu = document.getElementById('headerCategoryMega');
        const headerCategoryButton = document.getElementById('btnHeaderCategory');
        if (headerCategoryMenu) {
            headerCategoryMenu.hidden = true;
            headerCategoryMenu.classList.remove('active');
        }
        if (headerCategoryButton) {
            headerCategoryButton.setAttribute('aria-expanded', 'false');
            headerCategoryButton.classList.remove('is-open');
        }
        setCurrentHomeCategory(categoryName);
        renderHomeClassSection(categoryName);
        void renderHomeCategoryMenu(categoryName);
        document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function getHomeSiteSettings() {
    if (window.__BSQ_SITE_SETTINGS__) return Promise.resolve(window.__BSQ_SITE_SETTINGS__);
    if (window.BSQ?.siteSettingsReady) {
        return window.BSQ.siteSettingsReady.catch(() => window.__BSQ_SITE_SETTINGS__ || null);
    }
    if (window.BSQ?.api) {
        return window.BSQ.api('/api/site-settings')
            .then((res) => (res?.success ? (res.data || null) : null))
            .catch(() => window.__BSQ_SITE_SETTINGS__ || null);
    }
    return Promise.resolve(null);
}

function normalizeBannerItem(item = {}, fallbackLabel = '배너', index = 0) {
    const imageUrl = String(
        item.mobileImage ||
        item.desktopImage ||
        item.imageUrl ||
        item.imgUrl ||
        item.image ||
        item.src ||
        ''
    ).trim();
    const linkUrl = String(item.url || item.href || item.link || item.linkUrl || '').trim();
    const alt = String(item.alt || item.title || item.label || `${fallbackLabel} ${index + 1}`).trim();
    return { imageUrl, linkUrl, alt };
}

function normalizeBannerItems(items = [], fallbackLabel = '배너') {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => normalizeBannerItem(item, fallbackLabel, index))
        .filter((item) => item.imageUrl);
}

function normalizeClassCard(item = {}) {
    const createdAt = parseDateValue(item.created_at || item.createdAt || item.created_at_ms || null);
    const rating = Number(item.rating ?? item.avg_rating ?? 0);
    const reviewCount = Number(item.reviewCount ?? item.review_count ?? 0);
    const likeCount = Number(item.likeCount ?? item.like_count ?? item.bookmark_count ?? 0);
    const price = Number(item.salePrice ?? item.sale_price ?? item.discountPrice ?? item.discount_price ?? item.price ?? 0);

    return {
        id: String(item.id || item.classId || item.class_id || item.slug || '').trim(),
        title: String(item.title || item.name || '제목 없음').trim(),
        category: String(item.category || item.categoryName || '기본').trim(),
        instructor: String(item.instructor_name || item.creator_name || item.instructor || item.teacher || 'B-Square').trim(),
        imageUrl: String(item.thumbnail || item.coverImage || item.image || item.image_url || '/assets/default-cover.svg').trim(),
        rating: Number.isFinite(rating) ? rating : 0,
        reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
        likeCount: Number.isFinite(likeCount) ? likeCount : 0,
        summary: getClassSummary(item),
        mode: formatHomeCardMode(item),
        price: Number.isFinite(price) ? price : 0,
        createdAt,
        isNew: Boolean(item.isNew) || Boolean(createdAt && (Date.now() - createdAt.getTime()) <= (3 * 24 * 60 * 60 * 1000)),
        raw: item,
    };
}

function normalizeRecommendationFolder(folder = {}) {
    const items = Array.isArray(folder.items) ? folder.items : (Array.isArray(folder.classes) ? folder.classes : []);
    return {
        id: String(folder.id || folder.folderId || folder.folder_id || '').trim(),
        title: String(folder.title || folder.name || '추천 폴더').trim(),
        description: String(folder.description || '').trim(),
        imageUrl: String(folder.coverImage || folder.cover_image || folder.thumbnail || folder.icon || '').trim(),
        linkUrl: String(folder.url || folder.href || folder.link || '').trim(),
        type: String(folder.type || 'folder').trim(),
        items: items.map((item) => normalizeClassCard(item)).filter((item) => item.id),
    };
}

function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' || typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

function teardownBannerCarousel(kind) {
    const state = homeBannerCarousels[kind];
    if (state?.timer) window.clearInterval(state.timer);
    homeBannerCarousels[kind] = null;
}

function renderBannerCarousel(kind, items, options = {}) {
    const track = document.getElementById(options.trackId);
    const dots = options.dotsId ? document.getElementById(options.dotsId) : null;
    const prev = options.prevId ? document.getElementById(options.prevId) : null;
    const next = options.nextId ? document.getElementById(options.nextId) : null;
    if (!track) return;

    teardownBannerCarousel(kind);

    const banners = normalizeBannerItems(items, options.fallbackLabel);
    const slides = banners.length ? banners : [{
        imageUrl: '',
        linkUrl: '',
        alt: `${options.fallbackLabel || '배너'}를 준비하는 중입니다.`,
    }];

    track.innerHTML = slides.map((item, index) => {
        const tag = item.linkUrl ? 'a' : 'div';
        const attrs = item.linkUrl ? ` href="${escapeHtml(item.linkUrl)}"` : '';
        return `
            <div class="${kind === 'bottom' ? 'home-bottom-banner-slide' : 'home-banner-slide'}${index === 0 ? ' is-active' : ''}" data-banner-index="${index}">
                ${item.imageUrl
                    ? `<${tag}${attrs} class="home-banner-link"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}"></${tag}>`
                    : `<div class="home-banner-empty"><div><strong>B-Square</strong><div>${escapeHtml(options.emptyMessage || '배너를 준비하는 중입니다.')}</div></div></div>`
                }
            </div>
        `;
    }).join('');

    const slideEls = Array.from(track.children);
    const state = {
        index: 0,
        slides: slideEls,
        dots: [],
        timer: null,
        intervalMs: Number(options.intervalMs || 7000),
    };

    const setActive = (index) => {
        state.index = ((index % slideEls.length) + slideEls.length) % slideEls.length;
        slideEls.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === state.index));
        state.dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === state.index));
    };

    if (dots) {
        dots.innerHTML = '';
        state.dots = slideEls.map((_, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `home-banner-dot${index === 0 ? ' is-active' : ''}`;
            button.setAttribute('aria-label', `${options.fallbackLabel || '배너'} ${index + 1}`);
            button.addEventListener('click', () => setActive(index));
            dots.appendChild(button);
            return button;
        });
        dots.hidden = slideEls.length <= 1;
    }

    if (prev) prev.onclick = () => setActive(state.index - 1);
    if (next) next.onclick = () => setActive(state.index + 1);

    function stopTimer() {
        if (state.timer) window.clearInterval(state.timer);
        state.timer = null;
    }

    function startTimer() {
        stopTimer();
        if (slideEls.length <= 1) return;
        state.timer = window.setInterval(() => setActive(state.index + 1), state.intervalMs);
    }

    homeBannerCarousels[kind] = state;
    setActive(0);
    startTimer();
}

function getCategoryMeta(name, index = 0) {
    const palette = ['#6f7cff', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6'];
    return { accent: palette[index % palette.length], icon: svgIcon('spark') };
}

function renderHomeCategoryMenu(currentCategory = 'all') {
    const nav = document.getElementById('headerCategoryMega');
    const shell = document.getElementById('homeCategoryShell');
    const categories = globalHomeCategories.length ? globalHomeCategories : [];

    if (nav) {
        nav.innerHTML = `
            <div class="mega-menu-content">
                <div class="mega-menu-text-grid">
                    <a href="#" class="mega-text-link${currentCategory === 'all' ? ' is-active' : ''}" data-cat="all">전체 클래스</a>
                    ${categories.map((item) => `
                        <a href="#" class="mega-text-link${currentCategory === item.name ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}">${escapeHtml(item.name)}</a>
                    `).join('')}
                </div>
            </div>
        `;
    }

    if (!shell) return Promise.resolve();

    const visibleItems = categories.slice(0, 12);
    const extraItems = categories.slice(12);

    shell.innerHTML = `
        <div class="home-category-grid home-category-grid-primary">
            <button type="button" class="home-category-item${currentCategory === 'all' ? ' is-active' : ''}" data-cat="all">
                <span class="home-category-icon" style="background:rgba(111,124,255,0.16); color:#6f7cff;">${svgIcon('spark')}</span>
                <span class="home-category-name">전체 클래스</span>
                <span class="home-category-count">${globalAllClasses.length || 0}</span>
            </button>
            ${visibleItems.map((item, index) => {
                const meta = getCategoryMeta(item.name, index);
                return `
                    <button type="button" class="home-category-item${currentCategory === item.name ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}">
                        ${renderHomeCategoryMedia(item, meta)}
                        <span class="home-category-name">${escapeHtml(item.name)}</span>
                        <span class="home-category-count">${Number(item.class_count || 0).toLocaleString()}</span>
                    </button>
                `;
            }).join('')}
            ${extraItems.length ? `
                <button type="button" class="home-category-toggle" data-category-toggle="1">
                    <span class="home-category-icon" style="background:rgba(111,124,255,0.16); color:#6f7cff;">${svgIcon(getHomeCategoryExpandedState() ? 'chevron-up' : 'chevron-down')}</span>
                    <span class="home-category-label">${getHomeCategoryExpandedState() ? '접기' : '카테고리 더보기'}</span>
                </button>
            ` : ''}
        </div>
        ${extraItems.length ? `
            <div class="home-category-extra"${getHomeCategoryExpandedState() ? '' : ' hidden'}>
                <div class="home-category-grid home-category-grid-extra">
                    ${extraItems.map((item, index) => {
                        const meta = getCategoryMeta(item.name, visibleItems.length + index);
                        return `
                            <button type="button" class="home-category-item${currentCategory === item.name ? ' is-active' : ''}" data-cat="${escapeHtml(item.name)}">
                                ${renderHomeCategoryMedia(item, meta)}
                                <span class="home-category-name">${escapeHtml(item.name)}</span>
                                <span class="home-category-count">${Number(item.class_count || 0).toLocaleString()}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        ` : ''}
    `;

    updateHomeHeroStats();
    return Promise.resolve();
}

function renderHomeCategoryMedia(item, meta) {
    const imageUrl = String(item?.image_url || '').trim();
    return `
        <span class="home-category-icon" style="background:${meta.accent}22; color:${meta.accent}; position:relative;">
            ${imageUrl ? `<span class="home-category-icon-image-wrap"><img class="home-category-icon-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name || '')}" loading="lazy"></span>` : meta.icon}
        </span>
    `;
}

async function initMainPage(currentCategory = 'all', forceRefresh = false) {
    if (!forceRefresh && globalAllClasses.length) {
        renderHomeClassSection(currentCategory);
        updateHomeHeroStats();
        return;
    }

    const [categoriesRes, classesRes, recommendationsRes] = await Promise.all([
        window.BSQ.api('/api/class-categories').catch(() => null),
        window.BSQ.api(`/api/classes?limit=${HOME_CLASS_FETCH_LIMIT}`).catch(() => null),
        window.BSQ.api('/api/recommendations').catch(() => null),
    ]);

    globalHomeCategories = categoriesRes?.success && Array.isArray(categoriesRes.data)
        ? categoriesRes.data.map((item) => ({
            name: String(item.name || '').trim(),
            image_url: String(item.image_url || '').trim(),
            class_count: Number(item.class_count || 0),
        })).filter((item) => item.name)
        : [];

    const classRows = classesRes?.success
        ? (Array.isArray(classesRes.data?.classes) ? classesRes.data.classes : (Array.isArray(classesRes.data) ? classesRes.data : []))
        : [];
    globalAllClasses = classRows.map((item) => normalizeClassCard(item)).filter((item) => item.id);

    const recommendationRows = recommendationsRes?.success && Array.isArray(recommendationsRes.data)
        ? recommendationsRes.data.map((item) => normalizeRecommendationFolder(item))
        : [];
    globalRecommendationFolders = recommendationRows.filter((item) => item.id);

    renderHomeClassSection(currentCategory);
    await renderHomeCategoryMenu(currentCategory);
    updateHomeHeroStats();
}

function renderHomeClassSection(currentCategory = 'all') {
    const allGrid = document.getElementById('allClassGrid');
    const popularGrid = document.getElementById('popularClassGrid');
    const recommendContainer = document.getElementById('dynamicRecommendContainer');

    const filteredClasses = currentCategory === 'all'
        ? globalAllClasses
        : globalAllClasses.filter((item) => item.category === currentCategory);

    if (allGrid) renderClassCards(filteredClasses, allGrid);

    const popularFolder = globalRecommendationFolders.find((item) => item.type === 'popular' || item.id === 'popular_main');
    const popularSource = popularFolder?.items?.length
        ? popularFolder.items.slice(0, 5)
        : [...globalAllClasses].sort((left, right) => right.likeCount - left.likeCount).slice(0, 5);

    if (popularGrid) renderClassCards(popularSource, popularGrid);
    if (recommendContainer) {
        const regularFolders = globalRecommendationFolders.filter((item) => item.type !== 'popular' && item.id !== 'popular_main');
        renderRecommendColumns(regularFolders, recommendContainer);
    }

    const title = document.getElementById('popularGroupTitle');
    if (title) title.textContent = popularFolder?.title || '인기 클래스';
}

function renderRecommendColumns(folders, container) {
    const items = Array.isArray(folders) && folders.length ? folders.slice(0, 3) : buildFallbackFolders(globalAllClasses);
    if (!items.length) {
        container.innerHTML = '<p class="empty-state">아직 추천 폴더가 없습니다.</p>';
        return;
    }

    container.innerHTML = items.map((folder) => `
        <article class="recommend-folder-card">
            <div class="recommend-folder-media" style="${folder.imageUrl ? `background-image:url('${escapeHtml(folder.imageUrl)}')` : ''}"></div>
            <div class="recommend-folder-body">
                <div>
                    <h4 class="recommend-folder-title">${escapeHtml(folder.title)}</h4>
                    ${folder.description ? `<p class="recommend-folder-copy">${escapeHtml(folder.description)}</p>` : ''}
                </div>
                <div class="recommend-folder-list">
                    ${folder.items.slice(0, 3).map((item, index) => `
                        <a href="class_view/class_view.html?id=${encodeURIComponent(item.id)}" class="recommend-item">
                            <span class="recommend-num">${index + 1}</span>
                            <div class="recommend-thumb" style="${item.imageUrl ? `background-image:url('${escapeHtml(item.imageUrl)}')` : ''}"></div>
                            <div class="recommend-info">
                                <h4>${escapeHtml(item.title)}</h4>
                                <div class="recommend-meta">
                                    <span>${escapeHtml(item.category)}</span>
                                    <span>${escapeHtml(item.mode || '온라인/오프라인')}</span>
                                    <span>${Number(item.reviewCount || 0).toLocaleString()}개 후기</span>
                                    <span class="recommend-price">${escapeHtml(formatClassPriceLabel(item))}</span>
                                </div>
                            </div>
                        </a>
                    `).join('')}
                </div>
            </div>
        </article>
    `).join('');
}

function buildFallbackFolders(classes) {
    const buckets = new Map();
    for (const item of classes) {
        const key = item.category || 'General';
        if (!buckets.has(key)) buckets.set(key, []);
        if (buckets.get(key).length < 3) buckets.get(key).push(item);
    }
    return Array.from(buckets.entries()).slice(0, 3).map(([name, items], index) => ({
        id: `fallback-${index}`,
        title: name,
        description: '현재 클래스 데이터를 기준으로 자동 구성된 추천 묶음입니다.',
        imageUrl: items[0]?.imageUrl || '',
        items,
    }));
}

function renderClassCards(classes, container) {
    if (!container) return;
    if (!Array.isArray(classes) || !classes.length) {
        container.innerHTML = '<p class="empty-state">현재 보이는 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map((item) => {
        const cachedBookmark = homeBookmarkMap.get(item.id);
        const bookmarked = !!cachedBookmark?.bookmarked;
        const likeCount = Number(cachedBookmark?.count ?? item.likeCount ?? 0);
        return `
            <article class="class-card class-card-home" data-class-id="${escapeHtml(item.id)}">
                <a class="class-card-link" href="class_view/class_view.html?id=${encodeURIComponent(item.id)}" aria-label="${escapeHtml(item.title)} 상세 보기">
                    <div class="card-thumbnail">
                        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
                        <div class="card-badges" aria-hidden="true">
                            ${item.isNew ? '<span class="card-badge card-badge-new">NEW</span>' : ''}
                        </div>
                    </div>
                    <div class="card-info">
                        <h4 class="title">${escapeHtml(item.title)}</h4>
                        <div class="card-meta">
                            <span class="card-meta-item card-meta-category">${escapeHtml(item.category)}</span>
                            <span class="card-meta-item card-meta-mode">${escapeHtml(item.mode || '온라인/오프라인')}</span>
                            <span class="card-meta-item card-meta-review">후기 ${Number(item.reviewCount || 0).toLocaleString()}</span>
                            <span class="card-meta-item card-meta-price">${escapeHtml(formatClassPriceLabel(item))}</span>
                        </div>
                    </div>
                </a>
                <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${escapeHtml(item.id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${likeCount}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '찜 해제' : '찜하기'}">${svgIcon(bookmarked ? 'heart-filled' : 'heart')}</button>
            </article>
        `;
    }).join('');
}

async function initBanners() {
    const settings = await getHomeSiteSettings();
    renderBannerCarousel('main', settings?.banners || [], {
        trackId: 'homeMainBannerTrack',
        prevId: 'homeMainBannerPrev',
        nextId: 'homeMainBannerNext',
        fallbackLabel: '메인 배너',
        emptyMessage: '메인 배너를 준비하는 중입니다.',
        intervalMs: 7000,
    });
    renderBannerCarousel('bottom', settings?.bottom_banners || [], {
        trackId: 'homeBottomBannerTrack',
        prevId: 'homeBottomBannerPrev',
        nextId: 'homeBottomBannerNext',
        dotsId: 'homeBottomBannerDots',
        fallbackLabel: '하단 배너',
        emptyMessage: '하단 배너를 준비하는 중입니다.',
        intervalMs: 7000,
    });
}

function scheduleHomeRefresh(syncType = '') {
    clearTimeout(homeRefreshTimer);
    const shouldForceRefresh = ['create', 'edit', 'delete', 'class-categories', 'recommendations'].includes(String(syncType || ''));
    homeRefreshTimer = window.setTimeout(() => {
        const activeCategory = getCurrentHomeCategory();
        void Promise.all([
            initMainPage(activeCategory, shouldForceRefresh),
            initBanners(),
        ]).catch((error) => console.warn('[home] refresh failed:', error));
    }, shouldForceRefresh ? 50 : 120);
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getClassSummary(cls) {
    const raw = stripHtml(cls.summary || cls.short_description || cls.description || cls.intro || cls.content || '');
    if (!raw) return '';
    return raw.length > 96 ? `${raw.slice(0, 93).trimEnd()}...` : raw;
}

function formatHomeCardMode(item) {
    const classType = String(item?.class_type || item?.type || item?.mode || item?.onlineOffline || '').trim().toUpperCase();
    if (classType === 'ONLINE') return '온라인';
    if (classType === 'OFFLINE') return '오프라인';
    if (classType === 'VOD') return 'VOD';
    if (classType === 'ONEDAY') return '1일';
    if (classType === 'WEEKLY') return '주간';
    if (classType === 'MONTHLY') return '월간';
    return classType ? classType.charAt(0) + classType.slice(1).toLowerCase() : '';
}

function formatClassPriceLabel(item = {}) {
    const price = Number(item?.price ?? item?.salePrice ?? item?.sale_price ?? item?.discountPrice ?? item?.discount_price ?? 0);
    if (!Number.isFinite(price) || price <= 0) return '무료';
    return `${price.toLocaleString()}원`;
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
        const recentClasses = globalAllClasses.filter((item) => item.createdAt && (now - item.createdAt.getTime()) <= recentWindow);
        freshCount.textContent = String(recentClasses.length || 0);
    }
}

function syncHomeBookmarkUi(classId, bookmarked, count) {
    const id = String(classId || '').trim();
    if (!id) return;
    const nextCount = Number(count || 0);
    homeBookmarkMap.set(id, { bookmarked: !!bookmarked, count: nextCount });
    document.querySelectorAll(`.class-card[data-class-id="${id.replace(/"/g, '\\"')}"]`).forEach((card) => {
        const button = card.querySelector('[data-action="bookmark-class"]');
        if (button) updateHomeBookmarkButton(button, id, bookmarked, nextCount);
    });
}

function updateHomeBookmarkButton(button, classId, bookmarked, count) {
    button.dataset.classId = String(classId || '');
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(Number(count || 0));
    button.classList.toggle('is-bookmarked', !!bookmarked);
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '찜 해제' : '찜하기');
    button.innerHTML = svgIcon(bookmarked ? 'heart-filled' : 'heart');
}

async function toggleHomeBookmark(classId, button) {
    const id = String(classId || '').trim();
    if (!id || !window.BSQ?.api || button?.dataset.pending === '1') return;

    const previous = homeBookmarkMap.get(id) || {
        bookmarked: button?.dataset.bookmarked === '1',
        count: Number(button?.dataset.likeCount || 0),
    };

    button.dataset.pending = '1';
    button.disabled = true;

    try {
        const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: id });
        if (!res?.success) throw new Error(res?.error || 'Bookmark request failed');
        syncHomeBookmarkUi(id, !!res.data?.bookmarked, Number(res.data?.count || 0));
    } catch (error) {
        syncHomeBookmarkUi(id, previous.bookmarked, previous.count);
        console.error('[home] bookmark toggle failed:', error);
    } finally {
        button.dataset.pending = '0';
        button.disabled = false;
    }
}

function svgIcon(kind) {
    const icons = {
        spark: '<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z"></path>',
        'chevron-down': '<path d="M6 9l6 6 6-6"></path>',
        'chevron-up': '<path d="M6 15l6-6 6 6"></path>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>',
        'heart-filled': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"></path>',
    };
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${icons[kind] || icons.spark}</svg>`;
}
