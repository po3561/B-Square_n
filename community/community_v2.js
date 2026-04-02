window.CommunityModules = window.CommunityModules || {};



async function waitForAuthBootstrap() {
    const tasks = [];
    if (window.BSQ?.ready?.then) tasks.push(window.BSQ.ready.catch(() => null));
    if (window.BSQ?.sessionBootstrapPromise?.then) tasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
    if (tasks.length) await Promise.all(tasks);
}

document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuthBootstrap();

    const session = window.BSQ?.session;

    const isOperator = window.__BSQ_DEV_MODE__ === true;

    if ((!session || !session.user) && !isOperator) {

        renderLoginPrompt();

        return;

    }



    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;

    const shared = window.BSQCommunityShared || {};

    const SyncBridge = window.CommunityModules.SyncBridge;

    const ChatList = window.CommunityModules.ChatList;

    const ChatUI = window.CommunityModules.ChatUI;

    const DM = window.CommunityModules.DM;



    document.body.dataset.layout = document.body.dataset.layout || 'community';

    shared.applySettings?.();



    SyncBridge.init(null, null, userId);

    ChatUI.init();



    ChatList.init(async (roomId, type, roomInfo) => {

        ChatUI.openRoom(roomId, type, roomInfo);

        ChatList.setActiveRoom(roomId);

        updateRoomQuery({ room: roomId, type });

        if (window.innerWidth <= 1024) document.getElementById('commSidebar')?.classList.add('hidden');

    });



    wireShellActions(userId, { shared, SyncBridge, ChatList, ChatUI, DM });

    const roomsPromise = ChatList.loadChatRooms();

    const registrationPromise = registerClassChatsOptimized(userId);

    const rooms = await roomsPromise;

    const routeParams = new URLSearchParams(location.search);

    const hasExplicitRoute = routeParams.has('dm') || routeParams.has('room') || routeParams.has('type') || routeParams.has('class') || routeParams.has('group');

    await openInitialRoute(userId, { shared, ChatList, ChatUI, DM });



    registrationPromise

        .then(() => ChatList.loadChatRooms())

        .catch(() => {});



    if (!hasExplicitRoute) {

        const lastRoomId = localStorage.getItem('bsq_comm_last_room');

        const lastType = localStorage.getItem('bsq_comm_last_type') || 'dm';

        const lastRoom = lastRoomId ? ChatList.getRoom(lastRoomId) : null;

        const fallbackRoom = lastRoom || rooms[0] || null;



        if (fallbackRoom?.roomId) {

            const type = fallbackRoom.type || lastType || 'dm';

            ChatUI.openRoom(fallbackRoom.roomId, type, fallbackRoom);

            ChatList.setActiveRoom(fallbackRoom.roomId);

            updateRoomQuery({ room: fallbackRoom.roomId, type });

        }

    }



    console.log('Community shell ready:', userId);

});



async function registerClassChatsOptimized(userId) {

    try {

        if (!userId || userId === 'OPERATOR_GHOST') return;



        const cacheKey = `bsq_comm_class_chat_sync:${userId}`;

        const res = await window.BSQ.api(`/api/enrollments?user_id=${encodeURIComponent(userId)}`);

        const enrollments = res?.success ? (res.data?.enrollments || res.data || []) : [];

        const signature = enrollments

            .map((enroll) => `${String(enroll.class_id || '')}:${String(enroll.title || '').trim()}`)

            .filter(Boolean)

            .sort()

            .join('|');



        if (signature && localStorage.getItem(cacheKey) === signature) {

            return;

        }



        await Promise.all(enrollments.map((enroll) => window.BSQ.api('/api/user-chats', {

            method: 'POST',

            body: JSON.stringify({

                type: 'class',

                room_id: enroll.class_id,

                class_name: enroll.title || enroll.class_name || '클래스',

                class_image: enroll.image_url || '',

                class_category: enroll.category || '',

                is_instructor: String(enroll.instructor_id || '') === String(userId),

            })

        }).catch(() => {})));



        if (signature) {

            localStorage.setItem(cacheKey, signature);

        }

    } catch (error) {

        console.warn('registerClassChatsOptimized failed:', error);

    }

}



function renderLoginPrompt() {

    const main = document.querySelector('.community-shell')
        || document.querySelector('.comm-container')
        || document.body;

    if (main) {

        main.innerHTML = `

            <div class="login-gate">

                <div class="login-gate-card">

                    <h2>로그인이 필요합니다</h2>

                    <p>커뮤니티를 이용하려면 먼저 로그인해 주세요.</p>

                    <button class="btn-primary" onclick="location.href='../login/login.html'">로그인하기</button>

                </div>

            </div>

        `;

    }

}



function wireShellActions(userId, deps) {

    const { shared, SyncBridge, ChatList, ChatUI, DM } = deps;

    const menu = document.getElementById('hamburgerMenu');

    const btnHamburger = document.getElementById('commHamburgerBtn') || document.querySelector('.comm-nav-rail .btn-hamburger');



    const closeMenu = () => {

        if (!menu) return;

        menu.style.display = 'none';

        menu.dataset.open = '0';

    };

    const openMenu = () => {

        if (!menu) return;

        menu.style.display = 'block';

        menu.dataset.open = '1';

    };

    btnHamburger?.addEventListener('click', (e) => {

        e.stopPropagation();

        if (!menu) return;

        if (menu.dataset.open === '1' || menu.style.display === 'block') closeMenu();

        else openMenu();

    });

    menu?.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {

        if (menu && (menu.dataset.open === '1' || menu.style.display === 'block')) {

            if (menu.contains(e.target) || btnHamburger?.contains(e.target)) return;

            closeMenu();

        }

    });



    document.getElementById('hmMyProfile')?.addEventListener('click', () => {

        closeMenu();

        location.href = '../mi_pesg/mypage.html';

    });

    document.getElementById('hmNewChat')?.addEventListener('click', () => {

        closeMenu();

        openModal('newChatModal');

    });

    document.getElementById('hmGroupChat')?.addEventListener('click', () => {

        closeMenu();

        openModal('groupChatModal');

    });

    document.getElementById('hmFriends')?.addEventListener('click', () => {

        closeMenu();

        openModal('friendsModal');

        loadFriendsPanel(userId, SyncBridge);

    });

    document.getElementById('hmSettings')?.addEventListener('click', () => {

        closeMenu();

        openModal('messageSettingsModal');

        syncSettingsPanel();

    });

    document.getElementById('hmPopup')?.addEventListener('click', () => {

        closeMenu();

        openCurrentRoomPopup(ChatUI, shared);

    });

    document.getElementById('hmClassList')?.addEventListener('click', () => {

        closeMenu();

        location.href = '../class/class_list.html';

    });



    document.getElementById('btnOpenPopup')?.addEventListener('click', () => openCurrentRoomPopup(ChatUI, shared));

    document.getElementById('btnBackMobile')?.addEventListener('click', () => document.getElementById('commSidebar')?.classList.remove('hidden'));



    setupNewChatModal({ userId, shared, SyncBridge, ChatList, ChatUI, DM, closeMenu });

    setupGroupChatModal({ userId, shared, SyncBridge, ChatList, closeMenu });

    setupFriendsModal({ userId, shared, SyncBridge, ChatUI, ChatList, DM });

    setupSettingsModal({ shared, ChatUI });



}



function setupNewChatModal({ userId, shared, SyncBridge, ChatList, ChatUI, DM, closeMenu }) {

    const modal = document.getElementById('newChatModal');

    const closeBtn = document.getElementById('btnCloseModal');

    const searchInput = document.getElementById('userSearchInput');

    const results = document.getElementById('userSearchResults');

    if (!modal || !searchInput || !results) return;



    closeBtn?.addEventListener('click', () => modal.style.display = 'none');



    let timer = null;

    searchInput.addEventListener('input', () => {

        clearTimeout(timer);

        timer = setTimeout(async () => {

            const query = searchInput.value.trim();

            if (query.length < 2) {

                results.innerHTML = '';

                return;

            }



            const users = await SyncBridge.searchUsers(query);

            results.innerHTML = users.map(user => `

                <div class="user-search-item" data-uid="${shared.escapeAttr(user.id)}" data-name="${shared.escapeAttr(user.name || user.nickname || '사용자')}" data-avatar="${shared.escapeAttr(user.profile_image_url || '')}">

                    <div class="user-avatar-mini" style="${user.profile_image_url ? `background-image:url(${shared.escapeAttr(user.profile_image_url)})` : ''}">${user.profile_image_url ? '' : '익명'}</div>

                    <div class="user-search-meta">

                        <strong>${shared.escapeHtml(user.name || user.nickname || '사용자')}</strong>

                        <span>${shared.escapeHtml(user.email || '')}</span>

                    </div>

                    <button class="btn-add-contact" data-uid="${shared.escapeAttr(user.id)}">친구 추가</button>

                </div>

            `).join('') || '<p class="empty-inline">검색 결과가 없습니다.</p>';



            results.querySelectorAll('.btn-add-contact').forEach(btn => {

                btn.addEventListener('click', async (event) => {

                    event.stopPropagation();

                    const uid = btn.dataset.uid;

                    await openDirectChat(uid, { userId, shared, SyncBridge, ChatList, ChatUI, DM });

                    modal.style.display = 'none';

                    closeMenu?.();

                });

            });

        }, 180);

    });



    modal.addEventListener('click', (e) => {

        if (e.target === modal) modal.style.display = 'none';

    });

}



function setupGroupChatModal({ userId, shared, SyncBridge, ChatList, closeMenu }) {

    const modal = document.getElementById('groupChatModal');

    const closeBtn = document.getElementById('btnCloseGroupModal');

    const searchInput = document.getElementById('groupSearchInput');

    const results = document.getElementById('groupSearchResults');

    const selectedMembers = document.getElementById('selectedMembers');

    const createBtn = document.getElementById('btnCreateGroup');

    const groupNameInput = document.getElementById('groupNameInput');

    const notify = (message) => {
        if (typeof shared.toast === 'function') {
            shared.toast(message);
            return;
        }
        alert(message);
    };

    if (!modal || !searchInput || !results || !selectedMembers || !createBtn) return;



    let memberIds = [];



    const renderSelected = () => {

        selectedMembers.innerHTML = memberIds.map(id => `

            <span class="member-chip">

                ${shared.escapeHtml(id.slice(0, 8))}...

                <button type="button" data-remove="${shared.escapeAttr(id)}">삭제</button>

            </span>

        `).join('');

        selectedMembers.querySelectorAll('button[data-remove]').forEach(btn => {

            btn.addEventListener('click', () => {

                memberIds = memberIds.filter(id => id !== btn.dataset.remove);

                renderSelected();

            });

        });

    };



    closeBtn?.addEventListener('click', () => {

        modal.style.display = 'none';

        memberIds = [];

        renderSelected();

        searchInput.value = '';

        results.innerHTML = '';

        groupNameInput.value = '';

    });



    let timer = null;

    searchInput.addEventListener('input', () => {

        clearTimeout(timer);

        timer = setTimeout(async () => {

            const query = searchInput.value.trim();

            if (query.length < 2) {

                results.innerHTML = '<p class="empty-inline">검색어를 입력해 주세요.</p>';
                return;

            }



            const users = await SyncBridge.searchUsers(query);

            const filtered = users.filter(user => user.id !== userId && !memberIds.includes(user.id));

            results.innerHTML = filtered.map(user => `

                <div class="user-search-item" data-uid="${shared.escapeAttr(user.id)}" data-name="${shared.escapeAttr(user.name || user.nickname || '사용자')}">

                    <div class="user-avatar-mini" style="${user.profile_image_url ? `background-image:url(${shared.escapeAttr(user.profile_image_url)})` : ''}">${user.profile_image_url ? '' : '익명'}</div>

                    <div class="user-search-meta">

                        <strong>${shared.escapeHtml(user.name || user.nickname || '사용자')}</strong>

                        <span>${shared.escapeHtml(user.email || '')}</span>

                    </div>

                    <button class="btn-add-contact">초대하기</button>

                </div>

            `).join('') || '<p class="empty-inline">검색 결과가 없습니다.</p>';



            results.querySelectorAll('.user-search-item').forEach(item => {

                item.addEventListener('click', () => {

                    const uid = item.dataset.uid;

                    if (!memberIds.includes(uid) && uid !== userId) {

                        memberIds.push(uid);

                        renderSelected();

                    }

                });

            });

        }, 180);

    });



    createBtn.addEventListener('click', async () => {

        const name = groupNameInput.value.trim();

        if (!name) {

            notify('그룹 이름을 입력해 주세요.');

            return;

        }



        const members = Array.from(new Set([userId, ...memberIds]));

        const res = await window.BSQ.api('/api/group-chats', {

            method: 'POST',

            body: JSON.stringify({ name, members, created_by: userId })

        });



        if (res?.success) {

            modal.style.display = 'none';

            memberIds = [];

            renderSelected();

            searchInput.value = '';

            results.innerHTML = '';

            groupNameInput.value = '';

            await ChatList.loadChatRooms();

        } else {

            notify(res?.error || '그룹 생성에 실패했습니다.');

        }

    });



    modal.addEventListener('click', (e) => {

        if (e.target === modal) modal.style.display = 'none';

    });

}



function setupFriendsModal({ userId, shared, SyncBridge, ChatUI, ChatList, DM }) {

    const modal = document.getElementById('friendsModal');

    const closeBtn = document.getElementById('btnCloseFriendsModal');

    const searchInput = document.getElementById('friendSearchInput');

    const searchResults = document.getElementById('friendSearchResults');

    const pendingArea = document.getElementById('pendingFriendList');

    const friendArea = document.getElementById('friendListArea');

    if (!modal || !closeBtn || !searchInput || !searchResults || !pendingArea || !friendArea) return;



    closeBtn.addEventListener('click', () => modal.style.display = 'none');

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });



    let timer = null;

    searchInput.addEventListener('input', () => {

        clearTimeout(timer);

        timer = setTimeout(async () => {

            const query = searchInput.value.trim();

            if (query.length < 2) {

                searchResults.innerHTML = '';

                return;

            }



            const users = await SyncBridge.searchUsers(query);

            searchResults.innerHTML = users.map(user => `

                <div class="user-search-item" data-uid="${shared.escapeAttr(user.id)}">

                    <div class="user-avatar-mini" style="${user.profile_image_url ? `background-image:url(${shared.escapeAttr(user.profile_image_url)})` : ''}">${user.profile_image_url ? '' : '익명'}</div>

                    <div class="user-search-meta">

                        <strong>${shared.escapeHtml(user.name || user.nickname || '사용자')}</strong>

                        <span>${shared.escapeHtml(user.email || '')}</span>

                    </div>

                    <button class="btn-add-contact">친구 추가</button>

                </div>

            `).join('') || '<p class="empty-inline">검색 결과가 없습니다.</p>';



            searchResults.querySelectorAll('.user-search-item').forEach(item => {

                item.addEventListener('click', async () => {

                    const uid = item.dataset.uid;

                    if (!uid) return;

                    await window.addFriend?.(uid);

                    await loadFriendsPanel(userId, SyncBridge);

                });

            });

        }, 180);

    });



    window.__BSQ_FRIENDS_REFRESH__ = async () => {

        await loadFriendsPanel(userId, SyncBridge);

    };



    loadFriendsPanel(userId, SyncBridge);

}



async function loadFriendsPanel(userId, SyncBridge) {

    const shared = window.BSQCommunityShared || {};

    const pendingArea = document.getElementById('pendingFriendList');

    const friendArea = document.getElementById('friendListArea');

    const pendingCount = document.getElementById('pendingCount');

    const friendCount = document.getElementById('friendCount');

    if (!pendingArea || !friendArea) return;



    const [pendingRes, friendRes] = await Promise.all([

        window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(userId)}&pending=1`),

        window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(userId)}`),

    ]);



    const pending = pendingRes?.success ? (pendingRes.data || []) : [];

    const friends = friendRes?.success ? (friendRes.data || []) : [];



    if (pendingCount) pendingCount.textContent = String(pending.length);

    if (friendCount) friendCount.textContent = String(friends.length);



    pendingArea.innerHTML = pending.length ? pending.map(item => {

        const name = item.nickname || item.name || item.username || '사용자';

        const avatar = item.profile_image_url || '';

        return `

            <div class="friend-card">

                <div class="friend-avatar" style="${avatar ? `background-image:url(${shared.escapeAttr(avatar)})` : ''}">${avatar ? '' : '익명'}</div>

                <div class="friend-info">

                    <strong>${shared.escapeHtml(name)}</strong>

                    <span>${shared.escapeHtml(item.email || item.username || '')}</span>

                </div>

                <div class="friend-actions">

                    <button class="btn-mini" data-accept="${shared.escapeAttr(item.requester_id)}">수락</button>

                    <button class="btn-mini" data-reject="${shared.escapeAttr(item.requester_id)}">거절</button>

                </div>

            </div>

        `;

    }).join('') : '<p class="empty-inline">대기 중인 친구 요청이 없습니다.</p>';



    friendArea.innerHTML = friends.length ? friends.map(item => {

        const name = item.nickname || item.name || item.username || '사용자';

        const avatar = item.profile_image_url || '';

        return `

            <div class="friend-card">

                <div class="friend-avatar" style="${avatar ? `background-image:url(${shared.escapeAttr(avatar)})` : ''}">${avatar ? '' : '익명'}</div>

                <div class="friend-info">

                    <strong>${shared.escapeHtml(name)}</strong>

                    <span>${shared.escapeHtml(item.email || item.username || '')}</span>

                </div>

                <div class="friend-actions">

                    <button class="btn-mini" data-open-dm="${shared.escapeAttr(item.friend_id)}">채팅하기</button>

                    <button class="btn-mini danger" data-remove="${shared.escapeAttr(item.friend_id)}">삭제</button>

                </div>

            </div>

        `;

    }).join('') : '<p class="empty-inline">등록된 친구가 없습니다.</p>';



    pendingArea.querySelectorAll('button[data-accept]').forEach(btn => {

        btn.addEventListener('click', async () => {

            await window.BSQ.api('/api/friends', {

                method: 'POST',

                body: JSON.stringify({ action: 'accept', user_id: userId, friend_id: btn.dataset.accept })

            });

            await loadFriendsPanel(userId, SyncBridge);

        });

    });

    pendingArea.querySelectorAll('button[data-reject]').forEach(btn => {

        btn.addEventListener('click', async () => {

            await window.BSQ.api('/api/friends', {

                method: 'POST',

                body: JSON.stringify({ action: 'reject', user_id: userId, friend_id: btn.dataset.reject })

            });

            await loadFriendsPanel(userId, SyncBridge);

        });

    });

    friendArea.querySelectorAll('button[data-open-dm]').forEach(btn => {

        btn.addEventListener('click', async () => {

            await openDirectChat(btn.dataset.openDm, { userId, SyncBridge, ChatUI: window.CommunityModules.ChatUI, ChatList: window.CommunityModules.ChatList, DM: window.CommunityModules.DM });

        });

    });

    friendArea.querySelectorAll('button[data-remove]').forEach(btn => {

        btn.addEventListener('click', async () => {

            if (btn.dataset.confirmed !== '1') {
                btn.dataset.confirmed = '1';
                const label = btn.dataset.label || btn.textContent || '삭제';
                btn.dataset.label = label;
                btn.textContent = '한 번 더 누르면 삭제';
                setTimeout(() => {
                    if (btn.dataset.confirmed === '1') {
                        btn.dataset.confirmed = '0';
                        btn.textContent = btn.dataset.label || label;
                    }
                }, 1800);
                return;
            }

            btn.dataset.confirmed = '0';
            btn.textContent = btn.dataset.label || '삭제';

            await window.BSQ.api('/api/friends', {

                method: 'POST',

                body: JSON.stringify({ action: 'remove', user_id: userId, friend_id: btn.dataset.remove })

            });

            await loadFriendsPanel(userId, SyncBridge);

        });

    });

}



function setupSettingsModal({ shared, ChatUI }) {

    const modal = document.getElementById('messageSettingsModal');

    const closeBtn = document.getElementById('btnCloseSettingsModal');

    if (!modal) return;



    closeBtn?.addEventListener('click', () => modal.style.display = 'none');

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });



    const sync = () => {

        const settings = shared.loadSettings?.() || {};

        const enter = document.getElementById('settingEnterToSend');

        const density = document.getElementById('settingDensity');

        const reduceMotion = document.getElementById('settingReduceMotion');

        if (enter) enter.checked = settings.enterToSend !== false;

        if (density) density.value = settings.density || 'comfortable';

        if (reduceMotion) reduceMotion.checked = !!settings.reduceMotion;

    };



    document.getElementById('settingEnterToSend')?.addEventListener('change', (e) => shared.updateSetting?.('enterToSend', e.target.checked));

    document.getElementById('settingDensity')?.addEventListener('change', (e) => shared.updateSetting?.('density', e.target.value));

    document.getElementById('settingReduceMotion')?.addEventListener('change', (e) => shared.updateSetting?.('reduceMotion', e.target.checked));

    document.getElementById('btnResetShellSettings')?.addEventListener('click', () => {

        localStorage.removeItem('bsq_community_shell_settings_v2');

        shared.applySettings?.();

        sync();

    });

    document.getElementById('btnSettingsTheme')?.addEventListener('click', () => {

        shared.toggleTheme?.();

        sync();

    });

    document.getElementById('btnSettingsPopup')?.addEventListener('click', () => openCurrentRoomPopup(ChatUI, shared));



    sync();

}



async function openDirectChat(targetUserId, { userId, shared, SyncBridge, ChatList, ChatUI, DM }) {

    if (!targetUserId || targetUserId === userId) return;

    const profile = await SyncBridge.getUserProfile(targetUserId);

    const roomId = await DM.openOrCreateRoom(targetUserId);

    if (!roomId) {

        shared.toast?.('채팅방을 열 수 없습니다. 잠시 후 다시 시도해 주세요.');

        return;

    }



    await ChatList.loadChatRooms();

    const roomInfo = ChatList.getRoom(roomId) || {

        roomId,

        type: 'dm',

        target_id: targetUserId,

        target_name: profile?.name || profile?.nickname || '사용자',

        target_avatar: profile?.profile_image_url || '',

    };

    ChatUI.openRoom(roomId, 'dm', roomInfo);

    ChatList.setActiveRoom(roomId);

    updateRoomQuery({ room: roomId, type: 'dm' });

    document.getElementById('commSidebar')?.classList.add('hidden');

}



function openCurrentRoomPopup(ChatUI, shared) {

    const roomId = ChatUI.getCurrentRoomId?.();

    if (!roomId) {

        shared.toast?.('현재 열려 있는 채팅방이 없습니다.');

        return;

    }

    shared.openPopupRoom?.({

        roomId,

        roomType: ChatUI.getCurrentRoomType?.() || 'dm',

        name: document.getElementById('chatHeaderName')?.textContent || '',

    });

}






function openModal(id) {

    const modal = document.getElementById(id);

    if (modal) modal.style.display = 'flex';

}



async function openInitialRoute(userId, { shared, ChatList, ChatUI, DM }) {

    const params = new URLSearchParams(location.search);

    const dmTarget = params.get('dm');

    const room = params.get('room');

    const type = params.get('type');

    const classId = params.get('class');

    const groupId = params.get('group');



    if (room && type) {

        const roomInfo = ChatList.getRoom(room) || {

            roomId: room,

            type,

            class_name: params.get('name') || '',

            group_name: params.get('name') || '',

            target_name: params.get('name') || '',

            target_avatar: params.get('avatar') || '',

            class_image: params.get('avatar') || '',

        };

        ChatUI.openRoom(room, type, roomInfo);

        ChatList.setActiveRoom(room);

        if (params.get('panel') === 'info') {

            setTimeout(() => ChatUI.renderInfoPanel(room, type, roomInfo, { open: true }), 0);

        }

        updateRoomQuery({

            room,

            type,

            name: params.get('name') || '',

            avatar: params.get('avatar') || '',

            panel: params.get('panel') || '',

        });

        return;

    }



    if (classId) {

        const roomInfo = ChatList.getRoom(classId) || { roomId: classId, type: 'class', class_name: params.get('name') || '클래스' };

        ChatUI.openRoom(classId, 'class', roomInfo);

        ChatList.setActiveRoom(classId);

        if (params.get('panel') === 'info') {

            setTimeout(() => ChatUI.renderInfoPanel(classId, 'class', roomInfo, { open: true }), 0);

        }

        updateRoomQuery({

            room: classId,

            type: 'class',

            name: params.get('name') || '',

            avatar: params.get('avatar') || '',

            panel: params.get('panel') || '',

        });

        return;

    }



    if (groupId) {

        const roomInfo = ChatList.getRoom(groupId) || { roomId: groupId, type: 'group', group_name: params.get('name') || '그룹 채팅' };

        ChatUI.openRoom(groupId, 'group', roomInfo);

        ChatList.setActiveRoom(groupId);

        if (params.get('panel') === 'info') {

            setTimeout(() => ChatUI.renderInfoPanel(groupId, 'group', roomInfo, { open: true }), 0);

        }

        updateRoomQuery({

            room: groupId,

            type: 'group',

            name: params.get('name') || '',

            avatar: params.get('avatar') || '',

            panel: params.get('panel') || '',

        });

        return;

    }



    if (dmTarget) {

        await openDirectChat(dmTarget, { userId, shared, SyncBridge: window.CommunityModules.SyncBridge, ChatList, ChatUI, DM });

        return;

    }



}



function updateRoomQuery(params) {

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



async function refreshFriendsPanelProxy(userId, SyncBridge) {

    if (document.getElementById('friendsModal')?.style.display !== 'flex') return;

    await setupFriendsPanelOnce(userId, SyncBridge);

}



async function setupFriendsPanelOnce(userId, SyncBridge) {

    // panels are loaded inside setupFriendsModal, call refresh here

    if (typeof window.__BSQ_FRIENDS_REFRESH__ === 'function') {

        await window.__BSQ_FRIENDS_REFRESH__(userId, SyncBridge);

    }

}



function syncSettingsPanel() {

    const settings = window.BSQCommunityShared?.loadSettings?.() || {};

    const enter = document.getElementById('settingEnterToSend');

    const density = document.getElementById('settingDensity');

    const reduceMotion = document.getElementById('settingReduceMotion');

    if (enter) enter.checked = settings.enterToSend !== false;

    if (density) density.value = settings.density || 'comfortable';

    if (reduceMotion) reduceMotion.checked = !!settings.reduceMotion;

}



window.addFriend = async function (targetUserId) {

    const shared = window.BSQCommunityShared || {};

    const res = await shared.requestFriend?.(targetUserId);

    if (res?.success) {

        shared.toast?.(res.message || '친구 요청을 보냈습니다.');

        await window.__BSQ_FRIENDS_REFRESH__?.();

    } else {

        shared.toast?.(res?.error || '친구 요청에 실패했습니다.');

    }

    return res;

};



window.openFriendDM = async function (targetUserId) {

    const shared = window.BSQCommunityShared || {};

    const userId = shared.currentUserId?.() || '';

    if (!userId || !targetUserId) return;

    await openDirectChat(targetUserId, {

        userId,

        shared,

        SyncBridge: window.CommunityModules.SyncBridge,

        ChatList: window.CommunityModules.ChatList,

        ChatUI: window.CommunityModules.ChatUI,

        DM: window.CommunityModules.DM,

    });
};
