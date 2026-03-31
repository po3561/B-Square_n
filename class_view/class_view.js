/* class_view.js - Modular Orchestrator & Payment Controller (D1 API 기반) */

const urlParams = new URLSearchParams(window.location.search);
const classId = urlParams.get('id') || urlParams.get('classId');
let userId = null;
let userProfile = null;
let classData = null;
let isEnrolled = false;
let isInstructor = false;

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
    if (data.thumbnail_url) return data.thumbnail_url;
    if (data.thumbnail) return data.thumbnail;
    if (data.image_url) return data.image_url;
    if (Array.isArray(data.image_urls) && data.image_urls.length > 0) return data.image_urls[0];
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

    const needsAuthHydration = !window.BSQ?.session && !window.__BSQ_DEV_MODE__ && window.BSQ?.ready?.then;
    if (needsAuthHydration) await window.BSQ.ready.catch(() => null);

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

            if (window.__BSQ_DEV_MODE__) { isEnrolled = true; isInstructor = true; }
            updateEnrollmentUI();

            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);
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

    const images = data.image_urls?.length > 0 ? data.image_urls : [getClassImageUrl(data)];
    const slider = document.getElementById('imageSlider');
    if (slider && images.length > 0) {
        slider.innerHTML = images.map((src, i) => `<div class="slider-item" style="${i === 0 ? '' : 'display:none;'}"><img src="${src}"></div>`).join('');
        let cur = 0;
        const items = slider.querySelectorAll('.slider-item');
        const goTo = (idx) => { items[cur].style.display = 'none'; cur = idx; items[cur].style.display = 'block'; };
        setInterval(() => goTo((cur + 1) % items.length), 5000);
    }
}

function updateEnrollmentUI() {
    const btn = document.getElementById('btnEnroll');
    if (btn) {
        if (isEnrolled && !window.__BSQ_DEV_MODE__) {
            btn.textContent = "✓ 수강 중인 클래스"; btn.disabled = true;
        } else {
            btn.textContent = "지금 바로 시작하기"; btn.disabled = false;
        }
    }
    const pc = document.getElementById('myPassCountVal');
    if (pc) pc.textContent = `${userPassCount}개`;
}

function openPaymentBottomSheet() {
    if (!userId) { location.href = '../login/login.html'; return; }
    document.getElementById('paymentBottomSheet').style.display = 'flex';
}
function closePaymentBottomSheet() { document.getElementById('paymentBottomSheet').style.display = 'none'; }

async function saveCurrentClassToCart() {
    showToast('success', '장바구니에 담았습니다', '마이페이지에서 확인할 수 있습니다.');
}
