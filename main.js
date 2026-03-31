// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
    const currentCategory = getCurrentHomeCategory();
    const allGrid = document.getElementById('allClassGrid');

    syncHomeCuratedVisibility();

    if (allGrid && !allGrid.children.length) {
        allGrid.innerHTML = '<p class="empty-state">클래스 정보를 불러오는 중...</p>';
    }

    await Promise.all([
        renderHomeCategoryMenu(currentCategory),
        initMainPage(currentCategory),
        initBanners(),
    ]);

    syncHomeCuratedVisibility();

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
let homeBannerCarousels = {
    main: null,
    bottom: null,
};
const HOME_CLASS_FETCH_LIMIT = 48;

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

function getHomeSiteSettings() {
    if (window.__BSQ_SITE_SETTINGS__) return Promise.resolve(window.__BSQ_SITE_SETTINGS__);
    if (window.BSQ?.siteSettingsReady) {
        return window.BSQ.siteSettingsReady.catch(() => window.__BSQ_SITE_SETTINGS__ || null);
    }
    if (window.BSQ?.api) {
        return window.BSQ.api('/api/site-settings', { cacheBust: false })
            .then((res) => (res?.success ? (res.data || null) : null))
            .catch(() => window.__BSQ_SITE_SETTINGS__ || null);
    }
    return Promise.resolve(null);
}

function normalizeBannerItems(items = [], fallbackLabel = '배너') {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const imgUrl = String(item?.imgUrl || item?.image || item?.src || '').trim();
            const linkUrl = String(item?.linkUrl || item?.link || '').trim();
            const alt = String(item?.alt || item?.title || item?.label || `${fallbackLabel} ${index + 1}`).trim();
            return { imgUrl, linkUrl, alt };
        })
        .filter((item) => item.imgUrl);
}

function teardownBannerCarousel(kind) {
    const state = homeBannerCarousels[kind];
    if (state?.timer) {
        window.clearInterval(state.timer);
    }
    homeBannerCarousels[kind] = null;
}

function stopBannerTimer(state) {
    if (state?.timer) {
        window.clearInterval(state.timer);
        state.timer = null;
    }
}

function formatBannerIntervalLabel(ms) {
    const seconds = Math.max(1, Math.round(Number(ms || 0) / 1000));
    return `${seconds}s`;
}

function updateBannerControlState(state) {
    if (!state) return;

    const total = state.slides?.length || 0;
    if (state.counterEl) {
        state.counterEl.textContent = total > 0 ? `${state.index + 1} / ${total}` : '0 / 0';
    }

    if (state.playEl) {
        const playing = !!state.isPlaying && total > 1;
        state.playEl.textContent = playing ? '❚❚' : '▶';
        state.playEl.setAttribute('aria-pressed', playing ? 'true' : 'false');
        state.playEl.setAttribute('aria-label', playing ? '자동 넘김 일시정지' : '자동 넘김 재생');
        state.playEl.disabled = total <= 1;
    }

    if (state.intervalEl) {
        const label = formatBannerIntervalLabel(state.intervalMs);
        state.intervalEl.textContent = label;
        state.intervalEl.setAttribute('aria-label', `자동 넘김 간격 ${label}`);
        state.intervalEl.disabled = total <= 1;
    }

    if (state.prevEl) {
        state.prevEl.hidden = total <= 1;
    }
    if (state.nextEl) {
        state.nextEl.hidden = total <= 1;
    }
}

function startBannerTimer(state) {
    if (!state || !state.canAutoplay || !state.isPlaying || state.hoverPaused) return;
    stopBannerTimer(state);
    state.timer = window.setInterval(() => {
        setBannerSlideState(state, state.index + 1, { restartTimer: false });
    }, state.intervalMs);
}

function applyBannerTimer(state) {
    if (!state) return;
    if (state.canAutoplay && state.isPlaying && !state.hoverPaused) {
        startBannerTimer(state);
        return;
    }
    stopBannerTimer(state);
}

function setBannerPlaying(state, playing) {
    if (!state) return;
    state.isPlaying = !!playing;
    updateBannerControlState(state);
    applyBannerTimer(state);
}

function cycleBannerInterval(state) {
    if (!state || !Array.isArray(state.intervalOptions) || !state.intervalOptions.length) return;
    state.intervalIndex = (state.intervalIndex + 1) % state.intervalOptions.length;
    state.intervalMs = state.intervalOptions[state.intervalIndex];
    updateBannerControlState(state);
    applyBannerTimer(state);
}

function setBannerSlideState(state, nextIndex, options = {}) {
    if (!state || !state.slides || !state.slides.length) return;
    const total = state.slides.length;
    const safeIndex = ((nextIndex % total) + total) % total;
    state.index = safeIndex;

    state.slides.forEach((slide, index) => {
        const active = index === safeIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        slide.tabIndex = active ? 0 : -1;
    });

    state.dots?.forEach((dot, index) => {
        const active = index === safeIndex;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    updateBannerControlState(state);
    if (options.restartTimer !== false) {
        applyBannerTimer(state);
    }
}

function renderBannerCarousel(kind, items, options = {}) {
    const track = document.getElementById(options.trackId);
    const dots = document.getElementById(options.dotsId);
    const prev = document.getElementById(options.prevId);
    const next = document.getElementById(options.nextId);
    const counter = document.getElementById(options.counterId);
    const play = document.getElementById(options.playId);
    const interval = document.getElementById(options.intervalId);
    if (!track) return;

    teardownBannerCarousel(kind);

    const banners = normalizeBannerItems(items, options.fallbackLabel);
    const slides = banners.length ? banners : (
        options.showEmptyState === false
            ? []
            : [{
                imgUrl: '',
                linkUrl: '',
                alt: options.emptyAlt || `${options.fallbackLabel} 준비 중`,
            }]
    );

    track.innerHTML = slides.map((item, index) => {
        const slideClass = `home-banner-slide${index === 0 ? ' is-active' : ''}`;
        const content = item.imgUrl
            ? `<img src="${escapeHtml(item.imgUrl)}" alt="${escapeHtml(item.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">`
            : `<div class="home-banner-empty">
                    <span class="home-banner-brand">B-Square</span>
                    <span class="home-banner-note">${escapeHtml(options.emptyMessage || `${options.fallbackLabel}를 준비 중입니다.`)}</span>
               </div>`;
        if (item.linkUrl) {
            return `
                <div class="${slideClass}" data-banner-index="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
                    <a href="${escapeHtml(item.linkUrl)}" aria-label="${escapeHtml(item.alt)}">
                        ${content}
                    </a>
                </div>
            `;
        }
        return `
            <div class="${slideClass}" data-banner-index="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
                <div>
                    ${content}
                </div>
            </div>
        `;
    }).join('');

    const slideEls = Array.from(track.querySelectorAll('.home-banner-slide'));
    const dotButtons = dots
        ? slides.map((_, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `home-banner-dot${index === 0 ? ' is-active' : ''}`;
            button.setAttribute('aria-label', `${options.fallbackLabel} ${index + 1}`);
            button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            button.addEventListener('click', () => {
                const state = homeBannerCarousels[kind];
                setBannerSlideState(state, index);
            });
            return button;
        })
        : [];

    if (dots) {
        dots.replaceChildren(...dotButtons);
        dots.hidden = slideEls.length <= 1;
    }

    const reduceMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const state = {
        slides: slideEls,
        dots: dotButtons,
        index: 0,
        timer: null,
        counterEl: counter || null,
        playEl: play || null,
        intervalEl: interval || null,
        prevEl: prev || null,
        nextEl: next || null,
        hoverPaused: false,
        canAutoplay: slideEls.length > 1 && !reduceMotion,
        isPlaying: slideEls.length > 1 && !reduceMotion,
        intervalOptions: Array.isArray(options.intervalOptions) && options.intervalOptions.length
            ? options.intervalOptions.map((value) => Math.max(1000, Number(value) || 0)).filter(Boolean)
            : [4000, 6000, 8000],
        intervalIndex: 0,
        intervalMs: Math.max(1000, Number(options.intervalMs || 6000) || 6000),
    };

    const intervalIndex = state.intervalOptions.findIndex((value) => value === state.intervalMs);
    state.intervalIndex = intervalIndex >= 0 ? intervalIndex : 0;
    state.intervalMs = state.intervalOptions[state.intervalIndex] || state.intervalMs;

    if (prev) {
        prev.hidden = slideEls.length <= 1;
        prev.onclick = () => setBannerSlideState(state, state.index - 1);
    }
    if (next) {
        next.hidden = slideEls.length <= 1;
        next.onclick = () => setBannerSlideState(state, state.index + 1);
    }
    if (play) {
        play.hidden = slideEls.length <= 1;
        play.onclick = () => setBannerPlaying(state, !state.isPlaying);
    }
    if (interval) {
        interval.hidden = slideEls.length <= 1;
        interval.onclick = () => cycleBannerInterval(state);
    }

    if (track.parentElement) {
        track.parentElement.dataset.bannerCount = String(slideEls.length);
        track.parentElement.dataset.bannerKind = kind;
    }

    if (slideEls.length > 1) {
        if (track.parentElement) {
            track.parentElement.onpointerenter = () => {
                state.hoverPaused = true;
                applyBannerTimer(state);
            };
            track.parentElement.onpointerleave = () => {
                state.hoverPaused = false;
                applyBannerTimer(state);
            };
        }
    }

    homeBannerCarousels[kind] = state;
    setBannerSlideState(state, 0, { restartTimer: false });
    applyBannerTimer(state);
}

function syncHomeCuratedVisibility() {
    const wrapper = document.querySelector('.curated-sections-dark');
    if (!wrapper) return;

    const sections = [document.getElementById('popularSection'), document.getElementById('recommendSection')].filter(Boolean);
    const hasVisibleSection = sections.some((section) => {
        const style = window.getComputedStyle(section);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });

    wrapper.hidden = !hasVisibleSection;
    wrapper.classList.toggle('is-empty', !hasVisibleSection);
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

    nav.innerHTML = `
        <div class="home-category-shell" data-home-category-shell data-expanded="true">
            <div class="home-category-grid home-category-grid-primary">
                <a href="#" class="home-category-item${currentCategory === 'all' ? ' is-active' : ''}" data-cat="all">
                    <div class="home-category-icon" style="background:#f5f5f5;">
                        ${svgIcon('spark')}
                    </div>
                    <span class="home-category-name">전체</span>
                    <span class="home-category-count">${globalAllClasses.length || 0}</span>
                </a>
                ${categories.map((item, index) => {
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
    const settings = await getHomeSiteSettings();
    const mainBanners = normalizeBannerItems(settings?.banners || [], '메인 배너');
    const bottomBanners = normalizeBannerItems(settings?.bottom_banners || [], '하단 배너');

    // 메인 배너: 자동 넘김 + 카운터 + 재생/일시정지 + 간격 조절
    renderBannerCarousel('main', mainBanners, {
        trackId: 'homeMainBannerTrack',
        prevId: 'homeMainBannerPrev',
        playId: 'homeMainBannerPlay',
        counterId: 'homeMainBannerCounter',
        intervalId: 'homeMainBannerInterval',
        nextId: 'homeMainBannerNext',
        fallbackLabel: '메인 배너',
        emptyMessage: '메인 배너를 준비 중입니다.',
        emptyAlt: '메인 배너 준비 중',
        intervalMs: 6000,
        intervalOptions: [4000, 6000, 8000],
    });

    // 하단 배너: 커뮤니티 / 클래스 이동용 CTA 캐러셀
    renderBannerCarousel('bottom', bottomBanners, {
        trackId: 'homeBottomBannerTrack',
        dotsId: 'homeBottomBannerDots',
        prevId: 'homeBottomBannerPrev',
        nextId: 'homeBottomBannerNext',
        fallbackLabel: '하단 배너',
        emptyMessage: '',
        emptyAlt: '하단 배너 준비 중',
        showEmptyState: false,
        intervalMs: 9000,
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
            renderHomeCategoryMenu(activeCategory),
        ])
            .catch((error) => console.warn('[BSQ Sync] refresh failed:', error))
            .finally(() => syncHomeCuratedVisibility());
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
