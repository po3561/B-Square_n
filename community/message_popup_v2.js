window.CommunityModules = window.CommunityModules || {};

document.addEventListener('DOMContentLoaded', async () => {
    const authBootstrapTasks = [];
    if (window.BSQ?.ready?.then) authBootstrapTasks.push(window.BSQ.ready.catch(() => null));
    if (window.BSQ?.sessionBootstrapPromise?.then) authBootstrapTasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
    if (authBootstrapTasks.length) await Promise.all(authBootstrapTasks);

    const session = window.BSQ?.session;
    const isOperator = window.__BSQ_DEV_MODE__ === true;
    if ((!session || !session.user) && !isOperator) {
        location.href = '../login/login.html';
        return;
    }

    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    const shared = window.BSQCommunityShared || {};
    const SyncBridge = window.CommunityModules.SyncBridge;
    const ChatUI = window.CommunityModules.ChatUI;
    const DM = window.CommunityModules.DM;

    document.body.dataset.layout = 'popup';
    shared.applySettings?.();

    SyncBridge.init(null, null, userId);
    ChatUI.init();

    setupPopupShell(shared, ChatUI);
    setupPopupHelpers({ userId, shared, SyncBridge, ChatUI, DM });
    await openInitialPopupRoute({ userId, shared, SyncBridge, ChatUI, DM });
});

function setupPopupShell(shared, ChatUI) {
    document.getElementById('btnPopupClose')?.addEventListener('click', () => {
        try {
            window.close();
        } catch {}
        location.href = '../community/community.html';
    });

    document.getElementById('btnPopupOpenMain')?.addEventListener('click', () => {
        const roomId = ChatUI.getCurrentRoomId?.();
        if (!roomId) {
            location.href = '../community/community.html';
            return;
        }

        const current = new URLSearchParams(location.search);
        ['dm', 'room', 'type', 'class', 'group'].forEach((key) => current.delete(key));

        const target = new URL('../community/community.html', location.href);
        current.forEach((value, key) => target.searchParams.set(key, value));
        target.searchParams.set('room', roomId);
        target.searchParams.set('type', ChatUI.getCurrentRoomType?.() || 'dm');
        location.href = target.toString();
    });

}

function setupPopupHelpers({ userId, shared, SyncBridge, ChatUI, DM }) {
    window.addFriend = async function (targetUserId) {
        const res = await shared.requestFriend?.(targetUserId);
        if (res?.success) shared.toast?.(res.message || '친구 요청을 보냈습니다.');
        else shared.toast?.(res?.error || '친구 요청에 실패했습니다.');
        return res;
    };

    window.openFriendDM = async function (targetUserId) {
        await openDirectChat(targetUserId, { userId, shared, SyncBridge, ChatUI, DM });
    };
}

async function openInitialPopupRoute({ userId, shared, SyncBridge, ChatUI, DM }) {
    const params = new URLSearchParams(location.search);
    const dmTarget = params.get('dm');
    const room = params.get('room');
    const type = params.get('type');
    const classId = params.get('class');
    const groupId = params.get('group');

    if (room && type) {
        const roomInfo = {
            roomId: room,
            type,
            target_name: params.get('name') || '',
            target_avatar: params.get('avatar') || '',
            class_name: params.get('name') || '',
            class_image: params.get('avatar') || '',
            group_name: params.get('name') || '',
        };
        ChatUI.openRoom(room, type, roomInfo);
        if (params.get('panel') === 'info') {
            setTimeout(() => ChatUI.renderInfoPanel(room, type, roomInfo), 0);
        }
        updatePopupHeader(ChatUI, roomInfo.target_name || roomInfo.class_name || roomInfo.group_name || '메시지', '순수 메시지 창');
        updatePopupQuery({
            room,
            type,
            name: params.get('name') || '',
            avatar: params.get('avatar') || '',
            panel: params.get('panel') || '',
        });
        return;
    }

    if (classId) {
        const roomInfo = { roomId: classId, type: 'class', class_name: params.get('name') || '클래스' };
        ChatUI.openRoom(classId, 'class', roomInfo);
        if (params.get('panel') === 'info') {
            setTimeout(() => ChatUI.renderInfoPanel(classId, 'class', roomInfo), 0);
        }
        updatePopupHeader(ChatUI, params.get('name') || '클래스', '순수 메시지 창');
        updatePopupQuery({
            room: classId,
            type: 'class',
            name: params.get('name') || '',
            avatar: params.get('avatar') || '',
            panel: params.get('panel') || '',
        });
        return;
    }

    if (groupId) {
        const roomInfo = { roomId: groupId, type: 'group', group_name: params.get('name') || '그룹' };
        ChatUI.openRoom(groupId, 'group', roomInfo);
        if (params.get('panel') === 'info') {
            setTimeout(() => ChatUI.renderInfoPanel(groupId, 'group', roomInfo), 0);
        }
        updatePopupHeader(ChatUI, params.get('name') || '그룹', '순수 메시지 창');
        updatePopupQuery({
            room: groupId,
            type: 'group',
            name: params.get('name') || '',
            avatar: params.get('avatar') || '',
            panel: params.get('panel') || '',
        });
        return;
    }

    if (dmTarget) {
        await openDirectChat(dmTarget, { userId, shared, SyncBridge, ChatUI, DM });
        updatePopupHeader(ChatUI, params.get('name') || '1:1 채팅', '메시지 팝업');
        return;
    }

    updatePopupHeader(ChatUI, '메시지 팝업', '순수 메시지 창');
}

async function openDirectChat(targetUserId, { userId, shared, SyncBridge, ChatUI, DM }) {
    if (!targetUserId || targetUserId === userId) return;

    const profile = await SyncBridge.getUserProfile(targetUserId);
    const roomId = await DM.openOrCreateRoom(targetUserId);
    if (!roomId) {
        shared.toast?.('대화방을 열 수 없습니다. 상대 계정을 확인해 주세요.');
        return;
    }

    const roomInfo = {
        roomId,
        type: 'dm',
        target_id: targetUserId,
        target_name: profile?.name || profile?.nickname || '사용자',
        target_avatar: profile?.profile_image_url || '',
    };

    ChatUI.openRoom(roomId, 'dm', roomInfo);
    updatePopupHeader(ChatUI, roomInfo.target_name, '1:1 채팅');
    updatePopupQuery({
        room: roomId,
        type: 'dm',
        name: roomInfo.target_name || '',
        avatar: roomInfo.target_avatar || '',
    });
}

function updatePopupQuery(params) {
    const url = new URL(location.href);
    const routeKeys = new Set(['dm', 'room', 'type', 'class', 'group']);

    routeKeys.forEach((key) => url.searchParams.delete(key));
    Object.entries(params || {}).forEach(([key, value]) => {
        if (!routeKeys.has(key) && value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    });

    if (params?.room && params?.type) {
        url.searchParams.set('room', params.room);
        url.searchParams.set('type', params.type);
    } else if (params?.dm) {
        url.searchParams.set('dm', params.dm);
    } else if (params?.class) {
        url.searchParams.set('class', params.class);
    } else if (params?.group) {
        url.searchParams.set('group', params.group);
    }

    history.replaceState({}, '', url);
}

function updatePopupHeader(ChatUI, title, subtitle) {
    const popupTitle = document.getElementById('popupTitle');
    const popupSubtitle = document.getElementById('popupSubtitle');
    if (popupTitle) popupTitle.textContent = title || '메시지 팝업';
    if (popupSubtitle) popupSubtitle.textContent = subtitle || '순수 메시지 창';
    if (!ChatUI.getCurrentRoomId?.()) {
        document.getElementById('noChatSelected')?.style && (document.getElementById('noChatSelected').style.display = 'flex');
    }
}
