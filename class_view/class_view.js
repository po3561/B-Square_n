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

// ===== Toast Notification System =====
function showToast(type, title, message, duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ===== Payment Overlay Control =====
function showPaymentOverlay() {
    const overlay = document.getElementById('paymentOverlay');
    if (overlay) overlay.classList.add('active');
}

function hidePaymentOverlay() {
    const overlay = document.getElementById('paymentOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ===== CTA Button Loading State =====
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
        alert("잘못된 접근입니다.");
        location.href = '../bsnnnnnnnnnnnnnnnnnn/index.html';
        return;
    }

    // 1. BSQ 초기화 대기 (D1 API 기반)
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    // 2. 세션 확인 (D1 API 쿠키 기반)
    const session = window.BSQ?.session;
    const isOperator = window.__BSQ_DEV_MODE__ === true;

    if (session || isOperator) {
        userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
        console.log('🔑 로그인 확인 — userId:', userId);

        if (isOperator) {
            userProfile = { name: '운영자', profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png', role: 'admin' };
        } else {
            userProfile = session.user;
        }
    } else {
        console.warn('⚠️ 미로그인 상태');
    }

    // 3. ★ D1 API에서 클래스 데이터 로드
    try {
        const result = await window.BSQ.api(`/api/classes/${classId}`);
        if (result.success && result.data) {
            classData = result.data;
        }

        if (classData) {
            // 강사 판별 (타입 불일치 방지를 위해 == 사용)
            isInstructor = !!(userId && classData.creator_id && userId == classData.creator_id);

            if (!isInstructor && userProfile && (userProfile.role === 'admin' || userProfile.role === 'operator' || userProfile.role === 'instructor')) {
                isInstructor = true;
            }

            // 서브 강사 체크
            const subInstructors = typeof classData.sub_instructors === 'string' ? JSON.parse(classData.sub_instructors || '[]') : (classData.sub_instructors || []);
            if (!isInstructor && userId && Array.isArray(subInstructors)) {
                isInstructor = subInstructors.some(si => si.id == userId);
            }

            // creator_email 폴백
            if (!isInstructor && session && session.user && classData.creator_email) {
                if (session.user.email === classData.creator_email) isInstructor = true;
            }

            // ★ 총괄 개발자 모드
            if (window.__BSQ_DEV_MODE__) {
                isInstructor = true;
                isEnrolled = true;
            }

            console.log("👨‍🏫 강사 판별:", { userId, creator_id: classData.creator_id, isInstructor, devMode: !!window.__BSQ_DEV_MODE__ });

            renderCorePageInfo(classData);

            // 채팅 헤더 미니 로고
            const logoMini = document.getElementById('chatLogoMini');
            if (logoMini && classData.thumbnail_url) {
                logoMini.style.backgroundImage = `url(${classData.thumbnail_url})`;
            }
            document.getElementById('btnGoToClass')?.addEventListener('click', () => {
                document.querySelector('[data-target="tabIntro"]')?.click();
            });

            // 모듈형 스크립트 호출
            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);

                // ★ D1 API로 수강 여부 확인
                if (userId && !window.__BSQ_DEV_MODE__) {
                    try {
                        const enrollResult = await window.BSQ.api(`/api/enrollments?user_id=${userId}&class_id=${classId}`);
                        if (enrollResult.success) {
                            isEnrolled = enrollResult.data?.enrolled || false;
                        }
                    } catch (enrollErr) {
                        console.warn("수강 상태 확인 실패:", enrollErr);
                    }
                }

                const hasAccess = isEnrolled || isInstructor || window.__BSQ_DEV_MODE__;
                console.log("🔑 권한 상태:", { isEnrolled, isInstructor, hasAccess });

                // 리뷰, 공지 모듈은 우선 BSquareModules 로드 (에러가 나지 않는 선에서)
                if (window.BSquareModules.initReviews) window.BSquareModules.initReviews(null, classId, userId, null, hasAccess, isInstructor);
                if (window.BSquareModules.initNotice) window.BSquareModules.initNotice(null, classId, userId, null, hasAccess, isInstructor);
                
                // ★ 채팅은 파이어베이스 잔재인 BSquareModules 대신, 순수 D1으로 작성된 SimpleClassChat 호출 (크래시 방어)
                if (window.SimpleClassChat) {
                    window.SimpleClassChat.init(null, classId, userId, hasAccess, isInstructor);
                } else {
                    console.warn('SimpleClassChat 모듈이 로드되지 않았습니다.');
                }

                updateEnrollmentUI();

                // 강사/운영자: '페이지 수정' 탭 표시
                if (isInstructor || window.__BSQ_DEV_MODE__) {
                    const editTabBtn = document.getElementById('tabEditBtn');
                    if (editTabBtn) editTabBtn.style.display = 'inline-block';
                    if (window.BSquareModules.initEdit) window.BSquareModules.initEdit(null, classId, classData, null, userId);
                }

                window.addEventListener('bsq_dev_mode_activated', () => {
                    const editTabBtn = document.getElementById('tabEditBtn');
                    if (editTabBtn) editTabBtn.style.display = 'inline-block';
                    if (window.BSquareModules.initEdit && classData) {
                        window.BSquareModules.initEdit(null, classId, classData, null, userId);
                    }
                });
            }
        } else {
            alert("클래스 정보를 찾을 수 없습니다.");
        }
    } catch (err) {
        console.error("Initialization Error:", err);
    }

    // 4. 탭 전환
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(t => t.classList.remove('active'));
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('active');

            const grid = document.querySelector('.view-grid');
            const sidebar = document.querySelector('.view-sidebar');
            const unlocked = document.getElementById('chatUnlocked');
            const locked = document.getElementById('chatLockedOverlay');
            const activeArea = document.getElementById('chatActiveArea');

            if (grid && sidebar) {
                if (targetId === 'tabChat') {
                    grid.style.gridTemplateColumns = '1fr';
                    sidebar.style.display = 'none';

                    const hasAccess = isEnrolled || isInstructor || window.__BSQ_DEV_MODE__;
                    console.log("👆 탭 클릭 - 권한 확인:", { isEnrolled, isInstructor, hasAccess });
                    
                    if (hasAccess) {
                        if (unlocked) unlocked.style.display = 'flex';
                        if (activeArea) activeArea.style.display = 'flex';
                        if (locked) {
                            locked.classList.add('hidden');
                            locked.style.setProperty('display', 'none', 'important');
                        }
                    } else {
                        if (unlocked) unlocked.style.display = 'none';
                        if (activeArea) activeArea.style.display = 'none';
                        if (locked) {
                            locked.classList.remove('hidden');
                            locked.style.setProperty('display', 'flex', 'important');
                        }
                    }
                } else {
                    grid.style.gridTemplateColumns = '1fr 380px';
                    sidebar.style.display = 'block';
                    if (unlocked) unlocked.style.display = 'none';
                    if (locked) locked.style.display = 'none';
                    if (activeArea) activeArea.style.display = 'none';
                }
            }
        });
    });

    // 5. 결제 팝업 이벤트
    document.getElementById('btnEnroll')?.addEventListener('click', openPaymentBottomSheet);
    document.getElementById('btnSheetClose')?.addEventListener('click', closePaymentBottomSheet);

    document.querySelectorAll('input[name="payOption"]').forEach(radio => {
        radio.addEventListener('change', updatePaymentSummary);
    });
    document.getElementById('btnApplyCoupon')?.addEventListener('click', applyCoupon);
    document.getElementById('btnTossPayStart')?.addEventListener('click', executeTossPayment);

    // 6. 무료 클래스 모달
    document.getElementById('btnFreeCancel')?.addEventListener('click', () => {
        document.getElementById('freeEnrollModal')?.classList.remove('active');
    });
    document.getElementById('btnFreeConfirm')?.addEventListener('click', handleFreeEnrollment);

    // 7. 수강권 사용
    document.getElementById('btnUsePass')?.addEventListener('click', usePass);

    // 8. 스크롤 격리
    const tabChat = document.getElementById('tabChat');
    if (tabChat) {
        tabChat.addEventListener('mouseenter', () => { document.body.style.overflow = 'hidden'; });
        tabChat.addEventListener('mouseleave', () => { document.body.style.overflow = ''; });
    }
});

// ===== 수강권 사용 (D1 API) =====
async function usePass() {
    if (!userId || userId === 'OPERATOR_GHOST') return;
    if (userPassCount <= 0) {
        showToast('error', '수강권 부족', '보유하신 수강권이 없습니다.');
        return;
    }

    if (!confirm('수강권 1회를 사용하시겠습니까?')) return;

    const btn = document.getElementById('btnUsePass');
    btn.disabled = true;
    btn.textContent = '처리 중...';

    try {
        // TODO: D1 API로 수강권 차감 (Phase 2 후반부)
        userPassCount--;
        showToast('success', '수강권 사용 완료 ✅', '수강권 1회가 차감되었습니다.');
        updateEnrollmentUI();
    } catch (err) {
        console.error("Pass use error:", err);
        showToast('error', '오류 발생', '수강권 사용 중 문제가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.textContent = '🎫 수강권 1회 사용하기';
    }
}

// ===== 무료 클래스 수강 등록 (D1 API) =====
async function handleFreeEnrollment() {
    const modal = document.getElementById('freeEnrollModal');
    modal?.classList.remove('active');

    setButtonLoading(true);

    try {
        const result = await window.BSQ.api('/api/enrollments', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                class_id: classId,
                payment_method: 'free',
                amount_paid: 0
            })
        });

        if (!result.success) throw new Error(result.error);

        isEnrolled = true;
        updateEnrollmentUI();
        showToast('success', '수강 신청 완료! 🎉', `"${classData?.title}" 클래스를 무료로 시작합니다.`);
        if (window.BSQ?.triggerSync) window.BSQ.triggerSync('enroll');
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        console.error("Free enrollment error:", err);
        showToast('error', '수강 신청 실패', '문제가 발생했습니다. 다시 시도해 주세요.');
    } finally {
        setButtonLoading(false);
    }
}

// ===== 결제 팝업 로직 =====
let currentBasePrice = 0;
let currentDiscountAmount = 0;
let finalPaymentPrice = 0;
let appliedCouponCode = null;

function openPaymentBottomSheet() {
    if (window.__BSQ_DEV_MODE__) {
        isEnrolled = true;
        updateEnrollmentUI();
        showToast('success', '👨‍💻 운영자 프리패스 적용', 'DB 기록 없이 수강 권한이 즉시 부여되었습니다.');
        return;
    }

    if (!userId) {
        showToast('info', '로그인이 필요합니다', '결제를 진행하려면 먼저 로그인해 주세요.');
        setTimeout(() => window.location.href = '../login/login.html', 1500);
        return;
    }
    if (isEnrolled && (!classData || !classData.tickets)) {
        showToast('info', '이미 수강 중', '이미 수강 중인 클래스입니다.');
        return;
    }

    const price = classData.price || 0;
    if (price === 0) {
        const modalText = document.getElementById('freeModalText');
        if (modalText) modalText.textContent = `"${classData.title}" 클래스는 무료입니다. 바로 수강을 시작하시겠습니까?`;
        document.getElementById('freeEnrollModal')?.classList.add('active');
        return;
    }

    const baseP = classData.price || 10000;
    document.getElementById('optPriceMonthly').textContent = `${baseP.toLocaleString()}원/월`;
    document.getElementById('optPrice30Days').textContent = `${(baseP * 1.5).toLocaleString()}원`;
    document.getElementById('optPriceOneTime').textContent = `${baseP.toLocaleString()}원`;

    document.getElementById('paymentBottomSheet').style.display = 'flex';
    document.querySelector('input[name="payOption"][value="onetime"]').checked = true;

    appliedCouponCode = null;
    currentDiscountAmount = 0;
    document.getElementById('couponCodeInput').value = '';
    document.getElementById('couponMessage').textContent = '';
    document.getElementById('summaryDiscountRow').style.display = 'none';
    updatePaymentSummary();
}

function closePaymentBottomSheet() {
    document.getElementById('paymentBottomSheet').style.display = 'none';
}

function updatePaymentSummary() {
    const baseP = classData.price || 10000;
    const selected = document.querySelector('input[name="payOption"]:checked')?.value || 'onetime';

    if (selected === 'monthly') currentBasePrice = baseP;
    else if (selected === '30days') currentBasePrice = baseP * 1.5;
    else currentBasePrice = baseP;

    // 1차: 클래스 기본 할인율 적용
    const discountRate = classData.discount_rate || 0;
    let initialDiscountedPrice = currentBasePrice;
    let classDiscountAmount = 0;
    if (discountRate > 0) {
        classDiscountAmount = Math.floor(currentBasePrice * (discountRate / 100));
        initialDiscountedPrice = currentBasePrice - classDiscountAmount;
    }

    // 2차: 쿠폰 적용
    finalPaymentPrice = Math.max(0, initialDiscountedPrice - currentDiscountAmount);

    const totalDiscountDisp = classDiscountAmount + currentDiscountAmount;

    document.getElementById('summaryOriginalPrice').textContent = `${currentBasePrice.toLocaleString()}원`;
    document.getElementById('summaryFinalPrice').textContent = `${finalPaymentPrice.toLocaleString()}원`;
    
    // 쿠폰이 없어도 클래스 할인이 있으면 할인 행 표시
    if (totalDiscountDisp > 0) {
        document.getElementById('summaryDiscountRow').style.display = 'flex';
        document.getElementById('summaryDiscountAmount').textContent = `-${totalDiscountDisp.toLocaleString()}원`;
    }
}

// ===== 쿠폰 적용 (D1 API) =====
async function applyCoupon() {
    const code = document.getElementById('couponCodeInput').value.trim();
    const msgEl = document.getElementById('couponMessage');

    if (!code) {
        msgEl.className = 'coupon-msg error';
        msgEl.textContent = '쿠폰 코드를 입력해주세요.';
        return;
    }

    try {
        const btn = document.getElementById('btnApplyCoupon');
        btn.disabled = true;
        btn.textContent = '확인중...';

        const result = await window.BSQ.api(`/api/coupons?class_id=${classId}&code=${encodeURIComponent(code)}`);

        if (!result.success || !result.data) {
            msgEl.className = 'coupon-msg error';
            msgEl.textContent = result.error || '존재하지 않거나 유효하지 않은 쿠폰입니다.';
            btn.disabled = false;
            btn.textContent = '적용';
            return;
        }

        const coupon = result.data;

        if (coupon.type === 'percent') {
            currentDiscountAmount = Math.floor(currentBasePrice * (coupon.value / 100));
        } else {
            currentDiscountAmount = coupon.value;
        }

        appliedCouponCode = code;
        msgEl.className = 'coupon-msg success';
        msgEl.textContent = `[${code}] 쿠폰이 적용되었습니다! (-${currentDiscountAmount.toLocaleString()}원)`;

        document.getElementById('summaryDiscountRow').style.display = 'flex';
        document.getElementById('summaryDiscountAmount').textContent = `-${currentDiscountAmount.toLocaleString()}원`;

        updatePaymentSummary();
        btn.disabled = false;
        btn.textContent = '적용됨';
    } catch (err) {
        console.error("Coupon error:", err);
        msgEl.className = 'coupon-msg error';
        msgEl.textContent = '쿠폰 조회 중 오류가 발생했습니다.';
        document.getElementById('btnApplyCoupon').disabled = false;
        document.getElementById('btnApplyCoupon').textContent = '적용';
    }
}

// ===== 최종 포트원 결제 실행 =====
async function executeTossPayment() {
    closePaymentBottomSheet();

    if (finalPaymentPrice <= 0) {
        // [수정] 0원 결제(100% 할인 또는 쿠폰 적용) 시 PG사를 거치지 않고 바로 D1 시스템에 무료수강을 등록시킵니다.
        const uid = appliedCouponCode ? `coupon_${appliedCouponCode}_${new Date().getTime()}` : `free_100_${new Date().getTime()}`;
        const payMethod = appliedCouponCode ? 'coupon' : 'free_pass';

        await finalizeEnrollment({
            imp_uid: 'BSQ_FREE_PASS',
            merchant_uid: uid,
            paid_amount: 0,
            paid_at: Math.floor(new Date().getTime() / 1000),
            pay_method: payMethod
        });
        return;
    }

    setButtonLoading(true);
    showPaymentOverlay();

    const { IMP } = window;
    if (!IMP) {
        hidePaymentOverlay();
        setButtonLoading(false);
        showToast('error', '결제 모듈 오류', '결제 모듈을 불러올 수 없습니다.');
        return;
    }

    IMP.init('imp14397622');
    const merchantUid = `order_${classId}_${new Date().getTime()}`;
    const selectedOption = document.querySelector('input[name="payOption"]:checked').value;

    IMP.request_pay({
        pg: "html5_inicis",
        pay_method: "card",
        merchant_uid: merchantUid,
        name: `${classData.title} (${selectedOption})`,
        amount: finalPaymentPrice,
        buyer_email: userProfile?.email || "",
        buyer_name: userProfile?.name || "구매자",
        buyer_tel: userProfile?.phone || "010-0000-0000",
    }, async function (rsp) {
        hidePaymentOverlay();
        if (rsp.success) {
            await finalizeEnrollment(rsp);
        } else {
            if (rsp.error_msg && rsp.error_msg.includes('취소')) {
                showToast('info', '결제 취소', '결제가 취소되었습니다.');
            } else {
                showToast('error', '결제 실패', rsp.error_msg || '알 수 없는 오류가 발생했습니다.');
            }
        }
        setButtonLoading(false);
    });
}

// ===== 결제 완료 후 D1 API 등록 =====
async function finalizeEnrollment(rsp) {
    setButtonLoading(true);
    try {
        const selectedOption = document.querySelector('input[name="payOption"]:checked')?.value || 'onetime';

        const result = await window.BSQ.api('/api/enrollments', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                class_id: classId,
                payment_method: rsp.pay_method || 'card',
                amount_paid: rsp.paid_amount || 0,
                coupon_id: appliedCouponCode || null
            })
        });

        if (!result.success) throw new Error(result.error);

        isEnrolled = true;
        updateEnrollmentUI();
        showToast('success', '결제 완료! 🎉', `"${classData.title}" 클래스 수강이 시작됩니다.`);
        if (window.BSQ?.triggerSync) window.BSQ.triggerSync('enroll');
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        console.error("Enrollment save error:", err);
        showToast('error', '등록 오류', '수강 등록에 문제가 발생했습니다.');
    } finally {
        setButtonLoading(false);
    }
}

function renderCorePageInfo(data) {
    document.getElementById('viewTitle').textContent = data.title;
    document.getElementById('sidebarTitle').textContent = data.title;
    // 채팅 헤더에 클래스명 채팅채널 표시
    const chatHeaderName = document.getElementById('chatHeaderName');
    if (chatHeaderName) chatHeaderName.textContent = `${data.title} 채팅채널`;
    // 채팅 헤더 아바타에 클래스 썸네일 설정
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
    if (chatHeaderAvatar && data.thumbnail_url) {
        chatHeaderAvatar.style.backgroundImage = `url(${data.thumbnail_url})`;
        chatHeaderAvatar.style.backgroundSize = 'cover';
        chatHeaderAvatar.style.backgroundPosition = 'center';
    }
    document.getElementById('viewCategory').textContent = data.category || '기타';
    document.getElementById('sidebarCategory').textContent = data.category || '기타';

    const price = data.tickets && selectedPassType ? selectedPassPrice : (data.price || 0);

    // 다회권 / 구독권 UI
    const passOptionsContainer = document.getElementById('passOptionsContainer');
    if (passOptionsContainer) passOptionsContainer.style.display = 'none';

    if (passOptionsContainer && data.tickets && (data.tickets.price_one_time || data.tickets.price_multi || data.tickets.price_monthly)) {
        let optionsHtml = '<div style="display:flex; flex-direction:column; gap:8px;">';
        let firstAvailable = null;

        if (data.tickets.price_one_time) {
            optionsHtml += `<label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                <span><input type="radio" name="passType" value="one_time" data-price="${data.tickets.price_one_time}" style="margin-right:8px;">1회 수강권</span>
                <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_one_time.toLocaleString()}원</span>
            </label>`;
            if (!firstAvailable) firstAvailable = { type: 'one_time', price: data.tickets.price_one_time };
        }
        if (data.tickets.price_multi && data.tickets.pass_count) {
            optionsHtml += `<label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                <span><input type="radio" name="passType" value="multi" data-price="${data.tickets.price_multi}" data-count="${data.tickets.pass_count}" style="margin-right:8px;">다회권 (${data.tickets.pass_count}회)</span>
                <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_multi.toLocaleString()}원</span>
            </label>`;
            if (!firstAvailable) firstAvailable = { type: 'multi', price: data.tickets.price_multi };
        }
        if (data.tickets.price_monthly) {
            optionsHtml += `<label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                <span><input type="radio" name="passType" value="monthly" data-price="${data.tickets.price_monthly}" style="margin-right:8px;">월정액(구독) 패스</span>
                <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_monthly.toLocaleString()}원/월</span>
            </label>`;
            if (!firstAvailable) firstAvailable = { type: 'monthly', price: data.tickets.price_monthly };
        }
        optionsHtml += '</div>';

        if (firstAvailable) {
            passOptionsContainer.style.display = 'block';
            passOptionsContainer.innerHTML = optionsHtml;
            passOptionsContainer.querySelectorAll('input[name="passType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    selectedPassType = e.target.value;
                    selectedPassPrice = parseInt(e.target.dataset.price, 10);
                    document.getElementById('viewPrice').textContent = selectedPassPrice.toLocaleString() + '원';
                    document.getElementById('priceInstallment').textContent = '';
                });
            });
            const firstRadio = passOptionsContainer.querySelector('input[name="passType"]');
            if (firstRadio) { firstRadio.checked = true; firstRadio.dispatchEvent(new Event('change')); }
        }
    } else {
        if (price === 0) {
            document.getElementById('viewPrice').innerHTML = '<span style="display:inline-block; padding:4px 12px; background:rgba(76,201,240,0.1); border:1px solid rgba(76,201,240,0.4); color:#4cc9f0; border-radius:12px; font-weight:700; font-size:1.1rem;">무료 수강</span>';
            document.getElementById('priceInstallment').textContent = '';
        } else {
            // 할인율 렌더링 적용 (D1 DB 데이터 참조)
            const discountRate = data.discount_rate || 0;
            if (discountRate === 100) {
                // 100% 할인일 경우 특별 배지
                document.getElementById('viewPrice').innerHTML = `
                    <span style="font-size: 0.9rem; color: #888; text-decoration: line-through; margin-right: 8px;">${price.toLocaleString()}원</span>
                    <span style="display:inline-block; padding:4px 12px; background:rgba(255,62,62,0.1); border:1px solid rgba(255,62,62,0.4); color:#ff3e3e; border-radius:12px; font-weight:700; font-size:1.1rem;">전액 무료 혜택</span>
                `;
                document.getElementById('priceInstallment').textContent = '결제 금액 0원';
            } else if (discountRate > 0) {
                const discountedPrice = Math.floor(price * (1 - discountRate / 100));
                document.getElementById('viewPrice').innerHTML = `
                    <span style="font-size: 1rem; color: #888; text-decoration: line-through; margin-right: 8px;">${price.toLocaleString()}원</span>
                    <span style="color: #ff3e3e; margin-right: 8px; font-weight: bold;">${discountRate}%</span>
                    <span style="font-size: 1.4rem; font-weight: 800; color: #fff;">${discountedPrice.toLocaleString()}원</span>
                `;
                document.getElementById('priceInstallment').textContent = `월 ${(Math.floor(discountedPrice / 5)).toLocaleString()}원 (5개월 할부 시)`;
            } else {
                document.getElementById('viewPrice').textContent = price.toLocaleString() + '원';
                document.getElementById('priceInstallment').textContent = `월 ${(Math.floor(price / 5)).toLocaleString()}원 (5개월 할부 시)`;
            }
        }
    }

    // 소개 탭: description HTML
    const descViewer = document.getElementById('descriptionViewer');
    if (descViewer && data.description) {
        descViewer.innerHTML = data.description.replace(/\n/g, '<br>');
    }

    // 다중 이미지 슬라이더
    const images = data.image_urls && data.image_urls.length > 0 ? data.image_urls : (data.image_url ? [data.image_url] : []);
    const slider = document.getElementById('imageSlider');
    const counter = document.querySelector('.slider-counter');
    const prevBtn = document.querySelector('.slider-btn.prev');
    const nextBtn = document.querySelector('.slider-btn.next');

    if (slider && images.length > 0) {
        slider.innerHTML = images.map((src, i) => `
            <div class="slider-item${i === 0 ? ' active' : ''}" style="${i !== 0 ? 'display:none;' : ''}">
                <img src="${src}" alt="클래스 이미지 ${i + 1}" style="width:100%; height:100%; object-fit:cover;">
            </div>
        `).join('');

        let currentSlide = 0;
        const totalSlides = images.length;
        if (counter) counter.textContent = `1 / ${totalSlides}`;

        function goToSlide(idx) {
            const items = slider.querySelectorAll('.slider-item');
            items.forEach(item => item.style.display = 'none');
            items[idx].style.display = 'block';
            currentSlide = idx;
            if (counter) counter.textContent = `${idx + 1} / ${totalSlides}`;
        }

        if (prevBtn) prevBtn.addEventListener('click', () => goToSlide((currentSlide - 1 + totalSlides) % totalSlides));
        if (nextBtn) nextBtn.addEventListener('click', () => goToSlide((currentSlide + 1) % totalSlides));
    }
}

function updateEnrollmentUI() {
    const btn = document.getElementById('btnEnroll');
    const myPassStatus = document.getElementById('myPassStatus');
    const myPassCountVal = document.getElementById('myPassCountVal');

    if (myPassStatus && userPassCount > 0) {
        myPassStatus.style.display = 'block';
        myPassCountVal.textContent = userPassCount;
    }
    if (isMonthlySubscribed && myPassStatus) {
        myPassStatus.style.display = 'block';
        myPassStatus.innerHTML = `🌟 프리미엄 월정액 구독 중`;
    }

    if (btn) {
        if (classData && classData.tickets) {
            btn.textContent = "수강권(패스) 구매하기";
            btn.disabled = false;
        } else if (isEnrolled && !window.__BSQ_DEV_MODE__) {
            btn.textContent = "✓ 수강 중인 클래스";
            btn.style.background = "#2a2a2a";
            btn.style.color = "#888";
            btn.style.boxShadow = "none";
            btn.disabled = true;
            btn.style.cursor = "default";
        }
    }
}
