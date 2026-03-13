// tab_security.js - 보안 및 결제 설정 로직
window.initSecurityTab = function (supabase, userId, db) {
    const passwordForm = document.getElementById('passwordForm');

    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                alert("비밀번호가 일치하지 않습니다.");
                return;
            }

            try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;
                alert("비밀번호가 변경되었습니다.");
                passwordForm.reset();
            } catch (error) {
                alert("변경 실패: " + error.message);
            }
        };
    }

    // MFAToggle 로직
    const mfaToggle = document.getElementById('mfaToggle');
    if (mfaToggle) {
        db.ref(`user_settings/${userId}/mfa_active`).once('value').then(snap => {
            mfaToggle.checked = snap.val() === true;
        });

        mfaToggle.onchange = (e) => {
            db.ref(`user_settings/${userId}/mfa_active`).set(e.target.checked).then(() => {
                alert(e.target.checked ? "2단계 인증이 활성화되었습니다." : "2단계 인증이 해제되었습니다.");
            }).catch(error => {
                alert("설정 저장 실패: " + error.message);
                mfaToggle.checked = !e.target.checked;
            });
        };
    }

    // 결제 수단 관리 (Firebase 연동)
    const paymentList = document.getElementById('paymentMethodsList');
    const btnAddCard = document.getElementById('btnAddCard');

    window.deleteCard = (cardId) => {
        db.ref(`payment_methods/${userId}/${cardId}`).remove().then(() => {
            alert("결제 수단이 삭제되었습니다.");
        });
    };

    if (paymentList) {
        db.ref(`payment_methods/${userId}`).on('value', snap => {
            const data = snap.val();
            if (!data) {
                paymentList.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">등록된 결제 수단이 없습니다.</p>';
                return;
            }

            const cards = Object.entries(data);
            paymentList.innerHTML = cards.map(([id, card]) => `
                <div style="background:rgba(255,255,255,0.03); padding:1.2rem; border-radius:12px; border:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <p style="font-weight:600;">${card.bank} (${card.number})</p>
                        <p style="font-size:0.8rem; color:var(--text-secondary);">${card.isDefault ? '기본 결제 수단' : '보조 수단'}</p>
                    </div>
                    <button class="btn-secondary" onclick="deleteCard('${id}')" style="padding:0.4rem 0.8rem; font-size:0.8rem; color:#ff4757;">삭제</button>
                </div>
            `).join('');
        });
    }

    if (btnAddCard) {
        btnAddCard.onclick = () => {
            const bank = prompt("은행 또는 카드사 이름을 입력하세요 (예: 현대카드, 카카오뱅크)");
            if (!bank) return;
            const number = Math.floor(1000 + Math.random() * 9000); // 가상 카드번호 뒷자리

            db.ref(`payment_methods/${userId}`).once('value').then(snap => {
                const isFirst = !snap.exists() || Object.keys(snap.val() || {}).length === 0;
                db.ref(`payment_methods/${userId}`).push({
                    bank,
                    number: `**** ${number}`,
                    isDefault: isFirst,
                    created_at: Date.now()
                }).then(() => {
                    alert("새로운 결제 수단이 등록되었습니다.");
                });
            });
        };
    }

    // ===== 결제 내역 관리 =====
    loadPaymentHistory(db, userId);
};

// 결제 내역 로드 함수
async function loadPaymentHistory(db, userId) {
    const historyList = document.getElementById('paymentHistoryList');
    if (!historyList || !db) return;

    try {
        const snapshot = await db.ref(`enrollments/${userId}`).once('value');
        const data = snapshot.val();

        if (!data) {
            historyList.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">결제 내역이 없습니다.</p>';
            return;
        }

        const entries = Object.entries(data);

        // 결제일 기준 내림차순 정렬
        entries.sort((a, b) => (b[1].enrolled_at || 0) - (a[1].enrolled_at || 0));

        historyList.innerHTML = entries.map(([classId, info]) => {
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
            const status = statusMap[info.status] || { label: info.status || '확인중', color: '#888' };

            const payMethodMap = {
                'card': '💳 카드',
                'free': '🎁 무료',
                'trans': '🏦 계좌이체',
                'vbank': '🏦 가상계좌'
            };
            const payMethod = payMethodMap[info.pay_method] || info.pay_method || '-';

            const classTitle = info.title || info.class_title || classId;

            return `
                <div class="payment-history-item">
                    <div class="payment-history-left">
                        <p class="payment-history-title">${classTitle}</p>
                        <p class="payment-history-date">${date}</p>
                        <p class="payment-history-method">${payMethod}${info.card_name ? ` (${info.card_name})` : ''}</p>
                    </div>
                    <div class="payment-history-right">
                        <span class="payment-history-amount">${amountText}</span>
                        <span class="payment-history-status" style="color:${status.color}">${status.label}</span>
                        <a href="../class_view/class_view.html?id=${classId}" class="payment-history-link">클래스 보기 →</a>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Payment history load error:", err);
        historyList.innerHTML = '<p style="color:#ef4444; text-align:center; padding:2rem 0;">결제 내역을 불러오는 중 오류가 발생했습니다.</p>';
    }
}

