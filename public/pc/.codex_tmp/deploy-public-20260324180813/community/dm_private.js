window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.DM = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;

    function getRoomId(uid1, uid2) {
        return 'dm_' + [uid1, uid2].sort().join('_');
    }

    async function openOrCreateRoom(targetUserId) {
        const normalizedTargetId = String(targetUserId || '').trim();
        if (!normalizedTargetId || normalizedTargetId === 'undefined' || normalizedTargetId === 'null') {
            console.warn('openOrCreateRoom skipped: invalid targetUserId');
            return null;
        }

        const userId = bridge().getUserId();

        try {
            const res = await window.BSQ.api('/api/user-chats', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    target_user_id: normalizedTargetId,
                }),
            });

            if (res?.success) {
                return res.data.room_id;
            }

            throw new Error(res?.error || 'DM room creation failed');
        } catch (error) {
            console.error('openOrCreateRoom error:', error);
            return null;
        }
    }

    async function sendMessage(roomId, content, type = 'text', replyTo = null, fileData = null, customMsgData = null) {
        const userId = bridge().getUserId();

        try {
            const msgPayload = {
                content,
                room_type: 'dm',
                image_url: null,
            };

            if (fileData && fileData.data) {
                msgPayload.image_url = fileData.data;
            }

            const res = await window.BSQ.api(`/api/dm/${roomId}/messages`, {
                method: 'POST',
                body: JSON.stringify(msgPayload),
            });

            if (res?.success) {
                bridge().emit('message_sent', { roomId, msgId: res.data.id });
                return res.data.id;
            }
            return null;
        } catch (error) {
            console.error('sendMessage error:', error);
            return null;
        }
    }

    async function editMessage(roomId, msgKey, newContent) {
        console.warn('editMessage: not implemented for D1 API yet.');
        return false;
    }

    async function deleteMessage(roomId, msgKey) {
        console.warn('deleteMessage: not implemented for D1 API yet.');
        return false;
    }

    async function toggleReaction(roomId, msgKey, emoji) {
        console.warn('toggleReaction: not implemented for D1 API yet.');
    }

    function startListening(roomId, onAdd) {
        bridge().listenMessages(roomId, 'dm', onAdd);
    }

    function stopListening(roomId) {
        bridge().stopListeningMessages(roomId);
    }

    return {
        getRoomId,
        openOrCreateRoom,
        sendMessage,
        editMessage,
        deleteMessage,
        toggleReaction,
        startListening,
        stopListening,
    };
})();
