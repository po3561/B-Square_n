window.initSecurityTab = function (userId) {
    const passwordForm = document.getElementById('passwordForm');
    const mfaToggle = document.getElementById('mfaToggle');
    const languageSelect = document.getElementById('languageSelect');
    const themeSelect = document.getElementById('themeSelect');
    const marketingSmsToggle = document.getElementById('marketingSmsConsentToggle');
    const marketingEmailToggle = document.getElementById('marketingEmailConsentToggle');

    function syncStoredUserPreference(patch) {
        try {
            const raw = localStorage.getItem('bsq_user');
            const current = raw ? JSON.parse(raw) : {};
            const next = { ...(current || {}), ...(patch || {}) };
            localStorage.setItem('bsq_user', JSON.stringify(next));
        } catch (error) {
            console.warn('[tab_security] bsq_user sync failed:', error);
        }
    }

    function normalizeLanguageChoice(value) {
        const raw = String(value || '').trim();
        const lower = raw.toLowerCase();
        if (!raw) return 'ko';
        if (lower === 'zh' || lower === 'zh-cn' || raw === '中文') return 'zh-CN';
        if (lower === 'en' || lower === 'en-us' || lower === 'english') return 'en';
        if (lower === 'ja' || lower === 'ja-jp' || raw === '日本語') return 'ja';
        return ['ko', 'en', 'ja', 'zh-CN'].includes(raw) ? raw : 'ko';
    }

    function normalizeThemeChoice(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'light' || raw === 'dark') return raw;
        if (raw === 'system') return 'dark';
        return 'dark';
    }

    function normalizeConsentChoice(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        if (typeof value === 'string') {
            const raw = value.trim().toLowerCase();
            if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
            if (['0', 'false', 'no', 'off'].includes(raw)) return false;
        }
        return null;
    }

    async function loadSecurityState() {
        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (!res?.success || !res.data) return;
            const detail = res.data || {};
            const user = detail.user || detail;

            if (mfaToggle) mfaToggle.checked = !!user.mfa_active;
            if (languageSelect) {
                languageSelect.value = normalizeLanguageChoice(
                    user.preferred_language || localStorage.getItem('bsq_language') || 'ko'
                );
            }
            if (themeSelect) {
                themeSelect.value = normalizeThemeChoice(
                    user.preferred_theme || localStorage.getItem('bsq_theme') || 'dark'
                );
            }

            if (marketingSmsToggle) {
                const stored = normalizeConsentChoice(localStorage.getItem('bsq_marketing_sms_consent'));
                const apiValue = normalizeConsentChoice(user.marketing_sms_consent);
                marketingSmsToggle.checked = apiValue ?? stored ?? false;
            }
            if (marketingEmailToggle) {
                const stored = normalizeConsentChoice(localStorage.getItem('bsq_marketing_email_consent'));
                const apiValue = normalizeConsentChoice(user.marketing_email_consent);
                marketingEmailToggle.checked = apiValue ?? stored ?? false;
            }

            window.BSQ.applyPreferences?.({
                language: normalizeLanguageChoice(languageSelect?.value || user.preferred_language || 'ko'),
                theme: normalizeThemeChoice(themeSelect?.value || user.preferred_theme || 'dark'),
            });
        } catch (error) {
            console.warn('[tab_security] state load failed:', error);
            if (languageSelect) languageSelect.value = normalizeLanguageChoice(localStorage.getItem('bsq_language') || 'ko');
            if (themeSelect) themeSelect.value = normalizeThemeChoice(localStorage.getItem('bsq_theme') || 'dark');
            if (marketingSmsToggle) marketingSmsToggle.checked = normalizeConsentChoice(localStorage.getItem('bsq_marketing_sms_consent')) ?? false;
            if (marketingEmailToggle) marketingEmailToggle.checked = normalizeConsentChoice(localStorage.getItem('bsq_marketing_email_consent')) ?? false;
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
            if (newPassword.length < 8) {
                showMypageNotice?.('error', '비밀번호 규칙', '비밀번호는 8자리 이상이어야 합니다.');
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
        if (payload.preferred_language) updates.preferred_language = normalizeLanguageChoice(payload.preferred_language);
        if (payload.preferred_theme) updates.preferred_theme = normalizeThemeChoice(payload.preferred_theme);

        let savedPreferences = null;
        if (Object.keys(updates).length) {
            const res = await window.BSQ.api(`/api/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(updates),
            });
            if (!res?.success) {
                throw new Error(res?.error || '변경사항 저장에 실패했습니다.');
            }
            savedPreferences = res.data || {};
        }

        const nextLanguage = normalizeLanguageChoice(
            savedPreferences?.preferred_language ||
            updates.preferred_language ||
            languageSelect?.value ||
            localStorage.getItem('bsq_language') ||
            'ko'
        );
        const nextTheme = normalizeThemeChoice(
            savedPreferences?.preferred_theme ||
            updates.preferred_theme ||
            themeSelect?.value ||
            localStorage.getItem('bsq_theme') ||
            'dark'
        );

        if (updates.preferred_language || savedPreferences?.preferred_language) localStorage.setItem('bsq_language', nextLanguage);
        if (updates.preferred_theme || savedPreferences?.preferred_theme) localStorage.setItem('bsq_theme', nextTheme);

        if (updates.preferred_language || updates.preferred_theme || savedPreferences) {
            syncStoredUserPreference({
                ...(updates.preferred_language || savedPreferences?.preferred_language ? { preferred_language: nextLanguage } : {}),
                ...(updates.preferred_theme || savedPreferences?.preferred_theme ? { preferred_theme: nextTheme } : {}),
            });
        }

        window.BSQ.applyPreferences?.({
            language: nextLanguage,
            theme: nextTheme,
        });
    }

    async function persistMarketingConsent(payload) {
        const updates = {};
        if (payload.marketing_sms_consent !== undefined) updates.marketing_sms_consent = payload.marketing_sms_consent ? 1 : 0;
        if (payload.marketing_email_consent !== undefined) updates.marketing_email_consent = payload.marketing_email_consent ? 1 : 0;

        if (!Object.keys(updates).length) return;

        const res = await window.BSQ.api(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });

        if (res?.success) {
            const nextSms = normalizeConsentChoice(res.data?.marketing_sms_consent ?? updates.marketing_sms_consent);
            const nextEmail = normalizeConsentChoice(res.data?.marketing_email_consent ?? updates.marketing_email_consent);
            if (payload.marketing_sms_consent !== undefined) localStorage.setItem('bsq_marketing_sms_consent', String(nextSms ?? !!updates.marketing_sms_consent));
            if (payload.marketing_email_consent !== undefined) localStorage.setItem('bsq_marketing_email_consent', String(nextEmail ?? !!updates.marketing_email_consent));

            syncStoredUserPreference({
                ...(payload.marketing_sms_consent !== undefined ? { marketing_sms_consent: updates.marketing_sms_consent } : {}),
                ...(payload.marketing_email_consent !== undefined ? { marketing_email_consent: updates.marketing_email_consent } : {}),
            });
            return;
        }

        throw new Error(res?.error || '광고 수신 설정 저장에 실패했습니다.');
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
        const previousTheme = normalizeThemeChoice(localStorage.getItem('bsq_theme') || 'dark');
        try {
            await persistPreferences({ preferred_theme: themeSelect.value });
            showMypageNotice?.('success', '테마 저장 완료', '테마가 저장되었습니다.');
        } catch (error) {
            themeSelect.value = previousTheme;
            showMypageNotice?.('error', '테마 설정 실패', error.message || '테마 저장에 실패했습니다.');
        }
    });

    marketingSmsToggle?.addEventListener('change', async (e) => {
        const next = !!e.target.checked;
        const prev = !next;
        marketingSmsToggle.disabled = true;
        try {
            await persistMarketingConsent({ marketing_sms_consent: next });
            showMypageNotice?.('success', '광고 수신 설정', next ? '문자(SMS) 수신에 동의했습니다.' : '문자(SMS) 수신을 거부했습니다.');
        } catch (error) {
            showMypageNotice?.('error', '광고 수신 설정 실패', error.message || '설정 저장에 실패했습니다.');
            marketingSmsToggle.checked = prev;
        } finally {
            marketingSmsToggle.disabled = false;
        }
    });

    marketingEmailToggle?.addEventListener('change', async (e) => {
        const next = !!e.target.checked;
        const prev = !next;
        marketingEmailToggle.disabled = true;
        try {
            await persistMarketingConsent({ marketing_email_consent: next });
            showMypageNotice?.('success', '광고 수신 설정', next ? '이메일 수신에 동의했습니다.' : '이메일 수신을 거부했습니다.');
        } catch (error) {
            showMypageNotice?.('error', '광고 수신 설정 실패', error.message || '설정 저장에 실패했습니다.');
            marketingEmailToggle.checked = prev;
        } finally {
            marketingEmailToggle.disabled = false;
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
