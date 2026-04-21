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

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    if (summary) return summary.replace(/\s+/g, ' ').slice(0, 96);
    const description = String(data?.description || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .trim();
    if (description) return description.replace(/\s+/g, ' ').slice(0, 96);
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

function getHeroFormatChipText(data) {
    if (data?.tickets?.price_monthly) return '월정액';
    if (data?.tickets?.price_multi && data?.tickets?.pass_count) return `${data.tickets.pass_count}회`;
    if (data?.tickets?.price_one_time) return '1회';
    return Number(data?.price || 0) > 0 ? '유료' : '무료';
}

function getClassImageUrl(data) {
    if (!data) return '';
    if (data.image_url) return data.image_url;
    if (Array.isArray(data.image_urls) && data.image_urls.length > 0) return data.image_urls[0];
    if (data.thumbnail_url) return data.thumbnail_url;
    if (data.thumbnail) return data.thumbnail;
    return '';
}

function devLog(level, ...args) {
    if (typeof window.__BSQ_DEV_LOG__ === 'function') {
        window.__BSQ_DEV_LOG__(level, ...args);
        return;
    }

    const fn = typeof console?.[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
    fn(...args);
}

const classViewStatusState = {
    loadingTemplate: '',
};

function getClassViewStatusLayer() {
    return document.getElementById('classViewStatus');
}

function buildClassViewErrorStateHtml({ title, message, detail, actionLabel = '다시 불러오기' } = {}) {
    return `
        <section class="class-view-status-card" data-state="error" data-tone="soft">
            <div class="class-view-status-copy">
                <span class="class-view-status-eyebrow">오류</span>
                <strong class="class-view-status-title">${escapeHtml(title || '클래스 정보를 불러오지 못했습니다.')}</strong>
                <p class="class-view-status-text">${escapeHtml(message || '네트워크 상태를 확인한 뒤 다시 시도해 주세요.')}</p>
                ${detail ? `<p class="class-view-status-detail">${escapeHtml(detail)}</p>` : ''}
            </div>
            <div class="class-view-status-actions">
                <button type="button" class="class-view-status-btn primary" data-action="class-view-retry">${escapeHtml(actionLabel)}</button>
                <a class="class-view-status-btn secondary" href="../index.html">홈으로</a>
            </div>
        </section>
    `;
}

function setClassViewPageState(state, options = {}) {
    const statusLayer = getClassViewStatusLayer();
    const body = document.body;
    if (!statusLayer || !body) return;

    if (!classViewStatusState.loadingTemplate) {
        classViewStatusState.loadingTemplate = statusLayer.innerHTML;
    }

    const nextState = String(state || 'ready');
    body.dataset.classViewState = nextState;
    body.classList.toggle('class-view-loading', nextState === 'loading');
    body.classList.toggle('class-view-ready', nextState === 'ready');
    body.classList.toggle('class-view-error', nextState === 'error');

    if (nextState === 'ready') {
        statusLayer.hidden = true;
        statusLayer.innerHTML = classViewStatusState.loadingTemplate || statusLayer.innerHTML;
        statusLayer.removeAttribute('aria-busy');
        return;
    }

    statusLayer.hidden = false;
    statusLayer.setAttribute('aria-busy', 'true');

    if (nextState === 'loading') {
        statusLayer.innerHTML = classViewStatusState.loadingTemplate || statusLayer.innerHTML;
        statusLayer.dataset.state = 'loading';
        return;
    }

    if (nextState === 'error') {
        statusLayer.innerHTML = buildClassViewErrorStateHtml(options);
        statusLayer.dataset.state = 'error';
    }
}

function requestClassViewReload() {
    window.location.reload();
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
        devLog('warn', '[class_view] bookmark state load failed:', error);
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
        devLog('warn', '[class_view] bookmark toggle failed:', error);
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
        devLog('warn', '[class_view] native share failed:', error);
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            showToast('success', '링크를 복사했습니다', '클래스 상세 주소가 클립보드에 저장되었습니다.');
            return;
        }
    } catch (error) {
        devLog('warn', '[class_view] clipboard share failed:', error);
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
    body.classList.toggle('class-view-mobile-app', mobile);
    body.classList.toggle('class-view-chat-open', mobile && body.dataset.classViewActiveTab === 'tabChat');

    const currentTheme = document.documentElement.getAttribute('data-theme')
        || body.getAttribute('data-theme')
        || window.BSQCommunityShared?.loadSettings?.().theme
        || 'dark';

    if (mobile) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        body.setAttribute('data-theme', currentTheme);
    } else {
        if (!document.documentElement.getAttribute('data-theme')) {
            document.documentElement.setAttribute('data-theme', currentTheme);
        }
        if (!body.getAttribute('data-theme')) {
            body.setAttribute('data-theme', currentTheme);
        }
    }

    const goToClassBtn = document.getElementById('btnGoToClassSide');
    if (goToClassBtn && mobile) {
        goToClassBtn.textContent = '상담';
        goToClassBtn.setAttribute('aria-label', '상담하기');
    }

    const cartBtn = document.getElementById('btnAddToCartSide');
    if (cartBtn) {
        cartBtn.hidden = true;
    }

    const enrollBtn = document.getElementById('btnEnroll');
    if (enrollBtn && mobile && !enrollBtn.disabled) {
        enrollBtn.textContent = Number(classData?.price || 0) > 0 ? '수강 신청' : '무료 시작하기';
    }

    const bookmarkBtn = document.getElementById('btnBookmarkClass');
    if (bookmarkBtn) {
        bookmarkBtn.setAttribute('aria-pressed', classViewBookmarkState.bookmarked ? 'true' : 'false');
        bookmarkBtn.setAttribute('aria-label', classViewBookmarkState.bookmarked ? '찜 해제' : '찜하기');
        bookmarkBtn.classList.toggle('is-bookmarked', classViewBookmarkState.bookmarked);
        bookmarkBtn.innerHTML = `<i class="fa-${classViewBookmarkState.bookmarked ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    void bootstrapClassViewPage();
});

async function bootstrapClassViewPage() {
    setClassViewPageState('loading');

    if (!classId) {
        showToast('error', '잘못된 접근입니다', '홈으로 이동합니다.');
        location.href = '../index.html';
        return;
    }

    try {
        const authBootstrapTasks = [];
        if (window.BSQ?.ready?.then) authBootstrapTasks.push(window.BSQ.ready.catch(() => null));
        if (window.BSQ?.sessionBootstrapPromise?.then) authBootstrapTasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
        if (authBootstrapTasks.length) await Promise.all(authBootstrapTasks);

        const session = window.BSQ?.session;
        if (session || window.__BSQ_DEV_MODE__) {
            userId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : session.user.id;
            userProfile = window.__BSQ_DEV_MODE__ ? { name: '운영자', role: 'admin' } : session.user;
        }

        const result = await window.BSQ.api(`/api/classes/${classId}`);
        if (!result?.success || !result.data) {
            throw new Error(result?.error || '클래스 정보를 불러오지 못했습니다.');
        }

        classData = result.data;
        renderCorePageInfo(classData);

        const accessTasks = [];
        if (userId && !window.__BSQ_DEV_MODE__) {
            accessTasks.push(
                window.BSQ.api(`/api/enrollments?user_id=${userId}&class_id=${classId}`),
                window.BSQ.api(`/api/user-passes?user_id=${userId}`),
            );
        }

        if (accessTasks.length) {
            const [access, passes] = await Promise.all(accessTasks);
            if (access?.success) isEnrolled = access.data?.enrolled || false;
            if (passes?.success && Array.isArray(passes.data)) {
                const cp = passes.data.find((item) => item.class_id === classId);
                userPassCount = cp?.remaining_count ?? 0;
                isMonthlySubscribed = cp?.pass_type === 'monthly';
            }
        }

        if (window.__BSQ_DEV_MODE__) {
            isEnrolled = true;
        }

        computeAccessState();
        await loadClassViewBookmarkState();
        syncMobileClassViewChrome();

        const modules = window.BSquareModules || {};
        if (modules.initIntro) {
            try { modules.initIntro(classData); } catch (error) { devLog('warn', '[class_view] intro init failed:', error); }
        }
        if (modules.initCurriculum) {
            try { modules.initCurriculum(classData); } catch (error) { devLog('warn', '[class_view] curriculum init failed:', error); }
        }
        if (modules.initReviews) {
            try {
                modules.initReviews(
                    classData,
                    classId,
                    userId,
                    null,
                    hasAccess,
                    isInstructor,
                );
            } catch (error) {
                devLog('warn', '[class_view] reviews init failed:', error);
            }
        }
        if (modules.initNotice) {
            try {
                modules.initNotice(
                    classData,
                    classId,
                    userId,
                    null,
                    hasAccess,
                    isInstructor,
                    getNoticeAuthorContext(),
                    { noticeId: urlParams.get('notice') || '' },
                );
            } catch (error) {
                devLog('warn', '[class_view] notice init failed:', error);
            }
        }
        if (isInstructor && modules.initEdit) {
            try {
                await modules.initEdit(null, classId, classData, null, userId);
            } catch (error) {
                devLog('warn', '[class_view] edit init failed:', error);
            }
        }

        setClassViewPageState('ready');

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
    } catch (error) {
        const message = String(error?.message || error || '클래스 정보를 불러오지 못했습니다.');
        const userMessage = /class not found/i.test(message)
            ? '클래스를 찾을 수 없습니다.'
            : message.includes('Failed to fetch')
                ? '네트워크 상태를 확인한 뒤 다시 시도해 주세요.'
                : message;
        devLog('warn', '[class_view] bootstrap failed:', error);
        setClassViewPageState('error', {
            title: '클래스 정보를 불러오지 못했습니다.',
            message: userMessage,
            detail: error?.detail || '',
            actionLabel: '다시 불러오기',
        });
        const retryButton = document.querySelector('[data-action="class-view-retry"]');
        retryButton?.addEventListener('click', requestClassViewReload);
    }
}

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
    const heroFormatChip = document.getElementById('heroFormatChip');
    if (heroFormatChip) {
        heroFormatChip.textContent = getHeroFormatChipText(data);
        heroFormatChip.title = getOfferSummary(data);
    }
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
