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

    // 2. 세션 및 프로필 확인
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userMenu = document.getElementById('userMenu');

    if (session) {
        userId = session.user.id;
        const { data: profile } = await supabaseClient.from('users').select('*').eq('id', userId).maybeSingle();
        userProfile = profile;

        if (userMenu) {
            // [SYNC] Header UI with main.js
            const profileImgUrl = profile?.profile_image_url;
            const userName = profile?.name || '사용자';

            userMenu.innerHTML = `
                <a href="../mi_pesg/mypage.html" class="user-profile-btn">
                    <div class="user-avatar" id="headerAvatar" style="${profileImgUrl ? `background-image: url(${profileImgUrl})` : ''}">${!profileImgUrl ? '👤' : ''}</div>
                    <span class="user-name">${userName} 님</span>
                </a>
                <button type="button" id="btnLogout" style="color:var(--text-secondary); font-size: 0.8rem; margin-left: 5px; background:none; border:none; cursor:pointer;">로그아웃</button>
            `;

            document.getElementById('btnLogout').onclick = async () => {
                await supabaseClient.auth.signOut();
                location.reload();
            };
        }
    } else {
        if (userMenu) {
            userMenu.innerHTML = `<a href="../login/login.html" class="btn-login-main">로그인</a>`;
        }
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
            renderCorePageInfo(classData);

            // 모듈형 스크립트 호출 (ID 기반 렌더링)
            if (window.BSquareModules) {
                if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
                if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);

                // 수강 신청 여부 확인 후 리뷰/채팅 초기화
                const enrollSnap = await db.ref(`enrollments/${userId}/${classId}`).once('value');
                isEnrolled = enrollSnap.exists();

                if (window.BSquareModules.initReviews) window.BSquareModules.initReviews(db, classId, userId, supabaseClient);
                if (window.BSquareModules.initChat) window.BSquareModules.initChat(db, classId, userId, supabaseClient, isEnrolled);

                updateEnrollmentUI();
            }
        } else {
            alert("클래스 정보를 찾을 수 없습니다.");
        }
    } catch (err) {
        console.error("Initialization Error:", err);
    }

    // 4. 탭 전환 이벤트
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.target;
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(target).classList.add('active');
        };
    });

    // 5. 결제 버튼 이벤트 연결
    document.getElementById('btnEnroll')?.addEventListener('click', handlePayment);

    // 6. 무료 클래스 모달 이벤트
    document.getElementById('btnFreeCancel')?.addEventListener('click', () => {
        document.getElementById('freeEnrollModal')?.classList.remove('active');
    });
    document.getElementById('btnFreeConfirm')?.addEventListener('click', handleFreeEnrollment);
});

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
            class_title: classData?.title || '',
            pay_method: 'free'
        });

        isEnrolled = true;
        updateEnrollmentUI();

        showToast('success', '수강 신청 완료! 🎉', `"${classData?.title}" 클래스를 무료로 시작합니다.`);
    } catch (err) {
        console.error("Free enrollment error:", err);
        showToast('error', '수강 신청 실패', '문제가 발생했습니다. 다시 시도해 주세요.');
    } finally {
        setButtonLoading(false);
    }
}

// ===== 결제 처리 (PortOne) =====
async function handlePayment() {
    if (!userId) {
        showToast('info', '로그인이 필요합니다', '결제를 진행하려면 먼저 로그인해 주세요.');
        setTimeout(() => {
            window.location.href = '../login/login.html';
        }, 1500);
        return;
    }
    if (isEnrolled) {
        showToast('info', '이미 수강 중', '이미 수강 중인 클래스입니다.');
        return;
    }

    const price = classData.price || 0;

    // 무료 클래스: 결제창 대신 확인 모달 표시
    if (price === 0) {
        const modalText = document.getElementById('freeModalText');
        if (modalText) {
            modalText.textContent = `"${classData.title}" 클래스는 무료입니다. 바로 수강을 시작하시겠습니까?`;
        }
        document.getElementById('freeEnrollModal')?.classList.add('active');
        return;
    }

    // 유료 클래스: PortOne 결제창 호출
    setButtonLoading(true);
    showPaymentOverlay();

    const { IMP } = window;
    if (!IMP) {
        hidePaymentOverlay();
        setButtonLoading(false);
        showToast('error', '결제 모듈 오류', '결제 모듈을 불러올 수 없습니다. 페이지를 새로고침 해주세요.');
        return;
    }

    IMP.init('imp00052118');

    const merchantUid = `order_${classId}_${new Date().getTime()}`;

    IMP.request_pay({
        pg: "html5_inicis.INIpayTest",
        pay_method: "card",
        merchant_uid: merchantUid,
        name: classData.title,
        amount: price,
        buyer_email: userProfile?.email || "",
        buyer_name: userProfile?.name || "구매자",
        buyer_tel: userProfile?.phone || "010-0000-0000",
    }, async function (rsp) {
        hidePaymentOverlay();

        if (rsp.success) {
            try {
                const db = firebase.database();
                await db.ref(`enrollments/${userId}/${classId}`).set({
                    enrolled_at: firebase.database.ServerValue.TIMESTAMP,
                    payment_id: rsp.imp_uid,
                    merchant_uid: rsp.merchant_uid,
                    amount: rsp.paid_amount || price,
                    paid_at: rsp.paid_at || null,
                    receipt_url: rsp.receipt_url || null,
                    pay_method: rsp.pay_method || 'card',
                    card_name: rsp.card_name || '',
                    status: 'paid',
                    class_title: classData?.title || ''
                });

                isEnrolled = true;
                updateEnrollmentUI();

                showToast('success', '결제 완료! 🎉', `"${classData.title}" 클래스 수강이 시작됩니다.`);
            } catch (err) {
                console.error("Enrollment save error:", err);
                showToast('error', '등록 오류', '결제는 완료되었으나 수강 등록에 문제가 발생했습니다. 고객센터에 문의해 주세요.');
            }
        } else {
            // 사용자가 결제를 취소한 경우 별도 처리
            if (rsp.error_msg && rsp.error_msg.includes('취소')) {
                showToast('info', '결제 취소', '결제가 취소되었습니다.');
            } else {
                showToast('error', '결제 실패', rsp.error_msg || '알 수 없는 오류가 발생했습니다.');
            }
        }

        setButtonLoading(false);
    });
}

function renderCorePageInfo(data) {
    document.getElementById('viewTitle').textContent = data.title;
    document.getElementById('sidebarTitle').textContent = data.title;
    document.getElementById('viewCategory').textContent = data.category || '기타';
    document.getElementById('sidebarCategory').textContent = data.category || '기타';

    const price = data.price || 0;

    if (price === 0) {
        document.getElementById('viewPrice').textContent = '무료';
        document.getElementById('priceInstallment').textContent = '';
    } else {
        document.getElementById('viewPrice').textContent = price.toLocaleString() + '원';
        document.getElementById('priceInstallment').textContent = `월 ${(Math.floor(price / 5)).toLocaleString()}원 (5개월 할부 시)`;
    }

    const mainImg = document.getElementById('mainImg');
    if (mainImg && data.image_url) {
        mainImg.src = data.image_url;
    }
}

function updateEnrollmentUI() {
    const btn = document.getElementById('btnEnroll');
    if (btn && isEnrolled) {
        btn.textContent = "✓ 수강 중인 클래스";
        btn.style.background = "#2a2a2a";
        btn.style.color = "#888";
        btn.style.boxShadow = "none";
        btn.disabled = true;
        btn.style.cursor = "default";
    }
}
