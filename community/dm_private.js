// dm_private.js - 모듈1: 1:1 프라이빗 메시지 시스템
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.DM = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;

    // DM 방 ID 생성 (두 userId 정렬)
    function getRoomId(uid1, uid2) {
        return [uid1, uid2].sort().join('_');
    }

    // DM 방 생성 또는 참여
    async function openOrCreateRoom(targetUserId) {
        const db = bridge().getDb();
        const userId = bridge().getUserId();
        const roomId = getRoomId(userId, targetUserId);

        // 메타 정보 존재 확인
        const metaSnap = await db.ref(`dm/${roomId}/meta`).once('value');
        if (!metaSnap.exists()) {
            await db.ref(`dm/${roomId}/meta`).set({
                participants: [userId, targetUserId],
                created_at: firebase.database.ServerValue.TIMESTAMP
            });
        }

        // user_chats에 등록
        const profile = await bridge().getUserProfile(targetUserId);
        await db.ref(`user_chats/${userId}/${roomId}`).update({
            type: 'dm',
            target_id: targetUserId,
            target_name: profile.name,
            target_avatar: profile.profile_image_url || '',
            unread_count: 0
        });

        // 상대방도 등록
        const myProfile = await bridge().getUserProfile(userId);
        await db.ref(`user_chats/${targetUserId}/${roomId}`).update({
            type: 'dm',
            target_id: userId,
            target_name: myProfile.name,
            target_avatar: myProfile.profile_image_url || '',
        });

        return roomId;
    }

    // 메시지 전송
    async function sendMessage(roomId, content, type = 'text', replyTo = null, fileData = null, customMsgData = null) {
        const db = bridge().getDb();
        const userId = bridge().getUserId();

        const msgData = customMsgData || {
            sender_id: userId,
            content: content,
            type: type, // text, image, file, voice, video
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            edited: false,
            reactions: {}
        };

        if (replyTo) msgData.reply_to = replyTo;
        if (fileData) {
            msgData.file_name = fileData.name;
            msgData.file_size = fileData.size;
            msgData.file_data = fileData.data;
        }

        const msgRef = await db.ref(`dm/${roomId}/messages`).push(msgData);

        // 메타 업데이트
        await db.ref(`dm/${roomId}/meta`).update({
            last_message: type === 'text' ? content : `[${type}]`,
            last_timestamp: firebase.database.ServerValue.TIMESTAMP,
            last_sender: userId
        });

        // 상대방 읽지 않은 카운트 증가
        const metaSnap = await db.ref(`dm/${roomId}/meta/participants`).once('value');
        const participants = metaSnap.val() || [];
        participants.forEach(uid => {
            if (uid !== userId) {
                db.ref(`user_chats/${uid}/${roomId}/unread_count`).transaction(count => (count || 0) + 1);
            }
        });

        bridge().emit('message_sent', { roomId, msgId: msgRef.key });
        return msgRef.key;
    }

    // 메시지 수정 (본인만)
    async function editMessage(roomId, msgKey, newContent) {
        const db = bridge().getDb();
        const userId = bridge().getUserId();

        const snap = await db.ref(`dm/${roomId}/messages/${msgKey}/sender_id`).once('value');
        if (snap.val() !== userId) return false;

        await db.ref(`dm/${roomId}/messages/${msgKey}`).update({
            content: newContent,
            edited: true
        });
        return true;
    }

    // 메시지 삭제 (본인만)
    async function deleteMessage(roomId, msgKey) {
        const db = bridge().getDb();
        const userId = bridge().getUserId();

        const snap = await db.ref(`dm/${roomId}/messages/${msgKey}/sender_id`).once('value');
        if (snap.val() !== userId) return false;

        await db.ref(`dm/${roomId}/messages/${msgKey}`).remove();
        return true;
    }

    // 리액션 토글
    async function toggleReaction(roomId, msgKey, emoji) {
        const db = bridge().getDb();
        const userId = bridge().getUserId();
        const reactionRef = db.ref(`dm/${roomId}/messages/${msgKey}/reactions/${emoji}/${userId}`);

        const snap = await reactionRef.once('value');
        if (snap.exists()) {
            await reactionRef.remove();
        } else {
            await reactionRef.set(true);
        }
    }

    // 메시지 리스너 시작
    function startListening(roomId, onAdd, onChange, onRemove) {
        bridge().listenMessages(`dm/${roomId}/messages`, onAdd, onChange, onRemove);
    }

    function stopListening(roomId) {
        bridge().stopListeningMessages(`dm/${roomId}/messages`);
    }

    return {
        getRoomId, openOrCreateRoom,
        sendMessage, editMessage, deleteMessage,
        toggleReaction,
        startListening, stopListening
    };
})();
