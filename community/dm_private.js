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
            const profile = normalizeProfile(await bridge()?.getUserProfile?.(userId));
            const clientId = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const msgPayload = {
                content,
                message: content,
                room_type: 'dm',
                type,
                client_id: clientId,
                sender_id: userId,
                user_name: profile?.name || '사용자',
                sender_name: profile?.name || '사용자',
                user_avatar: profile?.profile_image_url || '',
                sender_avatar: profile?.profile_image_url || '',
            };

            if (replyTo) {
                msgPayload.reply_to = typeof replyTo === 'object' ? replyTo.id || null : replyTo;
                msgPayload.reply_data = typeof replyTo === 'object' ? replyTo : null;
            }

            if (customMsgData && typeof customMsgData === 'object') {
                Object.assign(msgPayload, customMsgData);
            }

            if (fileData && fileData.data) {
                msgPayload.image_url = fileData.data;
                msgPayload.file_name = fileData.name || msgPayload.file_name || null;
                msgPayload.file_size = fileData.size || msgPayload.file_size || null;
            }

            const res = await window.BSQ.api(`/api/dm/${roomId}/messages`, {
                method: 'POST',
                body: JSON.stringify(msgPayload),
            });

            if (!res?.success || !res.data) {
                throw new Error(res?.error || 'DM send failed');
            }

            bridge().emit('message_sent', { roomId, msgId: res.data.id, clientId });
            return res.data.id;
        } catch (error) {
            console.error('sendMessage error:', error);
            return null;
        }
    }

    function normalizeProfile(profile) {
        if (!profile || typeof profile !== 'object') return null;
        const name = String(profile.name || profile.username || '사용자').trim() || '사용자';
        const avatar = String(profile.profile_image_url || profile.avatar_url || '').trim();
        return { ...profile, name, profile_image_url: avatar, avatar_url: avatar };
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
        return bridge().listenMessages(roomId, 'dm', onAdd);
    }

    function stopListening(roomId) {
        bridge().stopListeningMessages(roomId, 'dm');
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
