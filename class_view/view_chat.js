// view_chat.js
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initChat = function (db, classId, userId, supabase, isEnrolled) {
    console.log("💬 Chat Module Initializing...");
    if (isEnrolled) {
        setupChatFeed(db, classId, userId, supabase);
    }
    loadParticipants(db, classId, supabase);
};

function setupChatFeed(db, classId, userId, supabase) {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSendChat');

    if (!chatMessages) return;

    db.ref(`chats/${classId}`).on('child_added', async (snapshot) => {
        const msg = snapshot.val();
        const div = document.createElement('div');
        const isMine = msg.user_id === userId;
        div.className = `chat-msg ${isMine ? 'mine' : ''}`;

        // Get sender avatar
        const avatarUrl = msg.user_avatar || '../mi_pesg/img/default_avatar.png';

        div.innerHTML = `
            ${!isMine ? `<img src="${avatarUrl}" class="msg-avatar">` : ''}
            <div class="msg-wrapper">
                ${!isMine ? `<span class="sender-name">${msg.user_name}</span>` : ''}
                <div class="msg-bubble">${msg.content}</div>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    const sendMsg = async () => {
        const val = chatInput.value.trim();
        if (!val) return;

        // Fetch current user profile for avatar
        let userName = "익명";
        let userAvatar = '../mi_pesg/img/default_avatar.png';

        try {
            const { data: profile } = await supabase.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
            if (profile) {
                userName = profile.name || "익명";
                userAvatar = profile.profile_image_url || userAvatar;
            }
        } catch (e) {
            console.warn("Self profile fetch failed", e);
        }

        db.ref(`chats/${classId}`).push({
            user_id: userId,
            user_name: userName,
            user_avatar: userAvatar,
            content: val,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        chatInput.value = '';
    };

    btnSend?.addEventListener('click', sendMsg);
    chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
}

async function loadParticipants(db, classId, supabase) {
    const pList = document.getElementById('participantsList');
    if (!pList) return;

    try {
        db.ref(`enrollments`).once('value', async (snap) => {
            const allEnrollments = snap.val() || {};
            let html = '';
            let count = 0;

            for (const uid in allEnrollments) {
                if (allEnrollments[uid][classId]) {
                    count++;
                    if (count <= 12) { // Show up to 12 avatars
                        try {
                            const { data: user } = await supabase.from('users').select('name, profile_image_url').eq('id', uid).maybeSingle();
                            if (user) {
                                html += `
                                    <div class="participant-item" title="${user.name}">
                                        <img src="${user.profile_image_url || '../mi_pesg/img/default_avatar.png'}" class="p-avatar">
                                    </div>
                                `;
                            }
                        } catch (e) {
                            console.warn("User profile fetch failed", uid);
                        }
                    }
                }
            }
            pList.innerHTML = html || '<p class="empty-status">첫 번째 수강생이 되어보세요!</p>';
        }, (err) => {
            console.warn("Participants fetch denied", err.message);
            pList.innerHTML = '<p class="empty-status">지금 많은 수강생이 공부를 시작했어요.</p>';
        });
    } catch (err) {
        console.error("Chat Participants Module Error:", err);
    }
}
