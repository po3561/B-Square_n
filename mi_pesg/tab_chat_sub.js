function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.initPaymentMethodsTab = async function (userId) {
    const paymentMethodsList = document.getElementById('paymentMethodsList');
    const addCardButton = document.getElementById('btnAddCard');

    async function loadUserProfile() {
        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            return res?.success ? res.data : null;
        } catch (error) {
            console.warn('[tab_chat_sub] profile load failed:', error);
            return null;
        }
    }

    async function loadMethods() {
        if (!paymentMethodsList) return;
        paymentMethodsList.innerHTML = '<div class="empty-state compact">결제 수단을 불러오는 중...</div>';

        try {
            const [profile, methodsRes] = await Promise.all([
                loadUserProfile(),
                window.BSQ.api('/api/user-payment-methods'),
            ]);

            const methods = methodsRes?.success ? (methodsRes.data || []) : [];
            const currentLevel = profile?.membership_level || 'Free';

            const membershipCard = `
                <article class="payment-membership-card">
                    <div class="payment-membership-top">
                        <span class="payment-membership-eyebrow">Membership</span>
                        <strong class="payment-membership-level">${escapeHtml(currentLevel)}</strong>
                    </div>
                    <p>구독 플랜과 결제 수단을 한 곳에서 관리합니다.</p>
                    <div class="payment-membership-actions">
                        <button type="button" class="btn-secondary" data-plan-target="Free">Free</button>
                        <button type="button" class="btn-primary" data-plan-target="Premium">Premium</button>
                    </div>
                </article>
            `;

            const methodForm = `
                <form class="payment-method-form" id="paymentMethodForm">
                    <div class="form-grid compact">
                        <div class="input-group">
                            <label for="paymentMethodLabel">수단 이름</label>
                            <input type="text" id="paymentMethodLabel" placeholder="주결제 카드">
                        </div>
                        <div class="input-group">
                            <label for="paymentMethodProvider">유형</label>
                            <select id="paymentMethodProvider">
                                <option value="card">카드</option>
                                <option value="trans">계좌이체</option>
                                <option value="wallet">간편결제</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="paymentMethodLast4">끝 4자리</label>
                            <input type="text" id="paymentMethodLast4" placeholder="1234" maxlength="4">
                        </div>
                    </div>
                    <div class="payment-method-form-actions">
                        <label class="inline-choice"><input type="checkbox" id="paymentMethodDefault"> 기본 결제수단</label>
                        <button type="submit" class="btn-submit">저장</button>
                    </div>
                </form>
            `;

            const methodsMarkup = methods.length
                ? methods.map((method) => `
                    <article class="payment-method-item ${method.is_default ? 'is-default' : ''}">
                        <div>
                            <strong>${escapeHtml(method.label || method.provider || '결제 수단')}</strong>
                            <p>${escapeHtml(method.provider || 'card')} · ${escapeHtml(method.last4 ? `**** ${method.last4}` : '정보 없음')}</p>
                        </div>
                        <div class="payment-method-item-actions">
                            <button type="button" class="btn-chat-link subtle" data-method-default="${escapeHtml(method.id)}">기본</button>
                            <button type="button" class="btn-chat-link subtle-danger" data-method-delete="${escapeHtml(method.id)}">삭제</button>
                        </div>
                    </article>
                `).join('')
                : '<div class="empty-state compact">등록된 결제 수단이 없습니다.</div>';

            paymentMethodsList.innerHTML = `${membershipCard}${methodForm}${methodsMarkup}`;

            paymentMethodsList.querySelector('#paymentMethodForm')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const label = document.getElementById('paymentMethodLabel')?.value.trim();
                const provider = document.getElementById('paymentMethodProvider')?.value || 'card';
                const last4 = document.getElementById('paymentMethodLast4')?.value.trim();
                const isDefault = document.getElementById('paymentMethodDefault')?.checked ? 1 : 0;

                try {
                    await window.BSQ.api('/api/user-payment-methods', {
                        method: 'POST',
                        body: JSON.stringify({ label, provider, last4, is_default: isDefault }),
                    });
                    showMypageNotice?.('success', '결제 수단 저장', '결제 수단이 저장되었습니다.');
                    window.BSQ.triggerSync('payment_methods');
                    loadMethods();
                } catch (error) {
                    showMypageNotice?.('error', '결제 수단 저장 실패', error.message || '저장에 실패했습니다.');
                }
            });

            paymentMethodsList.querySelectorAll('[data-method-default]').forEach((button) => {
                button.addEventListener('click', async () => {
                    try {
                        await window.BSQ.api('/api/user-payment-methods', {
                            method: 'PATCH',
                            body: JSON.stringify({ id: button.dataset.methodDefault, is_default: 1 }),
                        });
                        window.BSQ.triggerSync('payment_methods');
                        loadMethods();
                    } catch (error) {
                        showMypageNotice?.('error', '기본 결제수단 변경 실패', error.message || '변경 실패');
                    }
                });
            });

            paymentMethodsList.querySelectorAll('[data-method-delete]').forEach((button) => {
                button.addEventListener('click', async () => {
                    try {
                        await window.BSQ.api(`/api/user-payment-methods?id=${encodeURIComponent(button.dataset.methodDelete)}`, {
                            method: 'DELETE',
                        });
                        window.BSQ.triggerSync('payment_methods');
                        loadMethods();
                    } catch (error) {
                        showMypageNotice?.('error', '결제 수단 삭제 실패', error.message || '삭제 실패');
                    }
                });
            });

            paymentMethodsList.querySelectorAll('[data-plan-target]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const newLevel = button.dataset.planTarget;
                    if (!confirm(`${newLevel === 'Premium' ? '프리미엄' : '무료'} 플랜으로 변경하시겠습니까?`)) return;
                    try {
                        const res = await window.BSQ.api(`/api/users/${userId}`, {
                            method: 'PUT',
                            body: JSON.stringify({ membership_level: newLevel }),
                        });
                        if (!res?.success) throw new Error(res?.error || '변경에 실패했습니다.');
                        showMypageNotice?.('success', '구독 플랜 변경 완료', `${newLevel} 플랜으로 변경되었습니다.`);
                        window.BSQ.triggerSync('payment_methods');
                        loadMethods();
                    } catch (error) {
                        showMypageNotice?.('error', '구독 플랜 변경 실패', error.message || '변경 실패');
                    }
                });
            });
        } catch (error) {
            console.error('[tab_chat_sub] payment methods load failed:', error);
            paymentMethodsList.innerHTML = '<div class="empty-state compact error">결제 수단을 불러오지 못했습니다.</div>';
        }
    }

    addCardButton?.addEventListener('click', () => {
        document.getElementById('paymentMethodLabel')?.focus();
    });

    loadMethods();
};

// Legacy alias: keep older bootstrap calls working while the tab now behaves as payment-method management.
window.initChatSubTab = window.initPaymentMethodsTab;
