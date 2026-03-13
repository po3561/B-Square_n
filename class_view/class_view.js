/* class_view.js - Modular Orchestrator & Payment Controller */

// --- Database Configuration (Original) ---
const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
const firebaseConfig = {
    apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
    authDomain: "b-square-39b11.firebaseapp.com",
    databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
    projectId: "b-square-39b11",
    storageBucket: "b-square-39b11.firebasestorage.app",
    messagingSenderId: "1012056920961",
    appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
};

const urlParams = new URLSearchParams(window.location.search);
const classId = urlParams.get('id');
let userId = null;
let userProfile = null;
let classData = null;
let isEnrolled = false;
let supabaseClient = null;
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

    // 1. 초기화
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    const db = firebase.database();

    // Firebase DB 쓰기 권한(auth != null)을 위한 익명 로그인 추가
    if (typeof firebase.auth === 'function') {
        firebase.auth().onAuthStateChanged(user => {
            if (!user) {
                firebase.auth().signInAnonymously().catch(err => console.warn("Anon Auth Error:", err));
            }
        });
    }

    // 2. 세션 확인 — onAuthStateChange로 안정적으로 대기
    function waitForSession() {
        return new Promise((resolve) => {
            // 먼저 getSession 시도
            supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    console.log('✅ getSession 성공:', session.user.email);
                    resolve(session);
                    return;
                }
                // getSession 실패 시 onAuthStateChange 대기
                console.log('⏳ getSession null — onAuthStateChange 대기...');
                const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
                    if (session) {
                        console.log('✅ onAuthStateChange 성공:', session.user.email);
                        subscription.unsubscribe();
                        resolve(session);
                    }
                });
                // 3초 후 타임아웃
                setTimeout(() => {
                    subscription.unsubscribe();
                    console.warn('⚠️ 세션 대기 타임아웃 — 미로그인으로 진행');
                    resolve(null);
                }, 3000);
            });
        });
    }

    const session = await waitForSession();
    const isOperator = window.__BSQ_DEV_MODE__ === true;

    if (session || isOperator) {
        userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
        console.log('🔑 로그인 확인 — userId:', userId, '| email:', session?.user?.email);

        if (isOperator) {
            userProfile = { name: '운영자', profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png' };
        } else {
            const { data: profile } = await supabaseClient.from('users').select('*').eq('id', userId).maybeSingle();
            userProfile = profile;
        }
    } else {
        console.warn('⚠️ 미로그인 상태');
    }

    // 3. 클래스 데이터 로드 및 모듈 초기화
    try {
        const fbSnap = await db.ref(`classes/${classId}`).once('value');
        classData = fbSnap.val();

        if (!classData) {
            const { data: sbData } = await supabaseClient.from('classes').select('*').eq('id', classId).single();
            classData = sbData;
        }

        if (classData) {
            // 강사 판별 (1. creator_id 매치, 2. 서브 강사, 3. creator_email 폴백)
            isInstructor = !!(userId && classData.creator_id && userId === classData.creator_id);

            // 서브 강사 체크
            if (!isInstructor && userId && Array.isArray(classData.sub_instructors)) {
                isInstructor = classData.sub_instructors.some(si => si.id === userId);
            }

            // creator_email 폴백 (기존 클래스 호환)
            if (!isInstructor && session && session.user && classData.creator_email) {
                if (session.user.email === classData.creator_email) {
                    isInstructor = true;
                    console.log('✅ creator_email 매치로 강사 판별');
                }
            }

            // ★ 총괄 개발자: 모든 클래스에서 강사 + 수강생 권한 강제 부여
            if (window.__BSQ_DEV_MODE__) {
                isInstructor = true;
                isEnrolled = true;
                console.log('🛡️ 개발자 모드: 강사/수강 권한 강제 부여');
            }

            console.log("👨‍🏫 강사 판별:", {
                userId,
                creator_id: classData.creator_id,
                creator_email: classData.creator_email,
                session_email: session?.user?.email,
                isInstructor,
                devMode: !!window.__BSQ_DEV_MODE__
            });

            renderCorePageInfo(classData);

            // 채팅 헤더 미니 로고 및 버튼 초기화
            const logoMini = document.getElementById('chatLogoMini');
            if (logoMini && classData.thumbnail_url) {
                logoMini.style.backgroundImage = `url(${classData.thumbnail_url})`;
            }
            document.getElementById('btnGoToClass')?.addEventListener('click', () => {
                const introTab = document.querySelector('[data-target="tabIntro"]');
                introTab?.click();
            });
            document.getElementById('btnChatInfo')?.addEventListener('click', () => {
                document.getElementById('commInfoPanel')?.classList.toggle('active');
            });

            // 모듈형 스크립트 호출
            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);

                // 수강 신청 여부 확인 (userId가 있을 때만)
                if (userId && !window.__BSQ_DEV_MODE__) {
                    try {
                        const enrollSnap = await db.ref(`enrollments/${userId}/${classId}`).once('value');
                        isEnrolled = enrollSnap.exists();

                        // 현재 수강권 상태 확인
                        const passSnap = await db.ref(`user_passes/${userId}/${classId}`).once('value');
                        const passInfo = passSnap.val();
                        if (passInfo) {
                            userPassCount = passInfo.count || 0;
                            isMonthlySubscribed = !!passInfo.monthly;
                            // 수강권이 하나라도 있으면 권한 부여
                            if (userPassCount > 0 || isMonthlySubscribed) isEnrolled = true;
                        }
                    } catch (enrollErr) {
                        console.warn("수강 상태 확인 실패:", enrollErr);
                        isEnrolled = false;
                    }
                }

                // 강사 및 운영자(개발자 모드)는 자동으로 모든 권한 부여
                const hasAccess = isEnrolled || isInstructor || window.__BSQ_DEV_MODE__;
                console.log("🔑 권한 상태:", { isEnrolled, isInstructor, hasAccess });

                if (window.BSquareModules.initReviews) window.BSquareModules.initReviews(db, classId, userId, supabaseClient, hasAccess, isInstructor);
                if (window.BSquareModules.initChat) window.BSquareModules.initChat(db, classId, userId, supabaseClient, hasAccess, isInstructor);
                if (window.BSquareModules.initNotice) window.BSquareModules.initNotice(db, classId, userId, supabaseClient, hasAccess, isInstructor);

                updateEnrollmentUI();

                // 강사/운영자: '페이지 수정' 탭 표시 + 모듈 초기화
                if (isInstructor || window.__BSQ_DEV_MODE__) {
                    console.log("✅ 강사/운영자 모드 활성화 - 수정 탭 표시");
                    const editTabBtn = document.getElementById('tabEditBtn');
                    if (editTabBtn) editTabBtn.style.display = 'inline-block';
                    if (window.BSquareModules.initEdit) window.BSquareModules.initEdit(db, classId, classData, supabaseClient, userId);
                }

                // Dev Mode 이벤트 리스너 (후발적 활성화 대응)
                window.addEventListener('bsq_dev_mode_activated', () => {
                    const editTabBtn = document.getElementById('tabEditBtn');
                    if (editTabBtn) editTabBtn.style.display = 'inline-block';
                    if (window.BSquareModules.initEdit && classData) {
                        window.BSquareModules.initEdit(db, classId, classData, supabaseClient, userId);
                    }
                });
            }
        } else {
            alert("클래스 정보를 찾을 수 없습니다.");
        }
    } catch (err) {
        console.error("Initialization Error:", err);
    }

    // 4. 탭 전환 (마이페이지와 동일 방식 - 새로고침 없음)
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            // 탭 버튼 활성화 전환
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 탭 콘텐츠 활성화 전환
            tabContents.forEach(t => t.classList.remove('active'));
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('active');

            // [Layout Fix] 채팅 탭일 때 사이드바 숨김 및 폭 확장
            const grid = document.querySelector('.view-grid');
            const sidebar = document.querySelector('.view-sidebar');
            if (grid && sidebar) {
                if (targetId === 'tabChat') {
                    grid.style.gridTemplateColumns = '1fr';
                    sidebar.style.display = 'none';
                    // 채팅 영역 강제 flex 활성화 (짤림 방지)
                    const unlocked = document.getElementById('chatUnlocked');
                    const activeArea = document.getElementById('chatActiveArea');
                    if (unlocked) unlocked.style.display = 'flex';
                    if (activeArea) activeArea.style.display = 'flex';
                } else {
                    grid.style.gridTemplateColumns = '1fr 380px';
                    sidebar.style.display = 'block';
                }
            }
        });
    });

    // 5. 결제 팝업 (Toss UI) 이벤트 연결
    document.getElementById('btnEnroll')?.addEventListener('click', openPaymentBottomSheet);
    document.getElementById('btnSheetClose')?.addEventListener('click', closePaymentBottomSheet);

    // 결제창 내부 이벤트
    document.querySelectorAll('input[name="payOption"]').forEach(radio => {
        radio.addEventListener('change', updatePaymentSummary);
    });
    document.getElementById('btnApplyCoupon')?.addEventListener('click', applyCoupon);
    document.getElementById('btnTossPayStart')?.addEventListener('click', executeTossPayment);

    // 6. 무료 클래스 모달 이벤트
    document.getElementById('btnFreeCancel')?.addEventListener('click', () => {
        document.getElementById('freeEnrollModal')?.classList.remove('active');
    });
    document.getElementById('btnFreeConfirm')?.addEventListener('click', handleFreeEnrollment);

    // 7. 수강권 사용 이벤트
    document.getElementById('btnUsePass')?.addEventListener('click', usePass);

    // 8. 마우스 위치에 따른 스크롤 제어 (채팅창 내부 스크롤 격리)
    const tabChat = document.getElementById('tabChat');
    if (tabChat) {
        tabChat.addEventListener('mouseenter', () => {
            document.body.style.overflow = 'hidden';
            console.log("🔒 Body scroll locked (Chat hovered)");
        });
        tabChat.addEventListener('mouseleave', () => {
            document.body.style.overflow = '';
            console.log("🔓 Body scroll unlocked (Chat left)");
        });
    }
});

async function usePass() {
    if (!userId || userId === 'OPERATOR_GHOST') return;
    if (userPassCount <= 0) {
        showToast('error', '수강권 부족', '보유하신 수강권이 없습니다. 충전 후 이용해주세요.');
        return;
    }

    if (!confirm('수강권 1회를 사용하시겠습니까?')) return;

    const btn = document.getElementById('btnUsePass');
    btn.disabled = true;
    btn.textContent = '처리 중...';

    try {
        const db = firebase.database();
        const passRef = db.ref(`user_passes/${userId}/${classId}`);
        
        // 1. 차감
        userPassCount--;
        await passRef.update({
            count: userPassCount,
            updated_at: firebase.database.ServerValue.TIMESTAMP
        });

        // 2. 로그 기록
        await passRef.child('logs').push({
            type: 'usage',
            amount: -1,
            remaining: userPassCount,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            note: '사용자 직접 사용'
        });

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

// ===== 무료 클래스 수강 등록 =====
async function handleFreeEnrollment() {
    const modal = document.getElementById('freeEnrollModal');
    modal?.classList.remove('active');

    setButtonLoading(true);

    try {
        const db = firebase.database();
        await db.ref(`enrollments/${userId}/${classId}`).set({
            enrolled_at: firebase.database.ServerValue.TIMESTAMP,
            payment_id: 'FREE',
            merchant_uid: `free_${new Date().getTime()}`,
            amount: 0,
            status: 'enrolled',
            title: classData?.title || '',
            image_url: classData?.image_url || '',
            category: classData?.category || '',
            class_id: classId,
            pay_method: 'free'
        });

        isEnrolled = true;
        updateEnrollmentUI();

        showToast('success', '수강 신청 완료! 🎉', `"${classData?.title}" 클래스를 무료로 시작합니다.`);
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        console.error("Free enrollment error:", err);
        showToast('error', '수강 신청 실패', '문제가 발생했습니다. 다시 시도해 주세요.');
    } finally {
        setButtonLoading(false);
    }
}

// ===== 결제 팝업 (Toss Style) 로직 =====
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
        if (modalText) {
            modalText.textContent = `"${classData.title}" 클래스는 무료입니다. 바로 수강을 시작하시겠습니까?`;
        }
        document.getElementById('freeEnrollModal')?.classList.add('active');
        return;
    }

    // 바텀 시트 초기화 (가격 세팅)
    const baseP = classData.price || 10000;
    document.getElementById('optPriceMonthly').textContent = `${baseP.toLocaleString()}원/월`;
    document.getElementById('optPrice30Days').textContent = `${(baseP * 1.5).toLocaleString()}원`;
    document.getElementById('optPriceOneTime').textContent = `${baseP.toLocaleString()}원`;

    document.getElementById('paymentBottomSheet').style.display = 'flex';
    document.querySelector('input[name="payOption"][value="onetime"]').checked = true;

    // 초기 요약 창 계산
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
    const selected = document.querySelector('input[name="payOption"]:checked').value;

    if (selected === 'monthly') currentBasePrice = baseP;
    else if (selected === '30days') currentBasePrice = baseP * 1.5;
    else currentBasePrice = baseP;

    // 적용된 쿠폰이 있다면 재계산 로직 생략(단순화)하거나, 적용 해제 처리할 수 있음.
    // 여기서는 할인 금액을 그대로 뺌. (음수 보정)
    finalPaymentPrice = Math.max(0, currentBasePrice - currentDiscountAmount);

    document.getElementById('summaryOriginalPrice').textContent = `${currentBasePrice.toLocaleString()}원`;
    document.getElementById('summaryFinalPrice').textContent = `${finalPaymentPrice.toLocaleString()}원`;
}

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

        const db = firebase.database();
        const snap = await db.ref(`coupons/${classId}/${code}`).once('value');
        const coupon = snap.val();

        if (!coupon) {
            msgEl.className = 'coupon-msg error';
            msgEl.textContent = '존재하지 않거나 유효하지 않은 쿠폰입니다.';
            btn.disabled = false;
            btn.textContent = '적용';
            return;
        }

        // 수량 체크
        if (coupon.limit_count > 0 && (coupon.used_count || 0) >= coupon.limit_count) {
            msgEl.className = 'coupon-msg error';
            msgEl.textContent = '선착순 사용이 마감된 쿠폰입니다.';
            btn.disabled = false;
            btn.textContent = '적용';
            return;
        }

        // 할인액 계산
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
        if (appliedCouponCode) {
            // 쿠폰으로 인한 0원 결제 처리
            await finalizeEnrollment({
                imp_uid: 'COUPON_FREE',
                merchant_uid: `coupon_${appliedCouponCode}_${new Date().getTime()}`,
                paid_amount: 0,
                paid_at: Math.floor(new Date().getTime() / 1000),
                pay_method: 'coupon'
            });
            return;
        }
        showToast('error', '결제 금액 오류', '0원 이하의 결제는 무료 버튼을 이용해주세요.');
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

    IMP.init('imp14397622'); // 포트원 공용 테스트 가맹점 식별코드
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

// 결제 혹은 쿠폰 사용 후 최종 DB 처리 공통 함수
async function finalizeEnrollment(rsp) {
    setButtonLoading(true);
    try {
        const db = firebase.database();
        const updates = {};
        const selectedOption = document.querySelector('input[name="payOption"]:checked')?.value || 'onetime';

        updates[`enrollments/${userId}/${classId}`] = {
            enrolled_at: firebase.database.ServerValue.TIMESTAMP,
            payment_id: rsp.imp_uid,
            merchant_uid: rsp.merchant_uid,
            amount: rsp.paid_amount || 0,
            paid_at: rsp.paid_at || null,
            receipt_url: rsp.receipt_url || null,
            pay_method: rsp.pay_method || 'card',
            card_name: rsp.card_name || '',
            status: 'paid',
            title: classData?.title || '',
            image_url: classData?.image_url || '',
            category: classData?.category || '',
            class_id: classId,
            pass_type_purchased: selectedOption,
            applied_coupon: appliedCouponCode || null
        };

        // 쿠폰 사용 카운트 증가 처리
        if (appliedCouponCode) {
            const couponRef = db.ref(`coupons/${classId}/${appliedCouponCode}`);
            const cSnap = await couponRef.once('value');
            if (cSnap.exists()) {
                updates[`coupons/${classId}/${appliedCouponCode}/used_count`] = (cSnap.val().used_count || 0) + 1;
            }
        }

        // Supabase 신규 `user_passes` 시스템 연동
        if (supabaseClient && userId) {
            let expiryOffset = null;
            if (selectedOption === 'monthly') expiryOffset = 30;
            else if (selectedOption === '30days') expiryOffset = 30;

            let expDate = null;
            if (expiryOffset) {
                const d = new Date();
                d.setDate(d.getDate() + expiryOffset);
                expDate = d.toISOString();
            }

            const { error: sbError } = await supabaseClient.from('user_passes').insert({
                user_id: userId,
                class_id: classId,
                pass_type: selectedOption,
                remaining_count: selectedOption === 'onetime' ? 1 : 0,
                expires_at: expDate,
                status: 'active'
            });

            if (sbError) console.error("Supabase pass insert error:", sbError);
        }

        await db.ref().update(updates);

        isEnrolled = true;
        updateEnrollmentUI();

        showToast('success', '결제 완료! 🎉', `"${classData.title}" 클래스 수강이 시작됩니다.`);
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        console.error("Enrollment save error:", err);
        showToast('error', '등록 오류', '수강 등록에 문제가 발생했습니다. 고객센터에 문의해 주세요.');
    } finally {
        setButtonLoading(false);
    }
}

function renderCorePageInfo(data) {
    document.getElementById('viewTitle').textContent = data.title;
    document.getElementById('sidebarTitle').textContent = data.title;
    document.getElementById('viewCategory').textContent = data.category || '기타';
    document.getElementById('sidebarCategory').textContent = data.category || '기타';

    const price = data.tickets && selectedPassType ? selectedPassPrice : (data.price || 0);

    // ===== 다회권 / 구독권 UI 렌더링 (사이드바 버전은 삭제, 토스 바텀시트로 대체) =====
    const passOptionsContainer = document.getElementById('passOptionsContainer');
    if (passOptionsContainer) {
        passOptionsContainer.style.display = 'none'; // 하위 UI 대신 바텀시트에서 처리
    }
    if (passOptionsContainer && data.tickets && (data.tickets.price_one_time || data.tickets.price_multi || data.tickets.price_monthly)) {
        let optionsHtml = '<div style="display:flex; flex-direction:column; gap:8px;">';
        let firstAvailable = null;

        if (data.tickets.price_one_time) {
            optionsHtml += `
                <label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                    <span><input type="radio" name="passType" value="one_time" data-price="${data.tickets.price_one_time}" style="margin-right:8px;">1회 수강권</span>
                    <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_one_time.toLocaleString()}원</span>
                </label>`;
            if (!firstAvailable) firstAvailable = { type: 'one_time', price: data.tickets.price_one_time };
        }
        if (data.tickets.price_multi && data.tickets.pass_count) {
            optionsHtml += `
                <label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                    <span><input type="radio" name="passType" value="multi" data-price="${data.tickets.price_multi}" data-count="${data.tickets.pass_count}" style="margin-right:8px;">다회권 (${data.tickets.pass_count}회)</span>
                    <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_multi.toLocaleString()}원</span>
                </label>`;
            if (!firstAvailable) firstAvailable = { type: 'multi', price: data.tickets.price_multi };
        }
        if (data.tickets.price_monthly) {
            optionsHtml += `
                <label style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #444; border-radius:8px; cursor:pointer;">
                    <span><input type="radio" name="passType" value="monthly" data-price="${data.tickets.price_monthly}" style="margin-right:8px;">월정액(구독) 패스</span>
                    <span style="color:var(--comm-accent); font-weight:bold;">${data.tickets.price_monthly.toLocaleString()}원/월</span>
                </label>`;
            if (!firstAvailable) firstAvailable = { type: 'monthly', price: data.tickets.price_monthly };
        }
        optionsHtml += '</div>';

        if (firstAvailable) {
            passOptionsContainer.style.display = 'block';
            passOptionsContainer.innerHTML = optionsHtml;
            // Add change listener
            passOptionsContainer.querySelectorAll('input[name="passType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    selectedPassType = e.target.value;
                    selectedPassPrice = parseInt(e.target.dataset.price, 10);
                    document.getElementById('viewPrice').textContent = selectedPassPrice.toLocaleString() + '원';
                    document.getElementById('priceInstallment').textContent = '';
                });
            });
            // Select first
            const firstRadio = passOptionsContainer.querySelector('input[name="passType"]');
            if (firstRadio) {
                firstRadio.checked = true;
                firstRadio.dispatchEvent(new Event('change'));
            }
        }
    } else {
        if (price === 0) {
            document.getElementById('viewPrice').textContent = '무료';
            document.getElementById('priceInstallment').textContent = '';
        } else {
            document.getElementById('viewPrice').textContent = price.toLocaleString() + '원';
            document.getElementById('priceInstallment').textContent = `월 ${(Math.floor(price / 5)).toLocaleString()}원 (5개월 할부 시)`;
        }
    }

    // ===== 소개 탭: description HTML 렌더링 =====
    const descViewer = document.getElementById('descriptionViewer');
    if (descViewer && data.description) {
        descViewer.innerHTML = data.description.replace(/\n/g, '<br>');
    }

    // ===== 다중 이미지 슬라이더 =====
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
