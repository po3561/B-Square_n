window.initChatSubTab = async function (userId) {
    const chatList = document.getElementById('chatList');
    const subCard = document.querySelector('.sub-card');

    if (chatList) {
        chatList.innerHTML = '<li class="loading-state">채팅 목록을 불러오는 중...</li>';

        try {
            let enrollments = [];
            const bootCache = window.__BSQ_MYPAGE_CACHE__ || {};
            if (bootCache.userId === userId && Array.isArray(bootCache.enrollments)) {
                enrollments = bootCache.enrollments;
            } else {
                if (window.__BSQ_MYPAGE_BOOT_PROMISE__) {
                    await window.__BSQ_MYPAGE_BOOT_PROMISE__;
                }
                const readyCache = window.__BSQ_MYPAGE_CACHE__ || {};
                if (readyCache.userId === userId && Array.isArray(readyCache.enrollments)) {
                    enrollments = readyCache.enrollments;
                } else {
                    const enrollRes = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
                    enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];
                    window.__BSQ_MYPAGE_CACHE__ = {
                        ...(window.__BSQ_MYPAGE_CACHE__ || {}),
                        userId,
                        enrollments,
                        updatedAt: Date.now(),
                    };
                }
            }

            if (!enrollments || enrollments.length === 0) {
                chatList.innerHTML = '<li class="empty-state">참여 중인 채팅방이 없습니다.</li>';
            } else {
                chatList.innerHTML = enrollments.map((enroll) => `
                    <li class="chat-list-item" data-chat-link="../class_view/class_view.html?id=${encodeURIComponent(enroll.class_id)}#tabChat">
                        <div class="chat-item-thumb">
                            ${enroll.image_url ? `<img src="${enroll.image_url}" alt="">` : '<span>💬</span>'}
                        </div>
                        <div class="chat-item-body">
                            <strong>${enroll.title || '클래스'}</strong>
                            <p>수강일 ${enroll.enrolled_at ? new Date(enroll.enrolled_at).toLocaleDateString('ko-KR') : '-'}</p>
                        </div>
                        <span class="chat-item-link">채팅 열기</span>
                    </li>
                `).join('');

                chatList.querySelectorAll('[data-chat-link]').forEach((item) => {
                    item.addEventListener('click', () => {
                        location.href = item.dataset.chatLink;
                    });
                });

                const dashChatCount = document.getElementById('dashChatCount');
                if (dashChatCount) dashChatCount.textContent = `${enrollments.length}개`;
            }
        } catch (error) {
            console.error('Chat list error:', error);
            chatList.innerHTML = '<li class="empty-state">채팅 목록을 불러오지 못했습니다.</li>';
        }
    }

    if (subCard) {
        let level = 'Free';

        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (res?.success && res.data?.membership_level) {
                level = res.data.membership_level;
            }
        } catch (e) {
            console.warn('플랜 정보 로드 실패:', e);
        }

        subCard.innerHTML = `
            <h3>구독 플랜 관리</h3>
            <p style="color:var(--text-secondary,#888); font-size:0.9rem; margin-bottom:2rem;">원하는 플랜을 선택해 B-Square의 이용 범위를 조정할 수 있습니다.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:16px; border:2px solid ${level === 'Free' ? '#6e8efb' : 'rgba(255,255,255,0.1)'}; text-align:center;">
                    <div style="font-size:2rem;">🆓</div>
                    <h4 style="margin:0.5rem 0;">Free 플랜</h4>
                    <p style="color:#888;font-size:0.9rem;">무료 / 입문용</p>
                    <ul style="text-align:left; font-size:0.85rem; color:#aaa; list-style:none; padding:0; margin:1rem 0;">
                        <li>기본 클래스 수강</li>
                        <li>커뮤니티 참여</li>
                        <li>무료 콘텐츠 확인</li>
                    </ul>
                    <button type="button" data-plan-target="Free" style="width:100%;padding:0.7rem;border-radius:10px;border:1px solid ${level === 'Free' ? '#6e8efb' : '#555'};background:${level === 'Free' ? 'linear-gradient(135deg,#6e8efb,#a777e3)' : 'transparent'};color:${level === 'Free' ? '#fff' : '#aaa'};cursor:pointer;font-weight:600;">
                        ${level === 'Free' ? '이용 중' : '무료로 체험하기'}
                    </button>
                </div>
                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:16px; border:2px solid ${level === 'Premium' ? '#ff8e53' : 'rgba(255,255,255,0.1)'}; text-align:center;">
                    <div style="font-size:2rem;">⭐</div>
                    <h4 style="margin:0.5rem 0;">Premium 플랜</h4>
                    <p style="color:#888;font-size:0.9rem;">월 9,000원</p>
                    <ul style="text-align:left; font-size:0.85rem; color:#aaa; list-style:none; padding:0; margin:1rem 0;">
                        <li>모든 VOD 무제한 수강</li>
                        <li>라이브 클래스 우선 입장</li>
                        <li>1:1 문의 우선 응답</li>
                        <li>전용 혜택 상시 제공</li>
                    </ul>
                    <button type="button" data-plan-target="Premium" style="width:100%;padding:0.7rem;border-radius:10px;border:1px solid ${level === 'Premium' ? '#ff8e53' : '#555'};background:${level === 'Premium' ? 'linear-gradient(135deg,#ff6b6b,#ff8e53)' : 'transparent'};color:${level === 'Premium' ? '#fff' : '#aaa'};cursor:pointer;font-weight:600;">
                        ${level === 'Premium' ? '이용 중' : '프리미엄 시작하기'}
                    </button>
                </div>
            </div>
        `;

        subCard.querySelectorAll('[data-plan-target]').forEach((button) => {
            button.addEventListener('click', () => changePlan(button.dataset.planTarget));
        });
    }

    window.changePlan = async (newLevel) => {
        if (confirm(`${newLevel === 'Premium' ? '프리미엄' : '무료'} 플랜으로 변경하시겠습니까?`)) {
            try {
                const res = await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ membership_level: newLevel }),
                });
                if (res?.success) {
                    showMypageNotice?.('success', '구독 플랜 변경 완료', `${newLevel} 플랜으로 변경되었습니다.`);
                    location.reload();
                } else {
                    throw new Error(res?.error || '변경에 실패했습니다.');
                }
            } catch (e) {
                showMypageNotice?.('error', '구독 플랜 변경 실패', e.message);
            }
        }
    };
};
