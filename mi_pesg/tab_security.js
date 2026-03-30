window.initSecurityTab = function (userId) {
    const passwordForm = document.getElementById('passwordForm');
    const mfaToggle = document.getElementById('mfaToggle');
    const languageSelect = document.getElementById('languageSelect');
    const themeSelect = document.getElementById('themeSelect');

    async function loadSecurityState() {
        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (!res?.success || !res.data) return;

            if (mfaToggle) mfaToggle.checked = !!res.data.mfa_active;
            if (languageSelect) {
                languageSelect.value = res.data.preferred_language || localStorage.getItem('bsq_language') || 'ko';
            }
            if (themeSelect) {
                themeSelect.value = res.data.preferred_theme || localStorage.getItem('bsq_theme') || 'dark';
            }
            window.BSQ.applyPreferences?.({
                language: languageSelect?.value || res.data.preferred_language || 'ko',
                theme: themeSelect?.value || res.data.preferred_theme || 'dark',
            });
        } catch (error) {
            console.warn('[tab_security] state load failed:', error);
            if (languageSelect) languageSelect.value = localStorage.getItem('bsq_language') || 'ko';
            if (themeSelect) themeSelect.value = localStorage.getItem('bsq_theme') || 'dark';
        }
    }

    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value.trim();
            const confirmPassword = document.getElementById('confirmPassword').value.trim();

            if (newPassword !== confirmPassword) {
                showMypageNotice?.('error', '입력 확인', '비밀번호가 일치하지 않습니다.');
                return;
            }
            if (newPassword.length < 6) {
                showMypageNotice?.('error', '비밀번호 규칙', '비밀번호는 6자리 이상이어야 합니다.');
                return;
            }

            try {
                const res = await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ new_password: newPassword }),
                });

                if (res && res.success) {
                    passwordForm.reset();
                    showMypageNotice?.('success', '비밀번호 변경 완료', '비밀번호가 변경되었습니다.');
                } else {
                    throw new Error(res?.error || '변경에 실패했습니다.');
                }
            } catch (error) {
                showMypageNotice?.('error', '비밀번호 변경 실패', error.message);
            }
        };
    }

    if (mfaToggle) {
        mfaToggle.onchange = async (e) => {
            try {
                await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ mfa_active: e.target.checked ? 1 : 0 }),
                });
                showMypageNotice?.(
                    'success',
                    '보안 설정 저장 완료',
                    e.target.checked ? '2단계 인증이 활성화되었습니다.' : '2단계 인증이 해제되었습니다.'
                );
            } catch (error) {
                showMypageNotice?.('error', '보안 설정 저장 실패', error.message);
                mfaToggle.checked = !e.target.checked;
            }
        };
    }

    async function persistPreferences(payload) {
        const updates = {};
        if (payload.preferred_language) updates.preferred_language = payload.preferred_language;
        if (payload.preferred_theme) updates.preferred_theme = payload.preferred_theme;

        if (Object.keys(updates).length) {
            await window.BSQ.api(`/api/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(updates),
            });
        }

        if (updates.preferred_language) localStorage.setItem('bsq_language', updates.preferred_language);
        if (updates.preferred_theme) localStorage.setItem('bsq_theme', updates.preferred_theme);
        window.BSQ.applyPreferences?.({
            language: updates.preferred_language || languageSelect?.value,
            theme: updates.preferred_theme || themeSelect?.value,
        });
    }

    languageSelect?.addEventListener('change', async () => {
        try {
            await persistPreferences({ preferred_language: languageSelect.value });
            showMypageNotice?.('success', '언어 설정 저장', '언어 설정이 저장되었습니다.');
        } catch (error) {
            showMypageNotice?.('error', '언어 설정 실패', error.message || '언어 저장에 실패했습니다.');
        }
    });

    themeSelect?.addEventListener('change', async () => {
        try {
            await persistPreferences({ preferred_theme: themeSelect.value });
            showMypageNotice?.('success', '테마 저장 완료', '테마가 저장되었습니다.');
        } catch (error) {
            showMypageNotice?.('error', '테마 설정 실패', error.message || '테마 저장에 실패했습니다.');
        }
    });

    loadSecurityState();
    loadPaymentHistory(userId);
};

async function loadPaymentHistory(userId) {
    const historyList = document.getElementById('paymentHistoryList');
    if (!historyList) return;

    try {
        let enrollments = [];
        const bootCache = window.__BSQ_MYPAGE_CACHE__ || {};
        if (bootCache.userId === userId && Array.isArray(bootCache.payments)) {
            enrollments = bootCache.payments;
        } else if (window.__BSQ_MYPAGE_BOOT_PROMISE__) {
            await window.__BSQ_MYPAGE_BOOT_PROMISE__;
            const readyCache = window.__BSQ_MYPAGE_CACHE__ || {};
            if (readyCache.userId === userId && Array.isArray(readyCache.payments)) {
                enrollments = readyCache.payments;
            } else {
                const res = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
                enrollments = res?.success ? (res.data?.enrollments || res.data || []) : [];
                window.__BSQ_MYPAGE_CACHE__ = {
                    ...(window.__BSQ_MYPAGE_CACHE__ || {}),
                    userId,
                    payments: enrollments,
                    updatedAt: Date.now(),
                };
            }
        } else {
            const res = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
            enrollments = res?.success ? (res.data?.enrollments || res.data || []) : [];
        }

        if (!enrollments || enrollments.length === 0) {
            historyList.innerHTML = '<p class="empty-state compact">결제 내역이 없습니다.</p>';
            return;
        }

        historyList.innerHTML = enrollments.map((info) => {
            const date = info.enrolled_at
                ? new Date(info.enrolled_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                })
                : '-';

            const amount = Number(info.amount || info.final_amount || 0);
            const amountText = amount === 0 ? '무료' : `${amount.toLocaleString()}원`;

            const statusMap = {
                paid: { label: '결제 완료', color: '#10b981' },
                enrolled: { label: '수강 중', color: '#3b82f6' },
                refunded: { label: '환불 완료', color: '#f59e0b' },
                cancelled: { label: '취소됨', color: '#ef4444' },
            };
            const status = statusMap[info.status] || { label: info.status || '수강 중', color: '#3b82f6' };

            const payMethodMap = {
                card: '카드',
                free: '무료',
                trans: '계좌이체',
            };
            const payMethod = payMethodMap[info.pay_method] || info.pay_method || '무료';

            return `
                <article class="payment-history-item">
                    <div class="payment-history-head">
                        <div class="payment-history-title">
                            <strong>${info.title || info.class_title || info.class_id}</strong>
                            <p class="payment-history-meta">${date} · ${payMethod}</p>
                        </div>
                        <strong class="payment-history-amount">${amountText}</strong>
                    </div>
                    <span class="payment-history-state state-${info.status || 'paid'}">${status.label}</span>
                </article>
            `;
        }).join('');
    } catch (err) {
        console.error('Payment history load error:', err);
        historyList.innerHTML = '<p class="empty-state compact error">결제 내역을 불러오지 못했습니다.</p>';
    }
}
