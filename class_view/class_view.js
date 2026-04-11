/* class_view.js - Modular Orchestrator & Payment Controller (D1 API 기반) */

const urlParams = new URLSearchParams(window.location.search);
const classId = urlParams.get('id') || urlParams.get('classId');
let userId = null;
let userProfile = null;
let classData = null;
let isEnrolled = false;
let isInstructor = false;
let hasAccess = false;

// 패스(수강권) 관련 전역 변수
let selectedPassType = null;
let selectedPassPrice = 0;
let userPassCount = 0;
let isMonthlySubscribed = false;

function safeParseArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function normalizeRole(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'user';
    if (['super-admin', 'superadmin', 'root', 'owner'].includes(v)) return 'super_admin';
    if (['teacher', 'lecturer'].includes(v)) return 'instructor';
    if (['operator_admin', 'manager', 'ops'].includes(v)) return 'operator';
    return v;
}

function extractSubInstructorIds(rawValue) {
    const parsed = safeParseArray(rawValue, []);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return parsed
        .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String(item.id || item.user_id || item.userId || '').trim();
            return '';
        })
        .filter(Boolean);
}

function computeAccessState() {
    const sessionUser = window.BSQ?.session?.user || null;
    const currentUserId = String(userId || sessionUser?.id || '').trim();
    const role = normalizeRole(userProfile?.role || sessionUser?.role || '');
    const creatorId = String(classData?.creator_id || classData?.instructor_id || classData?.owner_id || '').trim();
    const subInstructorIds = extractSubInstructorIds(classData?.sub_instructors);

    const isOps = ['operator', 'admin', 'super_admin'].includes(role);
    const isStaff = !!currentUserId && (
        (creatorId && creatorId === currentUserId) ||
        subInstructorIds.includes(currentUserId)
    );

    isInstructor = !!(window.__BSQ_DEV_MODE__ || isOps || isStaff);
    hasAccess = !!(window.__BSQ_DEV_MODE__ || (currentUserId && (isEnrolled || isInstructor)));

    const editTabBtn = document.getElementById('tabEditBtn');
    if (editTabBtn) {
        editTabBtn.style.display = isInstructor ? '' : 'none';
    }

    if (window.SimpleClassChat?.init) {
        window.SimpleClassChat.init(null, classId, currentUserId || null, hasAccess, isInstructor);
    }

    updateEnrollmentUI();
    syncMobileClassViewChrome();
}

function formatMoney(value, fallback = '0원') {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return `${num.toLocaleString()}원`;
}

function getHeroSummary(data) {
    const summary = String(data?.summary || data?.subtitle || '').trim();
    if (summary) return summary.replace(/\s+/g, ' ').slice(0, 120);
    const description = String(data?.description || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .trim();
    if (description) return description.replace(/\s+/g, ' ').slice(0, 120);
    const category = String(data?.category || '클래스').trim();
    const instructor = String(data?.creator_name || data?.instructor_name || '').trim();
    return instructor ? `${category} · ${instructor} 클래스의 핵심 흐름을 한눈에 확인할 수 있습니다.` : `${category} 클래스의 핵심 흐름을 한눈에 확인할 수 있습니다.`;
}

function getPriceSummary(data, price) {
    if (data?.tickets?.price_monthly) {
        return `${Number(data.tickets.price_monthly).toLocaleString()}원 / 월`;
    }
    if (data?.tickets?.price_multi && data?.tickets?.pass_count) {
        return `${Number(data.tickets.price_multi).toLocaleString()}원 / ${data.tickets.pass_count}회`;
    }
    if (data?.tickets?.price_one_time) {
        return `${Number(data.tickets.price_one_time).toLocaleString()}원`;
    }
    return Number(price) > 0 ? `${Number(price).toLocaleString()}원` : '무료';
}

function getOfferSummary(data) {
    const ticketParts = [];
    if (data?.tickets?.price_one_time) ticketParts.push('1회');
    if (data?.tickets?.price_multi && data?.tickets?.pass_count) ticketParts.push(`${data.tickets.pass_count}회`);
    if (data?.tickets?.price_monthly) ticketParts.push('월정액');
    if (ticketParts.length) return ticketParts.join(' · ');
    return Number(data?.price || 0) > 0 ? '단일 수강권' : '무료 수강';
}

function getClassImageUrl(data) {
    if (!data) return '';
    if (data.image_url) return data.image_url;
    if (Array.isArray(data.image_urls) && data.image_urls.length > 0) return data.image_urls[0];
    if (data.thumbnail_url) return data.thumbnail_url;
    if (data.thumbnail) return data.thumbnail;
    return '';
}

const TAB_PARAM_MAP = {
    intro: 'tabIntro', curriculum: 'tabCurriculum', review: 'tabReview', notice: 'tabNotice', chat: 'tabChat', edit: 'tabEdit'
};

function setTextContent(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function activateTab(targetId, { updateHistory = true } = {}) {
    const tabId = normalizeTabTargetId(targetId);
    if (!tabId) return;

    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const tabContents = Array.from(document.querySelectorAll('.tab-content'));

    tabBtns.forEach((btn) => {
        const active = btn.getAttribute('data-target') === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    tabContents.forEach((section) => {
        const active = section.id === tabId;
        section.classList.toggle('active', active);
        section.setAttribute('aria-hidden', active ? 'false' : 'true');
    });

    if (updateHistory) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('tab', tabId.replace(/^tab/, '').toLowerCase());
        nextUrl.hash = tabId;
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }

    if (document.body) {
        document.body.dataset.classViewActiveTab = tabId;
        document.body.classList.toggle('class-view-chat-open', tabId === 'tabChat' && isMobileClassViewLayout());
    }
}

function normalizeTabTargetId(rawValue) {
    const value = String(rawValue || '').trim().replace(/^#/, '');
    if (!value) return '';
    if (document.getElementById(value)) return value;
    const lowerValue = value.toLowerCase();
    return TAB_PARAM_MAP[lowerValue] || '';
}

function getInitialTabTargetId() {
    const hashTarget = normalizeTabTargetId(window.location.hash);
    if (hashTarget) return hashTarget;
    return normalizeTabTargetId(urlParams.get('tab'));
}

function getNoticeAuthorContext() {
    const sessionUser = window.BSQ?.session?.user || null;
    const currentUserId = String(userId || sessionUser?.id || '').trim();
    const creatorId = String(classData?.creator_id || classData?.instructor_id || classData?.owner_id || '').trim();
    const subInstructors = safeParseArray(classData?.sub_instructors, [])
        .map(item => String(typeof item === 'object' ? (item.id || item.user_id || '') : item).trim())
        .filter(Boolean);

    let role = String(userProfile?.role || sessionUser?.role || 'instructor').trim().toLowerCase();
    if (window.__BSQ_DEV_MODE__) role = role || 'admin';
    else if (creatorId && currentUserId && creatorId === currentUserId) role = 'main_instructor';
    else if (currentUserId && subInstructors.includes(currentUserId)) role = 'sub_instructor';

    return { id: currentUserId, name: sessionUser?.name || userProfile?.name || '강사', role };
}

function showToast(type, title, message, duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 350); }, duration);
}
window.BSQClassViewToast = showToast;

function showPaymentOverlay() { document.getElementById('paymentOverlay')?.classList.add('active'); }
function hidePaymentOverlay() { document.getElementById('paymentOverlay')?.classList.remove('active'); }

function setButtonLoading(loading) {
    const btn = document.getElementById('btnEnroll');
    if (!btn) return;
    if (loading) {
        btn.classList.add('loading');
        btn.dataset.originalText = btn.textContent;
        btn.textContent = '처리 중...';
    } else {
        btn.classList.remove('loading');
        if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    }
}

function isMobileClassViewLayout() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 768px)').matches;
}

const classViewBookmarkState = {
    bookmarked: false,
    count: 0,
    loaded: false,
    pending: false,
};

function setClassViewBookmarkButtonState(bookmarked, count) {
    const btn = document.getElementById('btnBookmarkClass');
    if (!btn) return;

    const nextBookmarked = !!bookmarked;
    const nextCount = Number.isFinite(Number(count)) ? Number(count) : 0;

    classViewBookmarkState.bookmarked = nextBookmarked;
    classViewBookmarkState.count = nextCount;
    classViewBookmarkState.loaded = true;

    btn.dataset.bookmarked = nextBookmarked ? '1' : '0';
    btn.dataset.bookmarkCount = String(nextCount);
    btn.classList.toggle('is-bookmarked', nextBookmarked);
    btn.setAttribute('aria-pressed', nextBookmarked ? 'true' : 'false');
    btn.setAttribute('aria-label', nextBookmarked ? '찜 해제' : '찜하기');
    btn.innerHTML = `<i class="fa-${nextBookmarked ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>`;
}

async function loadClassViewBookmarkState() {
    if (!classId || (!userId && !window.__BSQ_DEV_MODE__)) {
        setClassViewBookmarkButtonState(false, 0);
        return;
    }

    try {
        const res = await window.BSQ.api(`/api/class-bookmarks?class_id=${encodeURIComponent(classId)}`);
        if (res?.success) {
            setClassViewBookmarkButtonState(!!res.data?.bookmarked, Number(res.data?.count || 0));
            return;
        }
    } catch (error) {
        console.warn('[class_view] bookmark state load failed:', error);
    }

    setClassViewBookmarkButtonState(false, 0);
}

async function toggleClassViewBookmark() {
    if (!classId) return;
    if (!userId && !window.__BSQ_DEV_MODE__) {
        location.href = '../login/login.html';
        return;
    }
    if (classViewBookmarkState.pending) return;

    const btn = document.getElementById('btnBookmarkClass');
    const previous = { ...classViewBookmarkState };

    classViewBookmarkState.pending = true;
    if (btn) btn.disabled = true;

    try {
        const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: classId });
        if (!res?.success) throw new Error(res?.error || '찜 상태를 변경하지 못했습니다.');

        setClassViewBookmarkButtonState(!!res.data?.bookmarked, Number(res.data?.count || 0));
        showToast(
            'success',
            res.data?.bookmarked ? '찜에 저장했습니다' : '찜을 해제했습니다',
            res.data?.bookmarked ? '마이페이지에서 다시 확인할 수 있습니다.' : '저장 목록에서 제외되었습니다.',
        );
    } catch (error) {
        console.error('[class_view] bookmark toggle failed:', error);
        setClassViewBookmarkButtonState(previous.bookmarked, previous.count);
        showToast('error', '찜 상태 변경 실패', error.message || '잠시 후 다시 시도해 주세요.');
    } finally {
        classViewBookmarkState.pending = false;
        if (btn) btn.disabled = false;
    }
}

async function shareClassViewPage() {
    const title = String(document.getElementById('heroTitleTop')?.textContent || document.title || 'B-Square').trim();
    const summary = String(document.getElementById('heroSummaryTop')?.textContent || '').trim();
    const url = window.location.href;

    try {
        if (navigator.share) {
            await navigator.share({ title, text: summary || title, url });
            return;
        }
    } catch (error) {
        console.warn('[class_view] native share failed:', error);
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            showToast('success', '링크를 복사했습니다', '클래스 상세 주소가 클립보드에 저장되었습니다.');
            return;
        }
    } catch (error) {
        console.warn('[class_view] clipboard share failed:', error);
    }

    window.prompt('링크를 복사하세요.', url);
}

function openClassViewConsultation() {
    const chatTabBtn = document.querySelector('[data-target="tabChat"]');
    if (chatTabBtn) {
        chatTabBtn.click();
        window.requestAnimationFrame(() => {
            document.getElementById('tabChat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

function syncMobileClassViewChrome() {
    const mobile = isMobileClassViewLayout();
    const body = document.body;
    if (!body) return;

    if (!window.__BSQ_CLASS_VIEW_THEME_SNAPSHOT__) {
        window.__BSQ_CLASS_VIEW_THEME_SNAPSHOT__ = {
            htmlTheme: document.documentElement.getAttribute('data-theme'),
            bodyTheme: body.getAttribute('data-theme'),
        };
    }

    const snapshot = window.__BSQ_CLASS_VIEW_THEME_SNAPSHOT__;
    body.classList.toggle('class-view-mobile-app', mobile);
    body.classList.toggle('class-view-chat-open', mobile && body.dataset.classViewActiveTab === 'tabChat');

    if (mobile) {
        document.documentElement.setAttribute('data-theme', 'light');
        body.setAttribute('data-theme', 'light');
    } else {
        if (snapshot.htmlTheme) document.documentElement.setAttribute('data-theme', snapshot.htmlTheme);
        else document.documentElement.removeAttribute('data-theme');

        if (snapshot.bodyTheme) body.setAttribute('data-theme', snapshot.bodyTheme);
        else body.removeAttribute('data-theme');
    }

    const goToClassBtn = document.getElementById('btnGoToClassSide');
    if (goToClassBtn && mobile) {
        goToClassBtn.textContent = '상담';
        goToClassBtn.setAttribute('aria-label', '상담하기');
    }

    const cartBtn = document.getElementById('btnAddToCartSide');
    if (cartBtn && mobile) {
        cartBtn.textContent = '장바구니';
    }

    const enrollBtn = document.getElementById('btnEnroll');
    if (enrollBtn && mobile && !enrollBtn.disabled) {
        enrollBtn.textContent = Number(classData?.price || 0) > 0 ? '예약 신청' : '무료 시작하기';
    }

    const bookmarkBtn = document.getElementById('btnBookmarkClass');
    if (bookmarkBtn) {
        bookmarkBtn.setAttribute('aria-pressed', classViewBookmarkState.bookmarked ? 'true' : 'false');
        bookmarkBtn.setAttribute('aria-label', classViewBookmarkState.bookmarked ? '찜 해제' : '찜하기');
        bookmarkBtn.classList.toggle('is-bookmarked', classViewBookmarkState.bookmarked);
        bookmarkBtn.innerHTML = `<i class="fa-${classViewBookmarkState.bookmarked ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!classId) {
        showToast('error', '잘못된 접근입니다', '홈으로 이동합니다.');
        location.href = '../index.html';
        return;
    }

    const authBootstrapTasks = [];
    if (window.BSQ?.ready?.then) authBootstrapTasks.push(window.BSQ.ready.catch(() => null));
    if (window.BSQ?.sessionBootstrapPromise?.then) authBootstrapTasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
    if (authBootstrapTasks.length) await Promise.all(authBootstrapTasks);

    let session = window.BSQ?.session;
    if (session || window.__BSQ_DEV_MODE__) {
        userId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : session.user.id;
        userProfile = window.__BSQ_DEV_MODE__ ? { name: '운영자', role: 'admin' } : session.user;
    }

    try {
        const result = await window.BSQ.api(`/api/classes/${classId}`);
        if (result.success && result.data) {
            classData = result.data;
            renderCorePageInfo(classData);
            
            // 수강 여부 확인
            if (userId && !window.__BSQ_DEV_MODE__) {
                const access = await window.BSQ.api(`/api/enrollments?user_id=${userId}&class_id=${classId}`);
                if (access.success) isEnrolled = access.data?.enrolled || false;
                const passes = await window.BSQ.api(`/api/user-passes?user_id=${userId}`);
                if (passes.success && Array.isArray(passes.data)) {
                    const cp = passes.data.find(it => it.class_id === classId);
                    userPassCount = cp?.remaining_count ?? 0;
                    isMonthlySubscribed = cp?.pass_type === 'monthly';
                }
            }

            if (window.__BSQ_DEV_MODE__) { isEnrolled = true; }
            computeAccessState();
            await loadClassViewBookmarkState();
            syncMobileClassViewChrome();

            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);
                if (window.BSquareModules.initReviews) {
                    window.BSquareModules.initReviews(
                        classData,
                        classId,
                        userId,
                        null,
                        hasAccess,
                        isInstructor,
                    );
                }
                if (window.BSquareModules.initNotice) {
                    window.BSquareModules.initNotice(
                        classData,
                        classId,
                        userId,
                        null,
                        hasAccess,
                        isInstructor,
                        getNoticeAuthorContext(),
                        { noticeId: urlParams.get('notice') || '' },
                    );
                }
                if (isInstructor && window.BSquareModules.initEdit) {
                    await window.BSquareModules.initEdit(null, classId, classData, null, userId);
                }
            }
        }
    } catch (err) { console.error(err); }

    // Init Sidebar CTA
    document.getElementById('btnEnroll')?.addEventListener('click', openPaymentBottomSheet);
    document.getElementById('btnAddToCartSide')?.addEventListener('click', saveCurrentClassToCart);
    document.getElementById('btnSheetClose')?.addEventListener('click', closePaymentBottomSheet);
    document.getElementById('btnClassViewShare')?.addEventListener('click', shareClassViewPage);
    document.getElementById('btnClassViewCart')?.addEventListener('click', saveCurrentClassToCart);
    document.getElementById('btnBookmarkClass')?.addEventListener('click', toggleClassViewBookmark);
    document.getElementById('btnGoToClassSide')?.addEventListener('click', () => {
        if (isMobileClassViewLayout()) {
            openClassViewConsultation();
            return;
        }
        document.querySelector('[data-target="tabIntro"]')?.click();
        window.scrollTo({ top: document.querySelector('.view-tabs').offsetTop - 80, behavior: 'smooth' });
    });

    // Tab Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const trg = btn.getAttribute('data-target');
            activateTab(trg);
        });
    });

    const initTab = getInitialTabTargetId();
    activateTab(initTab || 'tabIntro', { updateHistory: false });

    if (!window.__BSQ_CLASS_VIEW_MOBILE_RESIZE_BOUND__) {
        window.addEventListener('resize', () => syncMobileClassViewChrome(), { passive: true });
        window.addEventListener('orientationchange', () => syncMobileClassViewChrome(), { passive: true });
        window.__BSQ_CLASS_VIEW_MOBILE_RESIZE_BOUND__ = true;
    }
    syncMobileClassViewChrome();
});

function renderCorePageInfo(data) {
    const title = String(data?.title || data?.name || '?대옒???쒕ぉ').trim();
    const summary = getHeroSummary(data);
    const instructor = data.creator_name || data.instructor_name || '媛뺤궗 ?뺣낫 ?놁쓬';
    const category = data.category || '湲고?';
    document.getElementById('viewTitleSide').textContent = data.title;
    document.getElementById('heroSummarySide').textContent = getHeroSummary(data);
    document.getElementById('heroInstructorSide').textContent = data.creator_name || data.instructor_name || '강사 정보 없음';
    document.getElementById('viewCategory').textContent = data.category || '기타';
    
    const price = data.price || 0;
    document.getElementById('heroAvgRatingSide').textContent = Number(data.avg_rating || 0).toFixed(1);
    document.getElementById('heroReviewCountSide').textContent = String(data.review_count || 0);
    document.getElementById('heroPriceSummarySide').textContent = getPriceSummary(data, price);
    document.getElementById('heroOfferSummarySide').textContent = getOfferSummary(data);
    document.getElementById('heroCategoryTop').textContent = data.category || '카테고리';
    document.getElementById('heroTitleTop').textContent = data.title || '클래스 제목';
    document.getElementById('heroSummaryTop').textContent = getHeroSummary(data);
    document.getElementById('heroInstructorTop').textContent = data.creator_name || data.instructor_name || '강사 정보 없음';
    document.getElementById('heroRatingTop').textContent = Number(data.avg_rating || 0).toFixed(1);
    document.getElementById('heroReviewTop').textContent = String(data.review_count || 0);
    document.getElementById('heroPriceTop').textContent = getPriceSummary(data, price);

    setTextContent('heroTitleTop', title);
    setTextContent('heroSummaryTop', summary);
    setTextContent('heroInstructorTop', instructor);
    setTextContent('heroCategoryTop', category);
    setTextContent('heroRatingTop', Number(data.avg_rating || 0).toFixed(1));
    setTextContent('heroReviewTop', String(data.review_count || 0));
    setTextContent('heroPriceTop', getPriceSummary(data, price));

    const images = Array.from(new Set([
        ...safeParseArray(data.image_urls, []).map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String(item.url || item.src || item.image || item.image_url || '').trim();
            return '';
        }),
        String(data.image_url || data.thumbnail_url || data.thumbnail || '').trim(),
        getClassImageUrl(data),
    ].filter(Boolean)));
    initHeroSlider(images);
}

function initHeroSlider(imageUrls = []) {
    const slider = document.getElementById('imageSlider');
    const stage = slider?.closest('.slider-section') || null;
    if (!slider || !stage) return;

    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
    if (urls.length === 0) return;

    if (window.__BSQ_CLASS_HERO_CAROUSEL__?.timer) {
        clearInterval(window.__BSQ_CLASS_HERO_CAROUSEL__.timer);
    }

    const prevBtn = stage.querySelector('.slider-btn.prev');
    const nextBtn = stage.querySelector('.slider-btn.next');
    const counterEl = stage.querySelector('.slider-counter');

    slider.innerHTML = urls.map((src, idx) => {
        const loading = idx === 0 ? 'eager' : 'lazy';
        const fetchpriority = idx === 0 ? 'high' : 'auto';
        return `
            <div class="slider-item" data-slide-index="${idx}" data-pos="hidden" aria-hidden="true">
                <img src="${src}" alt="" loading="${loading}" decoding="async" fetchpriority="${fetchpriority}">
            </div>
        `;
    }).join('');

    const items = Array.from(slider.querySelectorAll('.slider-item'));
    const total = items.length;
    if (total === 0) return;

    let index = 0;
    let hoverPaused = false;

    const reduceMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setCounter() {
        if (counterEl) counterEl.textContent = `${index + 1} / ${total}`;
    }

    function applyPositions() {
        const prevIndex = (index - 1 + total) % total;
        const nextIndex = (index + 1) % total;

        items.forEach((item) => {
            item.dataset.pos = 'hidden';
            item.setAttribute('aria-hidden', 'true');
        });

        const center = items[index];
        if (center) {
            center.dataset.pos = 'center';
            center.setAttribute('aria-hidden', 'false');
        }

        if (total > 1) {
            const left = items[prevIndex];
            const right = items[nextIndex];
            if (left && left !== center) left.dataset.pos = 'left';
            if (right && right !== center) right.dataset.pos = 'right';
        }

        setCounter();
    }

    function goTo(next) {
        index = ((next % total) + total) % total;
        applyPositions();
    }

    function step(dir) {
        goTo(index + dir);
    }

    prevBtn?.addEventListener('click', () => step(-1));
    nextBtn?.addEventListener('click', () => step(1));

    slider.addEventListener('click', (event) => {
        const item = event.target.closest('.slider-item');
        if (!item) return;
        const pos = item.dataset.pos;
        if (pos === 'left') step(-1);
        if (pos === 'right') step(1);
    });

    stage.addEventListener('pointerenter', () => { hoverPaused = true; });
    stage.addEventListener('pointerleave', () => { hoverPaused = false; });

    let timer = null;
    if (total > 1 && !reduceMotion) {
        timer = setInterval(() => {
            if (document.hidden) return;
            if (hoverPaused) return;
            step(1);
        }, 5000);
    }

    window.__BSQ_CLASS_HERO_CAROUSEL__ = { timer };
    if (prevBtn) prevBtn.hidden = total <= 1;
    if (nextBtn) nextBtn.hidden = total <= 1;
    if (counterEl) counterEl.hidden = total <= 1;
    goTo(0);
}

		function updateEnrollmentUI() {
	    const btn = document.getElementById('btnEnroll');
	    if (btn) {
	        if (!userId && !window.__BSQ_DEV_MODE__) {
	            btn.textContent = '로그인 후 시작하기';
	            btn.disabled = false;
	        } else if (isInstructor && !window.__BSQ_DEV_MODE__) {
	            btn.textContent = '강사/운영자 계정';
	            btn.disabled = true;
	        } else if (isEnrolled && !window.__BSQ_DEV_MODE__) {
	            btn.textContent = '✓ 수강 중인 클래스';
	            btn.disabled = true;
	        } else {
	            btn.textContent = '지금 바로 시작하기';
	            btn.disabled = false;
	        }
	    }
	    const pc = document.getElementById('myPassCountVal');
	    if (pc) pc.textContent = `${userPassCount}개`;
	}

function openPaymentBottomSheet() {
    if (!userId) { location.href = '../login/login.html'; return; }
    if (isInstructor && !window.__BSQ_DEV_MODE__) {
        showToast('info', '강사 계정', '본인(관리) 클래스는 결제 없이 이용할 수 있습니다.');
        return;
    }
    document.getElementById('paymentBottomSheet').style.display = 'flex';
}
function closePaymentBottomSheet() { document.getElementById('paymentBottomSheet').style.display = 'none'; }

async function saveCurrentClassToCart() {
    showToast('success', '장바구니에 담았습니다', '마이페이지에서 확인할 수 있습니다.');
}
function updateEnrollmentUI() {
    const btn = document.getElementById('btnEnroll');
    const isFreeClass = Number(classData?.price || 0) <= 0;

    if (btn) {
        if (!userId && !window.__BSQ_DEV_MODE__) {
            btn.textContent = isFreeClass ? '로그인 후 수강하기' : '로그인 후 구매하기';
            btn.disabled = false;
        } else if (isInstructor && !window.__BSQ_DEV_MODE__) {
            btn.textContent = '강사/운영자 계정';
            btn.disabled = true;
        } else if (isEnrolled && !window.__BSQ_DEV_MODE__) {
            btn.textContent = '수강 중인 클래스';
            btn.disabled = true;
        } else {
            btn.textContent = isFreeClass ? '수강하기' : '구매하기';
            btn.disabled = false;
        }
    }

    const pc = document.getElementById('myPassCountVal');
    if (pc) pc.textContent = `${userPassCount}개`;
}
function openFreeEnrollModal() {
    const modal = document.getElementById('freeEnrollModal');
    if (modal) modal.classList.add('active');
}

function closeFreeEnrollModal() {
    const modal = document.getElementById('freeEnrollModal');
    if (modal) modal.classList.remove('active');
}

async function confirmFreeEnrollment() {
    if (!userId) {
        location.href = '../login/login.html';
        return;
    }

    if (isInstructor && !window.__BSQ_DEV_MODE__) {
        showToast('info', '강사 계정', '강사 계정은 수강 신청을 할 수 없습니다.');
        closeFreeEnrollModal();
        return;
    }

    try {
        setButtonLoading(true);
        const res = await window.BSQ.api('/api/enrollments', {
            method: 'POST',
            body: JSON.stringify({
                class_id: classId,
                pay_option: 'onetime',
                pay_method: 'free',
                payment_method: 'free',
                card_name: '무료수강',
                base_amount: 0,
                class_discount_amount: 0,
                coupon_discount_amount: 0,
                final_amount: 0,
            }),
        });

        if (res?.success) {
            closeFreeEnrollModal();
            isEnrolled = true;
            computeAccessState();
            showToast('success', '수강 완료', '무료 클래스 수강이 완료되었습니다.');
            setTimeout(() => window.location.reload(), 700);
            return;
        }

        throw new Error(res?.error || '무료 수강 처리에 실패했습니다.');
    } catch (error) {
        showToast('error', '무료 수강 실패', error.message || '처리 중 오류가 발생했습니다.');
    } finally {
        setButtonLoading(false);
    }
}

function openPaymentBottomSheet() {
    const isFreeClass = Number(classData?.price || 0) <= 0;
    if (!userId) { location.href = '../login/login.html'; return; }
    if (isInstructor && !window.__BSQ_DEV_MODE__) {
        showToast('info', '강사 계정', '본인(관리) 클래스는 결제 없이 이용할 수 있습니다.');
        return;
    }
    if (isFreeClass) {
        openFreeEnrollModal();
        return;
    }
    document.getElementById('paymentBottomSheet').style.display = 'flex';
}

function closePaymentBottomSheet() { document.getElementById('paymentBottomSheet').style.display = 'none'; }

document.getElementById('btnFreeCancel')?.addEventListener('click', closeFreeEnrollModal);
document.getElementById('btnFreeConfirm')?.addEventListener('click', confirmFreeEnrollment);
