// tab_chat_sub.js - 채팅 및 구독 관리 (D1 API 버전)
window.initChatSubTab = async function (userId) {
    const chatList = document.getElementById('chatList');
    const subCard = document.querySelector('.sub-card');

    // 1. 참여 중인 채팅 목록 (수강 중인 클래스 기반)
    if (chatList) {
        chatList.innerHTML = '<li class="loading-state">채팅 목록을 불러오는 중...</li>';

        try {
            const enrollRes = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
            const enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];

            if (!enrollments || enrollments.length === 0) {
                chatList.innerHTML = '<li class="empty-state">참여 중인 채팅방이 없습니다.</li>';
            } else {
                let html = '';
                enrollments.forEach(enroll => {
                    html += `
                        <li onclick="location.href='../class_view/class_view.html?id=${enroll.class_id}#tabChat'" style="cursor:pointer; display:flex; gap:12px; align-items:center; padding:12px; border-radius:12px; background:rgba(255,255,255,0.03); margin-bottom:8px; border:1px solid rgba(255,255,255,0.06);">
                            <div style="width:48px;height:48px;border-radius:12px;overflow:hidden;flex-shrink:0;background:#222;">
                                ${enroll.image_url ? `<img src="${enroll.image_url}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.5rem;">📚</span>'}
                            </div>
                            <div style="flex:1;min-width:0;">
                                <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${enroll.title || '클래스'}</strong>
                                <p style="font-size:0.85rem;color:#888;margin:0;">수강일: ${enroll.enrolled_at ? new Date(enroll.enrolled_at).toLocaleDateString('ko-KR') : '-'}</p>
                            </div>
                            <span style="color:#6e8efb;font-size:0.85rem;white-space:nowrap;">채널 →</span>
                        </li>
                    `;
                });
                chatList.innerHTML = html;

                // 대시보드 채팅 수 업데이트
                const dashChatCount = document.getElementById('dashChatCount');
                if (dashChatCount) dashChatCount.textContent = `${enrollments.length}개`;
            }
        } catch (error) {
            console.error("Chat list error:", error);
            chatList.innerHTML = '<li class="empty-state">채팅 목록을 불러오지 못했습니다.</li>';
        }
    }

    // 2. 구독 플랜 UI
    if (subCard) {
        let level = 'Free';

        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (res?.success && res.data?.membership_level) {
                level = res.data.membership_level;
            }
        } catch (e) {
            console.warn("구독 정보 로드 실패:", e);
        }

        subCard.innerHTML = `
            <h3>⭐ 서비스 플랜 관리</h3>
            <p style="color:var(--text-secondary,#888); font-size:0.9rem; margin-bottom:2rem;">원하시는 플랜을 선택하여 B-Square의 모든 혜택을 누리세요.</p>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:16px; border:2px solid ${level === 'Free' ? '#6e8efb' : 'rgba(255,255,255,0.1)'}; text-align:center;">
                    <div style="font-size:2rem;">🌱</div>
                    <h4 style="margin:0.5rem 0;">Free 플랜</h4>
                    <p style="color:#888;font-size:0.9rem;">무료 / 평생</p>
                    <ul style="text-align:left; font-size:0.85rem; color:#aaa; list-style:none; padding:0; margin:1rem 0;">
                        <li>✓ 기본 클래스 시청</li>
                        <li>✓ 커뮤니티 활동</li>
                        <li>✓ 무료 학습 도구</li>
                    </ul>
                    <button onclick="changePlan('Free')" style="width:100%;padding:0.7rem;border-radius:10px;border:1px solid ${level === 'Free' ? '#6e8efb' : '#555'};background:${level === 'Free' ? 'linear-gradient(135deg,#6e8efb,#a777e3)' : 'transparent'};color:${level === 'Free' ? '#fff' : '#aaa'};cursor:pointer;font-weight:600;">
                        ${level === 'Free' ? '이용 중' : '무료 체험하기'}
                    </button>
                </div>
                <div style="background:rgba(255,255,255,0.03); padding:1.5rem; border-radius:16px; border:2px solid ${level === 'Premium' ? '#ff8e53' : 'rgba(255,255,255,0.1)'}; text-align:center;">
                    <div style="font-size:2rem;">👑</div>
                    <h4 style="margin:0.5rem 0;">Premium 플랜</h4>
                    <p style="color:#888;font-size:0.9rem;">₩19,000 / 월</p>
                    <ul style="text-align:left; font-size:0.85rem; color:#aaa; list-style:none; padding:0; margin:1rem 0;">
                        <li>✓ 모든 VOD 무제한 시청</li>
                        <li>✓ 라이브 클래스 우선 입장</li>
                        <li>✓ 1:1 전문가 멘토링</li>
                        <li>✓ 유료 에셋 무상 제공</li>
                    </ul>
                    <button onclick="changePlan('Premium')" style="width:100%;padding:0.7rem;border-radius:10px;border:1px solid ${level === 'Premium' ? '#ff8e53' : '#555'};background:${level === 'Premium' ? 'linear-gradient(135deg,#ff6b6b,#ff8e53)' : 'transparent'};color:${level === 'Premium' ? '#fff' : '#aaa'};cursor:pointer;font-weight:600;">
                        ${level === 'Premium' ? '이용 중' : '프리미엄 시작하기'}
                    </button>
                </div>
            </div>
        `;
    }

    // 플랜 변경 함수
    window.changePlan = async (newLevel) => {
        if (confirm(`${newLevel === 'Premium' ? '프리미엄' : '무료'} 플랜으로 변경하시겠습니까?`)) {
            try {
                const res = await window.BSQ.api(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ membership_level: newLevel })
                });
                if (res?.success) {
                    alert(`${newLevel} 플랜으로 성공적으로 변경되었습니다.`);
                    location.reload();
                } else {
                    throw new Error(res?.error || '변경 실패');
                }
            } catch (e) {
                alert("플랜 변경 실패: " + e.message);
            }
        }
    };
};