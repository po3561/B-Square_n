// view_chat.js - Class Channel with Lock/Unlock + Instructor Controls
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initChat = function (db, classId, userId, supabase, hasAccess, isInstructor) {
    console.log("💬 Chat Module Initializing... | Access:", hasAccess, "| Instructor:", isInstructor);

    const lockedOverlay = document.getElementById('chatLockedOverlay');
    const unlockedArea = document.getElementById('chatUnlocked');

    if (hasAccess && userId) {
        // 수강자 / 강사: 채팅 해제
        if (lockedOverlay) lockedOverlay.style.display = 'none';
        if (unlockedArea) unlockedArea.style.display = 'block';
        setupChatFeed(db, classId, userId, supabase, isInstructor);
    } else {
        // 미수강자: 채팅 잠금
        if (lockedOverlay) lockedOverlay.style.display = 'block';
        if (unlockedArea) unlockedArea.style.display = 'none';
    }

    loadParticipants(db, classId, supabase);
};

function setupChatFeed(db, classId, userId, supabase, isInstructor) {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSendChat');

    if (!chatMessages) return;

    // 실시간 메시지 로드
    db.ref(`chats/${classId}`).limitToLast(100).on('child_added', (snapshot) => {
        const msg = snapshot.val();
        const msgKey = snapshot.key;
        const div = document.createElement('div');
        const isMine = msg.user_id === userId;
        const isMsgInstructor = msg.is_instructor;
        div.className = `chat-msg ${isMine ? 'mine' : ''}`;
        div.id = `msg-${msgKey}`;

        const avatarUrl = msg.user_avatar || '';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            ${!isMine ? `<div class="msg-avatar-wrap"><img src="${avatarUrl}" class="msg-avatar" onerror="this.textContent='👤'; this.style.fontSize='1.2rem'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center';"></div>` : ''}
            <div class="msg-wrapper">
                ${!isMine ? `<div class="msg-sender-row">
                    <span class="sender-name">${msg.user_name}</span>
                    ${isMsgInstructor ? '<span class="chat-instructor-badge">강사</span>' : ''}
                </div>` : ''}
                <div class="msg-content-row">
                    <div class="msg-bubble">${msg.content}</div>
                    ${isInstructor && !isMine ? `<button class="btn-delete-msg" data-key="${msgKey}" title="삭제">✕</button>` : ''}
                </div>
                <span class="msg-time">${timeStr}</span>
            </div>
        `;

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // 강사 메시지 삭제 이벤트
        if (isInstructor) {
            const deleteBtn = div.querySelector('.btn-delete-msg');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    try {
                        await db.ref(`chats/${classId}/${msgKey}`).remove();
                        div.remove();
                    } catch (err) {
                        console.error("Chat delete error:", err);
                    }
                });
            }
        }
    });

    // 메시지 전송
    const sendMsg = async () => {
        const val = chatInput.value.trim();
        if (!val) return;

        let userName = "익명";
        let userAvatar = '';

        try {
            const { data: profile } = await supabase.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
            if (profile) {
                userName = profile.name || "익명";
                userAvatar = profile.profile_image_url || '';
            }
        } catch (e) {
            console.warn("Profile fetch failed", e);
        }

        db.ref(`chats/${classId}`).push({
            user_id: userId,
            user_name: userName,
            user_avatar: userAvatar,
            content: val,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            is_instructor: isInstructor
        });
        chatInput.value = '';
    };

    btnSend?.addEventListener('click', sendMsg);
    chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
}

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
                                html += `<img src="${user.profile_image_url || ''}" class="p-avatar" title="${user.name}" onerror="this.style.display='none'">`;
                            }
                        } catch (e) { /* skip */ }
                    }
                }
            }
            pList.innerHTML = html || '<span style="color:#666; font-size:0.85rem;">아직 참여자가 없습니다</span>';
            if (countEl) countEl.textContent = `${count}명 참여`;
        }, (err) => {
            console.warn("Participants fetch denied", err.message);
            pList.innerHTML = '<span style="color:#666; font-size:0.85rem;">참여자 정보 로딩중...</span>';
        });
    } catch (err) {
        console.error("Chat Participants Error:", err);
    }
}
