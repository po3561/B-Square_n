// tab_security.js - 보안 및 결제 설정 로직
window.initSecurityTab = function (supabase, userId) {
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
        // 기존 상태 로드 (가상)
        const isMfaActive = localStorage.getItem(`mfa_${userId}`) === 'true';
        mfaToggle.checked = isMfaActive;

        mfaToggle.onchange = (e) => {
            localStorage.setItem(`mfa_${userId}`, e.target.checked);
            alert(e.target.checked ? "2단계 인증이 활성화되었습니다." : "2단계 인증이 해제되었습니다.");
        };
    }

    // 결제 수단 관리 (실제 리스트 렌더링 및 추가 히스토리)
    const paymentList = document.getElementById('paymentMethodsList');
    const btnAddCard = document.getElementById('btnAddCard');

    function renderCards() {
        if (!paymentList) return;
        const cards = JSON.parse(localStorage.getItem(`cards_${userId}`) || '[]');

        if (cards.length === 0) {
            paymentList.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">등록된 결제 수단이 없습니다.</p>';
            return;
        }

        paymentList.innerHTML = cards.map((card, index) => `
            <div style="background:rgba(255,255,255,0.03); padding:1.2rem; border-radius:12px; border:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <p style="font-weight:600;">${card.bank} (${card.number})</p>
                    <p style="font-size:0.8rem; color:var(--text-secondary);">${card.isDefault ? '기본 결제 수단' : '보조 수단'}</p>
                </div>
                <button class="btn-secondary" onclick="deleteCard(${index})" style="padding:0.4rem 0.8rem; font-size:0.8rem; color:#ff4757;">삭제</button>
            </div>
        `).join('');
    }

    window.deleteCard = (index) => {
        const cards = JSON.parse(localStorage.getItem(`cards_${userId}`) || '[]');
        cards.splice(index, 1);
        localStorage.setItem(`cards_${userId}`, JSON.stringify(cards));
        renderCards();
    };

    if (btnAddCard) {
        btnAddCard.onclick = () => {
            const bank = prompt("은행 또는 카드사 이름을 입력하세요 (예: 현대카드, 카카오뱅크)");
            if (!bank) return;
            const number = Math.floor(1000 + Math.random() * 9000); // 가상 카드번호 뒷자리

            const cards = JSON.parse(localStorage.getItem(`cards_${userId}`) || '[]');
            cards.push({ bank, number: `**** ${number}`, isDefault: cards.length === 0 });
            localStorage.setItem(`cards_${userId}`, JSON.stringify(cards));
            renderCards();
            alert("새로운 결제 수단이 등록되었습니다.");
        };
    }

    renderCards();
};
