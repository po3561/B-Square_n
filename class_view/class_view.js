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

    // Mirror the global theme on the chat wrapper so view_chat.css theme rules apply.
    const chatWrapper = document.getElementById('tabChat');
    if (chatWrapper) {
        const theme = document.documentElement.getAttribute('data-theme')
            || document.body.getAttribute('data-theme')
            || localStorage.getItem('bsq_theme')
            || 'dark';
        chatWrapper.setAttribute('data-theme', theme);

        const btnThemeToggle = document.getElementById('btnThemeToggle');
        if (btnThemeToggle && !btnThemeToggle.dataset.bsqThemeMirror) {
            btnThemeToggle.dataset.bsqThemeMirror = '1';
            btnThemeToggle.addEventListener('click', () => {
                // simple_class_chat.js toggles body[data-theme]; mirror it onto the wrapper for CSS scoping.
                window.setTimeout(() => {
                    const nextTheme = document.body.getAttribute('data-theme')
                        || document.documentElement.getAttribute('data-theme')
                        || 'dark';
                    chatWrapper.setAttribute('data-theme', nextTheme);
                }, 0);
            });
        }
    }

    if (window.SimpleClassChat?.init) {
        window.SimpleClassChat.init(null, classId, currentUserId || null, hasAccess, isInstructor);
    }

    updateEnrollmentUI();
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

            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);
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
            }
        }
    } catch (err) { console.error(err); }

    // Init Sidebar CTA
    document.getElementById('btnEnroll')?.addEventListener('click', openPaymentBottomSheet);
    document.getElementById('btnAddToCartSide')?.addEventListener('click', saveCurrentClassToCart);
    document.getElementById('btnSheetClose')?.addEventListener('click', closePaymentBottomSheet);
    document.getElementById('btnGoToClassSide')?.addEventListener('click', () => {
        document.querySelector('[data-target="tabIntro"]')?.click();
        window.scrollTo({ top: document.querySelector('.view-tabs').offsetTop - 80, behavior: 'smooth' });
    });

    // Tab Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const trg = btn.getAttribute('data-target');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(trg)?.classList.add('active');
        });
    });

    const initTab = getInitialTabTargetId();
    if (initTab) document.querySelector(`[data-target="${initTab}"]`)?.click();
});

function renderCorePageInfo(data) {
    document.getElementById('viewTitleSide').textContent = data.title;
    document.getElementById('heroSummarySide').textContent = getHeroSummary(data);
    document.getElementById('heroInstructorSide').textContent = data.creator_name || data.instructor_name || '강사 정보 없음';
    document.getElementById('viewCategory').textContent = data.category || '기타';
    
    const price = data.price || 0;
    document.getElementById('heroAvgRatingSide').textContent = Number(data.avg_rating || 0).toFixed(1);
    document.getElementById('heroReviewCountSide').textContent = String(data.review_count || 0);
    document.getElementById('heroPriceSummarySide').textContent = getPriceSummary(data, price);
    document.getElementById('heroOfferSummarySide').textContent = getOfferSummary(data);

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
