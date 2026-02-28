// view_chat.js - Class Channel with Lock/Unlock + CommunityModules Intgeration
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initChat = function (db, classId, userId, supabase, hasAccess, isInstructor) {
    console.log("💬 Chat Module Initializing... | Access:", hasAccess, "| Instructor:", isInstructor);

    // 총괄 개발자 모드 무적 패스
    if (window.__BSQ_DEV_MODE__) {
        hasAccess = true;
    }

    const lockedOverlay = document.getElementById('chatLockedOverlay');
    const unlockedArea = document.getElementById('chatUnlocked');

    if (hasAccess && (userId || window.__BSQ_DEV_MODE__)) {
        // 수강자 / 강사 / 운영자: 채팅 해제
        if (lockedOverlay) lockedOverlay.style.display = 'none';
        if (unlockedArea) unlockedArea.style.display = 'flex'; // flex for comm-main layout

        // 1. 커뮤니티 모듈 연결
        const SyncBridge = window.CommunityModules.SyncBridge;
        const DM = window.CommunityModules.DM;
        const ChatUI = window.CommunityModules.ChatUI;

        // 운영자 고스트 계정 처리
        const currentUserId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : userId;

        // 초기화
        SyncBridge.init(db, supabase, currentUserId);
        ChatUI.init();

        // 2. 클래스 채팅방 열기 (타이틀 가져오기)
        const classTitle = document.getElementById('sidebarTitle')?.textContent || '클래스';
        ChatUI.openRoom(classId, 'class', {
            class_name: classTitle
        });

        // 3. 전송 이벤트 바인딩
        const btnSend = document.getElementById('btnSend');
        const msgInput = document.getElementById('msgInput');

        if (btnSend) {
            // 중복 리스너 방지 클론 트릭
            const newBtn = btnSend.cloneNode(true);
            btnSend.parentNode.replaceChild(newBtn, btnSend);
            newBtn.addEventListener('click', () => ChatUI.sendCurrentMessage());
        }

        if (msgInput) {
            const newInput = msgInput.cloneNode(true);
            msgInput.parentNode.replaceChild(newInput, msgInput);
            newInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ChatUI.sendCurrentMessage();
                }
            });
        }

        // 4. 정보 패널 열기/닫기 이벤트 바인딩
        const btnChatInfo = document.getElementById('btnChatInfo');
        const commInfoPanel = document.getElementById('commInfoPanel');
        const btnClosePanel = document.getElementById('btnClosePanel');

        if (btnChatInfo && commInfoPanel) {
            btnChatInfo.addEventListener('click', () => {
                commInfoPanel.style.display = commInfoPanel.style.display === 'none' ? 'block' : 'none';
            });
        }
        if (btnClosePanel && commInfoPanel) {
            btnClosePanel.addEventListener('click', () => {
                commInfoPanel.style.display = 'none';
            });
        }

        // 5. 참여자 목록 로드
        loadParticipants(db, classId, supabase);

    } else {
        // 미수강자: 채팅 잠금
        if (lockedOverlay) lockedOverlay.style.display = 'flex';
        if (unlockedArea) unlockedArea.style.display = 'none';
    }
};

async function loadParticipants(db, classId, supabase) {
    const pList = document.getElementById('participantsList');
    const countEl = document.getElementById('chatMemberCount');
    if (!pList) return;

    try {
        db.ref('enrollments').once('value', async (snap) => {
            const allEnrollments = snap.val() || {};
            let html = '';
            let count = 0;

            for (const uid in allEnrollments) {
                if (allEnrollments[uid][classId]) {
                    count++;
                    if (count <= 8) {
                        try {
                            const { data: user } = await supabase.from('users').select('name, profile_image_url').eq('id', uid).maybeSingle();
                            if (user) {
                                html += `<div class="p-avatar" style="${user.profile_image_url ? `background-image:url(${user.profile_image_url})` : ''}" title="${user.name}">${!user.profile_image_url ? '👤' : ''}</div>`;
                            }
                        } catch (e) { /* skip */ }
                    }
                }
            }
            pList.innerHTML = html || '<span style="color:var(--comm-text2); font-size:0.85rem;">아직 참여자가 없습니다</span>';
            if (countEl) countEl.textContent = `${count}명 참여`;
        });
    } catch (err) {
        console.error("Chat Participants Error:", err);
    }
}
