// tab_security.js - 보안 및 결제 설정 로직 (D1 API 버전)
window.initSecurityTab = function (userId) {
    const passwordForm = document.getElementById('passwordForm');

    // 1. 비밀번호 변경 (D1 API)
    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                alert("비밀번호가 일치하지 않습니다.");
                return;
            }
            if (newPassword.length < 6) {
                alert("비밀번호는 6자리 이상이어야 합니다.");
                return;
            }

            try {
                const res = await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ new_password: newPassword })
                });
                if (res && res.success) {
                    alert("비밀번호가 변경되었습니다.");
                    passwordForm.reset();
                } else {
                    throw new Error(res?.error || '변경 실패');
                }
            } catch (error) {
                alert("변경 실패: " + error.message);
            }
        };
    }

    // 2. MFA Toggle (D1 API 기반 사용자 설정)
    const mfaToggle = document.getElementById('mfaToggle');
    if (mfaToggle) {
        // 현재 설정 로드
        window.BSQ.api(`/api/users/${userId}`).then(res => {
            if (res?.success && res.data) {
                mfaToggle.checked = !!res.data.mfa_active;
            }
        }).catch(() => {});

        mfaToggle.onchange = async (e) => {
            try {
                await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ mfa_active: e.target.checked ? 1 : 0 })
                });
                alert(e.target.checked ? "2단계 인증이 활성화되었습니다." : "2단계 인증이 해제되었습니다.");
            } catch (error) {
                alert("설정 저장 실패: " + error.message);
                mfaToggle.checked = !e.target.checked;
            }
        };
    }

    // 3. 결제 내역 로드 (D1 API)
    loadPaymentHistory(userId);
};

async function loadPaymentHistory(userId) {
    const historyList = document.getElementById('paymentHistoryList');
    if (!historyList) return;

    try {
        const res = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
        const enrollments = res?.success ? (res.data?.enrollments || res.data || []) : [];

        if (!enrollments || enrollments.length === 0) {
            historyList.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">결제 내역이 없습니다.</p>';
            return;
        }

        historyList.innerHTML = enrollments.map(info => {
            const date = info.enrolled_at ? new Date(info.enrolled_at).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric'
            }) : '-';

            const amount = info.amount || 0;
            const amountText = amount === 0 ? '무료' : `${amount.toLocaleString()}원`;

            const statusMap = {
                'paid': { label: '결제완료', color: '#10b981' },
                'enrolled': { label: '수강중', color: '#3b82f6' },
                'refunded': { label: '환불완료', color: '#f59e0b' },
                'cancelled': { label: '취소됨', color: '#ef4444' }
            };
            const status = statusMap[info.status] || { label: info.status || '수강중', color: '#3b82f6' };

            const payMethodMap = {
                'card': '💳 카드',
                'free': '🎁 무료',
                'trans': '🏦 계좌이체'
            };
            const payMethod = payMethodMap[info.pay_method] || info.pay_method || '무료';

            return `
                <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:12px; border:1px solid var(--glass-border,rgba(255,255,255,0.1)); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <p style="font-weight:600;">${info.title || info.class_id}</p>
                        <p style="font-size:0.8rem; color:#888;">${date} · ${payMethod}</p>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-weight:700;">${amountText}</span><br>
                        <span style="font-size:0.8rem; color:${status.color};">${status.label}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Payment history load error:", err);
        historyList.innerHTML = '<p style="color:#ef4444; text-align:center; padding:2rem 0;">결제 내역을 불러오는 중 오류가 발생했습니다.</p>';
    }
}
