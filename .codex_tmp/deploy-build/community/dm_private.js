// dm_private.js - 모듈1: 1:1 프라이빗 메시지 시스템 (D1 API 버전)
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.DM = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;

    // DM 방 ID 생성 (두 userId 정렬)
    function getRoomId(uid1, uid2) {
        return 'dm_' + [uid1, uid2].sort().join('_');
    }

    // DM 방 생성 또는 참여 (D1 API)
    async function openOrCreateRoom(targetUserId) {
        const userId = bridge().getUserId();

        try {
            const res = await window.BSQ.api('/api/user-chats', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    target_user_id: targetUserId
                })
            });

            if (res?.success) {
                return res.data.room_id;
            }
            throw new Error(res?.error || 'DM 방 생성 실패');
        } catch (e) {
            console.error("openOrCreateRoom error:", e);
            return null;
        }
    }

    // 메시지 전송 (D1 API)
    async function sendMessage(roomId, content, type = 'text', replyTo = null, fileData = null, customMsgData = null) {
        const userId = bridge().getUserId();

        try {
            const msgPayload = {
                content,
                room_type: 'dm',
                image_url: null
            };

            // 파일 데이터 처리
            if (fileData && fileData.data) {
                msgPayload.image_url = fileData.data;
            }

            const res = await window.BSQ.api(`/api/dm/${roomId}/messages`, {
                method: 'POST',
                body: JSON.stringify(msgPayload)
            });

            if (res?.success) {
                bridge().emit('message_sent', { roomId, msgId: res.data.id });
                return res.data.id;
            }
            return null;
        } catch (e) {
            console.error("sendMessage error:", e);
            return null;
        }
    }

    // 메시지 수정 (현재 D1에서는 미지원 - 향후 구현)
    async function editMessage(roomId, msgKey, newContent) {
        console.warn("editMessage: 현재 D1 API에서는 지원하지 않습니다.");
        return false;
    }

    // 메시지 삭제 (현재 D1에서는 미지원 - 향후 구현)
    async function deleteMessage(roomId, msgKey) {
        console.warn("deleteMessage: 현재 D1 API에서는 지원하지 않습니다.");
        return false;
    }

    // 리액션 토글 (현재 미지원)
    async function toggleReaction(roomId, msgKey, emoji) {
        console.warn("toggleReaction: 현재 D1 API에서는 지원하지 않습니다.");
    }

    // 메시지 리스너 시작 (D1 폴링 기반)
    function startListening(roomId, onAdd) {
        bridge().listenMessages(roomId, 'dm', onAdd);
    }

    function stopListening(roomId) {
        bridge().stopListeningMessages(roomId);
    }

    return {
        getRoomId, openOrCreateRoom,
        sendMessage, editMessage, deleteMessage,
        toggleReaction,
        startListening, stopListening
    };
})();
