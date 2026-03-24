window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatList = (() => {
    const shared = () => window.BSQCommunityShared || {};
    const bridge = () => window.CommunityModules.SyncBridge;
    const SETTINGS_KEY = 'bsq_chat_settings';
    const REFRESH_MS = 5000;

    let currentFilter = 'all';
    let currentFolder = null;
    let onRoomSelect = null;
    let roomsCache = new Map();
    let refreshTimer = null;
    let searchTimer = null;
    let activeSearchQuery = '';

    function getSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        } catch {
            return {};
        }
    }

    function saveSettings(next) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }

    function getPinned() { return getSettings().pinned || []; }
    function getMuted() { return getSettings().muted || []; }
    function getFolders() { return getSettings().folders || []; }
    function getRoomFolders() { return getSettings().roomFolders || {}; }
    const AUTO_CLASS_FOLDER = '클래스';

    function ensureAutoClassFolder(room) {
        if (!room || room.type !== 'class' || !room.is_instructor || !room.roomId) return false;

        const settings = getSettings();
        settings.folders = settings.folders || [];
        settings.roomFolders = settings.roomFolders || {};

        if (!settings.folders.includes(AUTO_CLASS_FOLDER)) {
            settings.folders.push(AUTO_CLASS_FOLDER);
        }

        if (!settings.roomFolders[room.roomId]) {
            settings.roomFolders[room.roomId] = AUTO_CLASS_FOLDER;
        }

        saveSettings(settings);
        return true;
    }

    function togglePin(roomId) {
        const settings = getSettings();
        settings.pinned = settings.pinned || [];
        const index = settings.pinned.indexOf(roomId);
        if (index >= 0) settings.pinned.splice(index, 1);
        else settings.pinned.push(roomId);
        saveSettings(settings);
        renderRooms(activeSearchQuery);
    }

    function toggleMute(roomId) {
        const settings = getSettings();
        settings.muted = settings.muted || [];
        const index = settings.muted.indexOf(roomId);
        if (index >= 0) settings.muted.splice(index, 1);
        else settings.muted.push(roomId);
        saveSettings(settings);
        renderRooms(activeSearchQuery);
    }

    function addFolder(name) {
        const settings = getSettings();
        settings.folders = settings.folders || [];
        if (!settings.folders.includes(name)) {
            settings.folders.push(name);
            saveSettings(settings);
        }
        renderFolderTabs();
        renderFolderManagerList();
    }

    function removeFolder(name) {
        const settings = getSettings();
        settings.folders = (settings.folders || []).filter(folder => folder !== name);
        const roomFolders = settings.roomFolders || {};
        Object.keys(roomFolders).forEach(roomId => {
            if (roomFolders[roomId] === name) delete roomFolders[roomId];
        });
        settings.roomFolders = roomFolders;
        saveSettings(settings);
        if (currentFolder === name) currentFolder = null;
        renderFolderTabs();
        renderFolderManagerList();
        renderRooms(activeSearchQuery);
    }

    function assignFolder(roomId, folderName) {
        const settings = getSettings();
        settings.roomFolders = settings.roomFolders || {};
        if (folderName) settings.roomFolders[roomId] = folderName;
        else delete settings.roomFolders[roomId];
        saveSettings(settings);
        renderRooms(activeSearchQuery);
        renderFolderManagerList();
    }

    function normalizeRoom(row) {
        const title = row.class_name || row.group_name || row.target_name || '채팅방';
        const avatar = row.class_image || row.target_avatar || '';
        const lastMessage = row.last_message || '';
        const searchText = [
            title,
            row.class_category,
            row.group_name,
            row.class_name,
            row.type,
            lastMessage,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return {
            roomId: row.room_id,
            type: row.type,
            target_name: row.target_name || title,
            target_avatar: avatar,
            class_name: row.class_name || '',
            class_image: row.class_image || '',
            class_category: row.class_category || '',
            group_name: row.group_name || '',
            is_instructor: !!row.is_instructor,
            unread_count: Number(row.unread_count || 0),
            last_message: lastMessage,
            last_timestamp: row.last_message_at ? new Date(row.last_message_at).getTime() : 0,
            searchText,
        };
    }

    function init(selectCallback) {
        onRoomSelect = selectCallback;
        setupFilterTabs();
        setupSearch();
        setupContextMenu();
        setupFolderModal();
        renderFolderTabs();
        renderFolderManagerList();
    }

    function setupFilterTabs() {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stab').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter || 'all';
                currentFolder = null;
                document.querySelectorAll('.folder-tab').forEach(folderBtn => folderBtn.classList.remove('active'));
                renderRooms(activeSearchQuery);
            });
        });
    }

    function setupSearch() {
        const input = document.getElementById('chatSearchInput');
        if (!input) return;
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                activeSearchQuery = input.value.trim();
                renderRooms(activeSearchQuery);
            }, 120);
        });
    }

    async function loadChatRooms() {
        const userId = bridge()?.getUserId?.();
        if (!userId || userId === 'OPERATOR_GHOST') {
            roomsCache = new Map();
            renderRooms(activeSearchQuery);
            return [];
        }

        try {
            const res = await window.BSQ.api(`/api/user-chats?user_id=${encodeURIComponent(userId)}`);
            const rows = res?.success ? (res.data || []) : [];

            roomsCache = new Map();
            rows.forEach(row => {
                const room = normalizeRoom(row);
                roomsCache.set(room.roomId, room);
                ensureAutoClassFolder(room);
            });

            renderFolderTabs();
            renderFolderManagerList();
            renderRooms(activeSearchQuery);
        } catch (error) {
            console.error('Chat rooms load error:', error);
            roomsCache = new Map();
            renderRooms(activeSearchQuery);
        } finally {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                loadChatRooms().catch(() => {});
            }, REFRESH_MS);
        }

        return Array.from(roomsCache.values());
    }

    function renderRooms(searchQuery = '') {
        const list = document.getElementById('chatRoomList');
        if (!list) return;

        const rooms = Array.from(roomsCache.values());
        const pinned = getPinned();
        const muted = getMuted();
        const roomFolders = getRoomFolders();
        let filtered = rooms;

        if (currentFilter !== 'all') {
            filtered = filtered.filter(room => room.type === currentFilter);
        }

        if (currentFolder) {
            filtered = filtered.filter(room => roomFolders[room.roomId] === currentFolder);
        }

        const query = String(searchQuery || '').trim().toLowerCase();
        if (query) {
            filtered = filtered.filter(room => (room.searchText || '').includes(query));
        }

        filtered.sort((a, b) => {
            const aPinned = pinned.includes(a.roomId) ? 1 : 0;
            const bPinned = pinned.includes(b.roomId) ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return (b.last_timestamp || 0) - (a.last_timestamp || 0);
        });

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="chat-list-empty">
                    <div class="empty-ico">💬</div>
                    <h4>${query ? '검색 결과가 없습니다' : '아직 채팅방이 없습니다'}</h4>
                    <p>${query ? '다른 검색어로 찾아보세요.' : '클래스 수강 또는 친구 추가 후 대화를 시작할 수 있습니다.'}</p>
                    ${!query ? '<button class="btn-primary btn-room-empty" id="btnExploreClasses">새로운 클래스 탐색하기</button>' : ''}
                </div>
            `;
            document.getElementById('btnExploreClasses')?.addEventListener('click', () => {
                location.href = '../class/class_list.html';
            });
            return;
        }

        list.innerHTML = filtered.map(room => {
            const isPinned = pinned.includes(room.roomId);
            const isMuted = muted.includes(room.roomId);
            const folderName = roomFolders[room.roomId];
            const title = room.target_name || room.class_name || room.group_name || '채팅방';
            const avatar = room.target_avatar || room.class_image || '';
            const badge = room.type === 'class'
                ? '<span class="room-type-badge">클래스</span>'
                : room.type === 'group'
                    ? '<span class="room-type-badge">그룹</span>'
                    : '';
            const preview = room.last_message || '';
            const time = room.last_timestamp ? formatTime(room.last_timestamp) : '';

            return `
                <div class="chat-room-item${isPinned ? ' pinned' : ''}" data-room-id="${room.roomId}" data-type="${room.type}">
                    <div class="room-avatar" style="${avatar ? `background-image:url(${shared().escapeAttr(avatar)})` : ''}">
                        ${!avatar ? (room.type === 'group' ? '👥' : room.type === 'class' ? '🏫' : '👤') : ''}
                    </div>
                    <div class="room-info">
                        <div class="room-name-row">
                            <span class="room-name">
                                ${shared().escapeHtml(title)}
                                ${badge}
                                ${isPinned ? '<span class="room-pin-icon">📌</span>' : ''}
                                ${isMuted ? '<span class="room-mute-icon">🔕</span>' : ''}
                                ${folderName ? `<span class="room-folder-tag">${shared().escapeHtml(folderName)}</span>` : ''}
                            </span>
                            <span class="room-time">${time}</span>
                        </div>
                        <div class="room-preview">${shared().escapeHtml(preview)}</div>
                    </div>
                    ${room.unread_count > 0 ? `<div class="room-badge">${room.unread_count}</div>` : ''}
                </div>
            `;
        }).join('');

        list.querySelectorAll('.chat-room-item').forEach(item => {
            item.addEventListener('click', () => {
                setActiveRoom(item.dataset.roomId);
                const room = roomsCache.get(item.dataset.roomId);
                if (onRoomSelect && room) onRoomSelect(room.roomId, room.type, room);
                if (window.innerWidth <= 1024) {
                    document.getElementById('commSidebar')?.classList.add('hidden');
                }
            });

            item.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                showRoomContextMenu(event.clientX, event.clientY, item.dataset.roomId, item.dataset.type);
            });

            let pressTimer = null;
            item.addEventListener('touchstart', (event) => {
                pressTimer = setTimeout(() => {
                    const touch = event.touches[0];
                    showRoomContextMenu(touch.clientX, touch.clientY, item.dataset.roomId, item.dataset.type);
                }, 650);
            }, { passive: true });
            item.addEventListener('touchend', () => clearTimeout(pressTimer));
            item.addEventListener('touchmove', () => clearTimeout(pressTimer));
        });
    }

    function showRoomContextMenu(x, y, roomId, type) {
        const menu = document.getElementById('roomContextMenu');
        const room = roomsCache.get(roomId);
        if (!menu || !room) return;

        const isPinned = getPinned().includes(roomId);
        const isMuted = getMuted().includes(roomId);
        menu.innerHTML = `
            <div class="ctx-item" data-action="open-new"><i class="fa-regular fa-window-restore"></i> 새 창에서 열기</div>
            <div class="ctx-item" data-action="pin"><i class="fa-solid fa-thumbtack"></i> ${isPinned ? '고정 해제' : '고정'}</div>
            <div class="ctx-item" data-action="mute"><i class="fa-solid fa-bell-slash"></i> ${isMuted ? '알림 켜기' : '알림 끄기'}</div>
            <div class="ctx-item" data-action="mark-read"><i class="fa-solid fa-eye"></i> 읽음으로 표시</div>
            <div class="ctx-item" data-action="add-folder"><i class="fa-solid fa-folder-plus"></i> 폴더에 추가</div>
            <div class="ctx-item danger" data-action="delete-chat"><i class="fa-solid fa-trash-can"></i> 대화 삭제</div>
        `;

        menu.style.display = 'block';
        menu.style.left = `${Math.min(x, window.innerWidth - 260)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;

        menu.querySelectorAll('.ctx-item').forEach(item => {
            item.onclick = async () => {
                const action = item.dataset.action;
                if (action === 'open-new') {
                    shared().openPopupRoom({ roomId, roomType: type, name: room.target_name || room.class_name || room.group_name });
                } else if (action === 'pin') {
                    togglePin(roomId);
                } else if (action === 'mute') {
                    toggleMute(roomId);
                } else if (action === 'mark-read') {
                    bridge()?.markAsRead?.(roomId);
                    const next = roomsCache.get(roomId);
                    if (next) {
                        next.unread_count = 0;
                        roomsCache.set(roomId, next);
                    }
                    renderRooms(activeSearchQuery);
                } else if (action === 'add-folder') {
                    const folderName = prompt('추가할 폴더 이름을 입력하세요', '');
                    if (folderName && folderName.trim()) assignFolder(roomId, folderName.trim());
                } else if (action === 'delete-chat') {
                    if (confirm('이 대화를 삭제하시겠습니까?')) {
                        const userId = bridge()?.getUserId?.();
                        await window.BSQ.api(`/api/user-chats?user_id=${encodeURIComponent(userId)}&room_id=${encodeURIComponent(roomId)}`, { method: 'DELETE' });
                        roomsCache.delete(roomId);
                        renderRooms(activeSearchQuery);
                    }
                }
                menu.style.display = 'none';
            };
        });
    }

    function setupContextMenu() {
        document.addEventListener('click', () => {
            const menu = document.getElementById('roomContextMenu');
            if (menu) menu.style.display = 'none';
        });
    }

    function setupFolderModal() {
        document.getElementById('btnCreateFolder')?.addEventListener('click', () => {
            const input = document.getElementById('newFolderInput');
            const name = input?.value.trim();
            if (!name) return;
            addFolder(name);
            if (input) input.value = '';
        });
    }

    function renderFolderTabs() {
        const container = document.getElementById('folderTabs');
        if (!container) return;

        const folders = getFolders();
        if (!folders.length) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = folders.map(folder => `
            <button class="folder-tab${currentFolder === folder ? ' active' : ''}" data-folder="${shared().escapeAttr(folder)}" title="${shared().escapeAttr(folder)}">
                <span class="icon">📁</span>
            </button>
        `).join('');

        container.querySelectorAll('.folder-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const folder = btn.dataset.folder;
                currentFolder = currentFolder === folder ? null : folder;
                container.querySelectorAll('.folder-tab').forEach(item => item.classList.remove('active'));
                if (currentFolder) btn.classList.add('active');
                renderRooms(activeSearchQuery);
            });
        });
    }

    function renderFolderManagerList() {
        const list = document.getElementById('folderList');
        if (!list) return;
        const folders = getFolders();
        const roomFolders = getRoomFolders();

        list.innerHTML = folders.map(folder => {
            const count = Object.values(roomFolders).filter(value => value === folder).length;
            return `
                <div class="folder-item">
                    <div class="folder-item-name">${shared().escapeHtml(folder)}</div>
                    <div class="folder-item-count">대화 ${count}개</div>
                    <button type="button" onclick="window.CommunityModules.ChatList.removeFolder('${shared().escapeAttr(folder)}')">삭제</button>
                </div>
            `;
        }).join('') || '<p class="empty-inline">폴더가 없습니다.</p>';
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }
        const diffDays = Math.floor((now - date) / 86400000);
        if (diffDays === 1) return '어제';
        if (diffDays < 7) return date.toLocaleDateString('ko-KR', { weekday: 'short' });
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }

    function setActiveRoom(roomId) {
        document.querySelectorAll('.chat-room-item').forEach(item => {
            item.classList.toggle('active', item.dataset.roomId === roomId);
        });
    }

    function getRoom(roomId) {
        return roomsCache.get(roomId) || null;
    }

    return {
        init,
        loadChatRooms,
        renderRooms,
        setActiveRoom,
        getRoom,
        removeFolder,
        addFolder,
        renderFolderManagerList,
        renderFolderTabs,
    };
})();
