window.initChatSubTab = async function (supabase, userId) {
    const chatList = document.getElementById('chatList');
    const subCard = document.querySelector('.sub-card');
    const db = firebase.database();

    if (chatList) {
        chatList.innerHTML = '<li class="loading-state">채팅 목록을 불러오는 중...</li>';

        try {
            // 1. 수강 중인 클래스 목록 가져오기
            const enrollmentSnap = await db.ref(`enrollments/${userId}`).once('value');
            const data = enrollmentSnap.val();

            if (!data) {
                chatList.innerHTML = '<li class="empty-state">참여 중인 채팅방이 없습니다.</li>';
            } else {
                let html = '';
                const classIds = Object.keys(data);

                for (const classId of classIds) {
                    const enroll = data[classId];
                    // 2. 클래스의 마지막 메시지 가져오기 (비동기 처리 최적화를 위해 간단히)
                    const lastMsgSnap = await db.ref(`chats/${classId}`).limitToLast(1).once('value');
                    let lastMsg = "대화 내용이 없습니다.";
                    let lastTime = "";

                    if (lastMsgSnap.exists()) {
                        const msgData = Object.values(lastMsgSnap.val())[0];
                        lastMsg = msgData.content;
                        const date = new Date(msgData.timestamp);
                        lastTime = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
                    }

                    html += `
                        <li onclick="location.href='../class_view/class_view.html?id=${classId}&tab=tabCommunity'" style="cursor:pointer;">
                            <div class="chat-item-avatar">
                                <img src="${enroll.image_url || '../mi_pesg/img/default_avatar.png'}" alt="Thumb">
                            </div>
                            <div class="chat-item-info">
                                <div class="chat-item-header">
                                    <strong class="chat-item-title">${enroll.title}</strong>
                                    <span class="chat-item-time">${lastTime}</span>
                                </div>
                                <p class="chat-item-preview">${lastMsg}</p>
                            </div>
                        </li>
                    `;
                }
                chatList.innerHTML = html;
            }
        } catch (error) {
            console.error("Chat list error:", error);
            chatList.innerHTML = '<li class="empty-state">채팅 목록을 불러오지 못했습니다.</li>';
        }
    }

    async function initSubUI() {
        if (!subCard) return;

        let level = 'Free'; // DB에 정보가 없으면 기본값 Free

        try {
            // maybeSingle()로 에러 우회 시도
            const { data, error } = await supabase
                .from('users')
                .select('membership_level')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.warn("구독 정보 컬럼이 없어 기본값으로 대체합니다.");
            } else if (data && data.membership_level) {
                level = data.membership_level;
            }
        } catch (e) {
            console.warn("구독 조회 에러 우회:", e);
        }

        subCard.innerHTML = `
            <h3>⭐ 서비스 플랜 관리</h3>
            <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:2rem;">원하시는 플랜을 선택하여 B-Square의 모든 혜택을 누리세요.</p>
            
            <div class="plan-selector">
                <div class="plan-card ${level === 'Free' ? 'active' : ''}" id="cardFree">
                    <div class="plan-icon">🌱</div>
                    <div class="plan-name">Free 플랜</div>
                    <div class="plan-price">무료 <span>/ 평생</span></div>
                    <ul class="plan-features">
                        <li>기본 클래스 시청</li>
                        <li>커뮤니티 활동</li>
                        <li>무료 학습 도구</li>
                    </ul>
                    <button class="btn-plan ${level === 'Free' ? 'active' : ''}" onclick="changePlan('Free')">
                        ${level === 'Free' ? '이용 중' : '무료 체험하기'}
                    </button>
                </div>

                <div class="plan-card ${level === 'Premium' ? 'active' : ''}" id="cardPremium">
                    <div class="plan-icon">👑</div>
                    <div class="plan-name">Premium 플랜</div>
                    <div class="plan-price">₩19,000 <span>/ 월</span></div>
                    <ul class="plan-features">
                        <li>모든 VOD 무제한 시청</li>
                        <li>라이브 클래스 우선 입장</li>
                        <li>1:1 전문가 멘토링</li>
                        <li>유료 에셋 무상 제공</li>
                    </ul>
                    <button class="btn-plan ${level === 'Premium' ? 'active' : ''}" onclick="changePlan('Premium')">
                        ${level === 'Premium' ? '이용 중' : '프리미엄 시작하기'}
                    </button>
                </div>
            </div>
        `;
    }

    window.changePlan = async (newLevel) => {
        if (confirm(`${newLevel === 'Premium' ? '프리미엄' : '무료'} 플랜으로 변경하시겠습니까?`)) {
            try {
                const { error } = await supabase
                    .from('users')
                    .update({ membership_level: newLevel })
                    .eq('id', userId);

                if (error) {
                    if (error.code === '42703') {
                        alert("현재 데이터베이스에 등급 관리 기능이 개설되지 않았습니다. (테스트 환경 완료 후 사용 가능)");
                    } else {
                        throw error;
                    }
                    return;
                }
                alert(`${newLevel} 플랜으로 성공적으로 변경되었습니다.`);
                initSubUI();
            } catch (e) {
                alert("플랜 변경 실패: " + e.message);
            }
        }
    };

    initSubUI();
};