window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatList = (() => {
    const shared = () => window.BSQCommunityShared || {};
    const bridge = () => window.CommunityModules.SyncBridge;
    const SETTINGS_KEY = 'bsq_chat_settings';
    const REFRESH_MS = 5000;
    const MOBILE_LAYOUT_BREAKPOINT = 768;

    let currentFilter = 'all';
    let currentFolder = null;
    let onRoomSelect = null;
    let roomsCache = new Map();
    let activeRoomId = null;
    let refreshTimer = null;
    let searchTimer = null;
    let activeSearchQuery = '';
    let syncListenerBound = false;
    let bridgeListenerBound = false;
    let roomsLoadState = {
        status: 'idle',
        message: '',
        detail: '',
        canRetry: false,
    };
    const CHAT_TIME_ZONE = 'Asia/Seoul';
    let chatSettings = null;
    let settingsSyncQueue = Promise.resolve();
    let lastLegacyMigrationSignature = '';

    function normalizeSettingList(value) {
        if (!Array.isArray(value)) return [];
        return Array.from(new Set(
            value
                .map((item) => String(item || '').trim())
                .filter(Boolean)
        ));
    }

    function normalizeRoomFolders(value) {
        if (!value || typeof value !== 'object') return {};
        return Object.fromEntries(
            Object.entries(value)
                .map(([roomId, folderName]) => [String(roomId || '').trim(), String(folderName || '').trim()])
                .filter(([roomId, folderName]) => roomId && folderName)
        );
    }

    function normalizeSettings(raw = {}) {
        const roomFolders = normalizeRoomFolders(raw.roomFolders);
        const folders = normalizeSettingList([...(raw.folders || []), ...Object.values(roomFolders)]);
        return {
            pinned: normalizeSettingList(raw.pinned),
            muted: normalizeSettingList(raw.muted),
            folders,
            roomFolders,
        };
    }

    function hasSettingsContent(settings = {}) {
        const normalized = normalizeSettings(settings);
        return normalized.pinned.length > 0
            || normalized.muted.length > 0
            || normalized.folders.length > 0
            || Object.keys(normalized.roomFolders).length > 0;
    }

    function getSettings() {
        if (chatSettings) return chatSettings;
        try {
            chatSettings = normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {});
        } catch {
            chatSettings = normalizeSettings({});
        }
        return chatSettings;
    }

    function saveSettings(next) {
        chatSettings = normalizeSettings(next);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(chatSettings));
        return chatSettings;
    }

    function getPinned() { return getSettings().pinned || []; }
    function getMuted() { return getSettings().muted || []; }
    function getFolders() { return getSettings().folders || []; }
    function getRoomFolders() { return getSettings().roomFolders || {}; }
    const AUTO_CLASS_FOLDER = '클래스';

    function buildServerSettings(rows = [], chatPreferences = {}) {
        const pinned = [];
        const muted = [];
        const roomFolders = {};

        (Array.isArray(rows) ? rows : []).forEach((row) => {
            const roomId = String(row?.room_id || row?.roomId || '').trim();
            if (!roomId) return;
            if (row?.is_pinned === 1 || row?.is_pinned === true) pinned.push(roomId);
            if (row?.is_muted === 1 || row?.is_muted === true) muted.push(roomId);

            const folderName = String(row?.folder_name || row?.folderName || '').trim();
            if (folderName) roomFolders[roomId] = folderName;
        });

        return normalizeSettings({
            pinned,
            muted,
            roomFolders,
            folders: chatPreferences?.folders || [],
        });
    }

    function hydrateSettings(rows = [], meta = {}) {
        const localSettings = getSettings();
        const serverSettings = buildServerSettings(rows, meta?.chat_preferences || {});
        const shouldMigrateLegacy = !hasSettingsContent(serverSettings) && hasSettingsContent(localSettings);
        const nextSettings = shouldMigrateLegacy ? localSettings : serverSettings;
        saveSettings(nextSettings);
        return { nextSettings, shouldMigrateLegacy };
    }

    async function patchChatSettings(payload = {}) {
        const userId = bridge()?.getUserId?.();
        if (!userId || userId === 'OPERATOR_GHOST') return null;

        const res = await window.BSQ.api('/api/user-chats', {
            method: 'PATCH',
            body: JSON.stringify({
                user_id: userId,
                ...payload,
            }),
        });

        if (!res?.success) {
            throw new Error(res?.error || '채팅 설정 저장에 실패했습니다.');
        }

        return res;
    }

    function queueSettingsSync(task) {
        settingsSyncQueue = settingsSyncQueue
            .catch(() => null)
            .then(() => task?.())
            .catch((error) => {
                console.warn('Chat settings sync error:', error);
                return null;
            });

        return settingsSyncQueue;
    }

    async function syncAllSettingsToServer(settings, roomIds = []) {
        const normalized = normalizeSettings(settings);
        const targetRoomIds = Array.from(new Set([
            ...normalizeSettingList(roomIds),
            ...normalized.pinned,
            ...normalized.muted,
            ...Object.keys(normalized.roomFolders),
        ]));

        await patchChatSettings({ folders: normalized.folders });
        await Promise.all(targetRoomIds.map((roomId) => patchChatSettings({
            room_id: roomId,
            is_pinned: normalized.pinned.includes(roomId),
            is_muted: normalized.muted.includes(roomId),
            folder_name: normalized.roomFolders[roomId] || '',
        }).catch(() => null)));
    }

    function parseChatDate(value) {
        if (value == null || value === '') return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
        }

        if (typeof value === 'number') {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const text = String(value).trim();
        if (!text) return null;

        let normalized = text;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
            normalized = `${text.replace(' ', 'T')}Z`;
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
            normalized = `${text}Z`;
        }

        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function getKoreanCalendarParts(value) {
        const date = parseChatDate(value);
        if (!date) return null;

        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: CHAT_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);

        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        const year = Number(values.year);
        const month = Number(values.month);
        const day = Number(values.day);

        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        return { year, month, day };
    }

    function getKoreanDayDiff(fromValue, toValue = Date.now()) {
        const from = getKoreanCalendarParts(fromValue);
        const to = getKoreanCalendarParts(toValue);
        if (!from || !to) return null;

        const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
        const toUtc = Date.UTC(to.year, to.month - 1, to.day);
        return Math.floor((toUtc - fromUtc) / 86400000);
    }

    function syncTabButtons() {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.classList.toggle('active', String(btn.dataset.filter || 'all') === String(currentFilter || 'all'));
        });
        document.querySelectorAll('.folder-tab').forEach(folderBtn => folderBtn.classList.remove('active'));
    }

    function setFilter(filter = 'all') {
        currentFilter = String(filter || 'all');
        currentFolder = null;
        syncTabButtons();
        document.querySelectorAll('.community-mobile-chip').forEach(btn => {
            const active = String(btn.dataset.filter || 'all') === String(currentFilter || 'all');
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderRooms(activeSearchQuery);
        return currentFilter;
    }

    function ensureAutoClassFolder(room, { persist = true } = {}) {
        if (!room || room.type !== 'class' || !room.is_instructor || !room.roomId) return false;

        const settings = getSettings();
        const nextFolders = normalizeSettingList([...(settings.folders || []), AUTO_CLASS_FOLDER]);
        const nextRoomFolders = { ...(settings.roomFolders || {}) };
        let changed = false;

        if (nextFolders.length !== (settings.folders || []).length) {
            changed = true;
        }

        if (!nextRoomFolders[room.roomId]) {
            nextRoomFolders[room.roomId] = AUTO_CLASS_FOLDER;
            changed = true;
        }

        if (!changed) return false;

        const nextSettings = saveSettings({
            ...settings,
            folders: nextFolders,
            roomFolders: nextRoomFolders,
        });

        if (persist) {
            queueSettingsSync(() => patchChatSettings({
                room_id: room.roomId,
                folder_name: AUTO_CLASS_FOLDER,
                folders: nextSettings.folders,
            }));
        }

        return true;
    }

    function togglePin(roomId) {
        const settings = getSettings();
        const normalizedRoomId = String(roomId || '').trim();
        if (!normalizedRoomId) return;
        const isPinned = settings.pinned.includes(normalizedRoomId);
        const nextSettings = saveSettings({
            ...settings,
            pinned: isPinned
                ? settings.pinned.filter((id) => id !== normalizedRoomId)
                : [...settings.pinned, normalizedRoomId],
        });
        queueSettingsSync(() => patchChatSettings({
            room_id: normalizedRoomId,
            is_pinned: !isPinned,
        }));
        renderRooms(activeSearchQuery);
        return nextSettings;
    }

    function toggleMute(roomId) {
        const settings = getSettings();
        const normalizedRoomId = String(roomId || '').trim();
        if (!normalizedRoomId) return;
        const isMuted = settings.muted.includes(normalizedRoomId);
        const nextSettings = saveSettings({
            ...settings,
            muted: isMuted
                ? settings.muted.filter((id) => id !== normalizedRoomId)
                : [...settings.muted, normalizedRoomId],
        });
        queueSettingsSync(() => patchChatSettings({
            room_id: normalizedRoomId,
            is_muted: !isMuted,
        }));
        renderRooms(activeSearchQuery);
        return nextSettings;
    }

    function addFolder(name) {
        const normalizedName = String(name || '').trim();
        if (!normalizedName) return;
        const settings = getSettings();
        if (settings.folders.includes(normalizedName)) return;
        const nextSettings = saveSettings({
            ...settings,
            folders: [...settings.folders, normalizedName],
        });
        queueSettingsSync(() => patchChatSettings({ folders: nextSettings.folders }));
        renderFolderTabs();
        renderFolderManagerList();
    }

    function removeFolder(name) {
        const settings = getSettings();
        const normalizedName = String(name || '').trim();
        if (!normalizedName) return;
        const nextRoomFolders = { ...(settings.roomFolders || {}) };
        const affectedRoomIds = Object.keys(nextRoomFolders).filter((roomId) => nextRoomFolders[roomId] === normalizedName);
        affectedRoomIds.forEach((roomId) => {
            delete nextRoomFolders[roomId];
        });
        const nextSettings = saveSettings({
            ...settings,
            folders: settings.folders.filter((folder) => folder !== normalizedName),
            roomFolders: nextRoomFolders,
        });
        if (currentFolder === normalizedName) currentFolder = null;
        queueSettingsSync(async () => {
            await patchChatSettings({ folders: nextSettings.folders });
            await Promise.all(affectedRoomIds.map((roomId) => patchChatSettings({
                room_id: roomId,
                folder_name: '',
            }).catch(() => null)));
        });
        renderFolderTabs();
        renderFolderManagerList();
        renderRooms(activeSearchQuery);
    }

    function assignFolder(roomId, folderName) {
        const settings = getSettings();
        const normalizedRoomId = String(roomId || '').trim();
        if (!normalizedRoomId) return;
        const normalizedFolderName = String(folderName || '').trim();
        const nextRoomFolders = { ...(settings.roomFolders || {}) };
        if (normalizedFolderName) nextRoomFolders[normalizedRoomId] = normalizedFolderName;
        else delete nextRoomFolders[normalizedRoomId];

        const nextSettings = saveSettings({
            ...settings,
            roomFolders: nextRoomFolders,
            folders: normalizedFolderName && !settings.folders.includes(normalizedFolderName)
                ? [...settings.folders, normalizedFolderName]
                : settings.folders,
        });

        queueSettingsSync(() => patchChatSettings({
            room_id: normalizedRoomId,
            folder_name: normalizedFolderName,
            folders: nextSettings.folders,
        }));
        renderRooms(activeSearchQuery);
        renderFolderManagerList();
        renderFolderTabs();
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
            target_id: row.target_id || '',
            target_email: row.target_email || '',
            class_name: row.class_name || '',
            class_image: row.class_image || '',
            class_category: row.class_category || '',
            class_id: row.class_id || '',
            class_summary: row.class_summary || row.summary || row.description || '',
            instructor_name: row.instructor_name || '',
            instructor_email: row.instructor_email || '',
            group_name: row.group_name || '',
            avatar_url: row.avatar_url || row.profile_image || '',
            is_instructor: !!row.is_instructor,
            unread_count: Number(row.unread_count || 0),
            is_pinned: !!row.is_pinned,
            is_muted: !!row.is_muted,
            folder_name: row.folder_name || '',
            last_message: lastMessage,
            last_timestamp: parseChatDate(row.last_message_at)?.getTime() || 0,
            searchText,
        };
    }

    function setRoomsLoadState(next = {}) {
        roomsLoadState = {
            status: String(next.status || 'idle'),
            message: String(next.message || '').trim(),
            detail: String(next.detail || '').trim(),
            canRetry: next.canRetry !== false,
        };
        renderRoomsStatus();
    }

    function renderRoomsStatus() {
        const status = document.getElementById('chatListStatus');
        if (!status) return;

        if (roomsLoadState.status !== 'error' || !roomsLoadState.message) {
            status.hidden = true;
            status.innerHTML = '';
            return;
        }

        status.hidden = false;
        status.innerHTML = `
            <div class="comm-status-banner warning" role="status">
                <div class="comm-status-copy">
                    <strong>${shared().escapeHtml(roomsLoadState.message)}</strong>
                    ${roomsLoadState.detail ? `<p>${shared().escapeHtml(roomsLoadState.detail)}</p>` : ''}
                </div>
                ${roomsLoadState.canRetry ? '<button type="button" class="btn-status-retry" data-action="retry-room-list">다시 시도</button>' : ''}
            </div>
        `;

        status.querySelector('[data-action="retry-room-list"]')?.addEventListener('click', () => {
            loadChatRooms().catch(() => {});
        });
    }

    function init(selectCallback) {
        onRoomSelect = selectCallback;
        setupFilterTabs();
        setupSearch();
        setupContextMenu();
        setupFolderModal();
        bindSyncListener();
        bindBridgeEvents();
        renderFolderTabs();
        renderFolderManagerList();
        renderRoomsStatus();
    }

    function bindSyncListener() {
        if (syncListenerBound) return;
        syncListenerBound = true;

        window.addEventListener('bsq_sync', (event) => {
            const type = String(event?.detail?.type || '');
            if (!type) return;
            if (['chat', 'chat_room', 'chat_rooms', 'room_updated', 'messages', 'friends'].includes(type)) {
                loadChatRooms().catch(() => { });
            }
        });
    }

    function bindBridgeEvents() {
        if (bridgeListenerBound) return;
        const bridgeApi = bridge();
        if (!bridgeApi?.on) return;
        bridgeListenerBound = true;

        bridgeApi.on('room_read', ({ roomId }) => {
            const normalizedRoomId = String(roomId || '');
            if (!normalizedRoomId) return;
            const next = roomsCache.get(normalizedRoomId);
            if (!next || Number(next.unread_count || 0) === 0) return;
            next.unread_count = 0;
            roomsCache.set(normalizedRoomId, next);
            renderRooms(activeSearchQuery);
        });

        bridgeApi.on('unread_updated', ({ roomId, count }) => {
            const normalizedRoomId = String(roomId || '');
            if (!normalizedRoomId) return;
            const next = roomsCache.get(normalizedRoomId);
            if (!next) return;
            next.unread_count = Math.max(Number(count) || 0, 0);
            roomsCache.set(normalizedRoomId, next);
            renderRooms(activeSearchQuery);
        });
    }

    function setupFilterTabs() {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.addEventListener('click', () => {
                setFilter(btn.dataset.filter || 'all');
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
            setRoomsLoadState({ status: 'idle', canRetry: false });
            renderRooms(activeSearchQuery);
            return [];
        }

        try {
            const res = await window.BSQ.api(`/api/user-chats?user_id=${encodeURIComponent(userId)}`);
            const rows = res?.success ? (res.data || []) : [];
            const { shouldMigrateLegacy } = hydrateSettings(rows, res?.meta || {});

            roomsCache = new Map();
            rows.forEach(row => {
                const room = normalizeRoom(row);
                roomsCache.set(room.roomId, room);
                ensureAutoClassFolder(room, { persist: !shouldMigrateLegacy });
            });

            if (shouldMigrateLegacy) {
                const currentSettings = getSettings();
                const signature = JSON.stringify(currentSettings);
                if (signature && signature !== lastLegacyMigrationSignature) {
                    lastLegacyMigrationSignature = signature;
                    queueSettingsSync(() => syncAllSettingsToServer(
                        currentSettings,
                        rows.map((row) => row?.room_id),
                    ));
                }
            }

            setRoomsLoadState({ status: 'idle', canRetry: false });
            renderFolderTabs();
            renderFolderManagerList();
            renderRooms(activeSearchQuery);
        } catch (error) {
            console.error('Chat rooms load error:', error);
            setRoomsLoadState({
                status: 'error',
                message: roomsCache.size
                    ? '대화 목록을 새로 불러오지 못했습니다.'
                    : '대화 목록을 불러오지 못했습니다.',
                detail: roomsCache.size
                    ? '마지막으로 확인된 목록을 계속 표시합니다.'
                    : '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
                canRetry: true,
            });
            renderRooms(activeSearchQuery);
        } finally {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                loadChatRooms().catch(() => { });
            }, REFRESH_MS);
        }

        return Array.from(roomsCache.values());
    }

    function renderRooms(searchQuery = '') {
        const list = document.getElementById('chatRoomList');
        if (!list) return;
        renderRoomsStatus();

        const rooms = Array.from(roomsCache.values());
        const pinned = getPinned();
        const muted = getMuted();
        const roomFolders = getRoomFolders();
        let filtered = rooms;

        if (currentFilter !== 'all' && currentFilter !== 'pinned') {
            filtered = filtered.filter(room => room.type === currentFilter);
        }

        if (currentFilter === 'pinned') {
            filtered = filtered.filter(room => pinned.includes(room.roomId));
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
            const showLoadError = roomsLoadState.status === 'error' && rooms.length === 0;
            const emptyTitle = showLoadError
                ? '대화 목록을 불러오지 못했습니다'
                : query
                    ? '검색 결과가 없습니다'
                    : currentFilter === 'pinned'
                        ? '고정된 대화가 없습니다'
                        : currentFilter === 'dm'
                            ? '1:1 대화가 없습니다'
                            : currentFilter === 'class'
                                ? '클래스 대화가 없습니다'
                                : currentFilter === 'group'
                                    ? '그룹 대화가 없습니다'
                                    : '아직 대화가 없습니다';
            const emptyCopy = showLoadError
                ? '잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침 후 다시 확인하면 됩니다.'
                : query
                    ? '다른 검색어로 찾아보세요.'
                    : currentFilter === 'pinned'
                        ? '자주 보는 대화를 고정하면 여기에서 빠르게 다시 볼 수 있습니다.'
                        : currentFilter === 'dm'
                            ? '새 대화를 시작하면 1:1 채팅이 여기에 표시됩니다.'
                            : currentFilter === 'class'
                                ? '수강 중인 클래스가 생기면 여기에서 바로 이어집니다.'
                                : currentFilter === 'group'
                                    ? '그룹 채팅을 만들면 이 목록에 정리됩니다.'
                                    : '클래스 수강 또는 친구 추가 후 대화를 시작할 수 있습니다.';
            const emptyAction = showLoadError
                ? `<button class="btn-primary btn-room-empty" id="btnRetryRoomList">다시 시도</button>`
                : query ? '' : currentFilter === 'pinned'
                    ? `<button class="btn-primary btn-room-empty" id="btnClearRoomFilter">전체 보기</button>`
                    : currentFilter === 'class'
                        ? `<button class="btn-primary btn-room-empty" id="btnExploreClasses">클래스 탐색하기</button>`
                        : currentFilter === 'group'
                            ? `<button class="btn-primary btn-room-empty" id="btnStartGroup">그룹 만들기</button>`
                            : `<button class="btn-primary btn-room-empty" id="btnStartChat">새 대화 시작</button>`;
            list.innerHTML = `
                <div class="comm-empty-state">
                    <div class="comm-empty-icon"><i class="fa-regular fa-comments"></i></div>
                    <h4>${shared().escapeHtml(emptyTitle)}</h4>
                    <p>${shared().escapeHtml(emptyCopy)}</p>
                    ${emptyAction}
                </div>
            `;
            document.getElementById('btnExploreClasses')?.addEventListener('click', () => {
                location.href = '../class/class_list.html';
            });
            document.getElementById('btnClearRoomFilter')?.addEventListener('click', () => {
                setFilter('all');
            });
            document.getElementById('btnStartChat')?.addEventListener('click', () => {
                document.getElementById('hmNewChat')?.click();
            });
            document.getElementById('btnStartGroup')?.addEventListener('click', () => {
                document.getElementById('hmGroupChat')?.click();
            });
            document.getElementById('btnRetryRoomList')?.addEventListener('click', () => {
                loadChatRooms().catch(() => {});
            });
            return;
        }

        list.innerHTML = filtered.map(room => {
            const isPinned = pinned.includes(room.roomId);
            const isMuted = muted.includes(room.roomId);
            const folderName = roomFolders[room.roomId];
            const title = room.target_name || room.class_name || room.group_name || '채팅방';
            const avatar = room.target_avatar || room.class_image || '';
            const metaParts = [
                room.class_category,
                room.type === 'class' ? '클래스' : room.type === 'group' ? '그룹' : room.type === 'dm' ? '1:1' : '',
            ].filter(Boolean);
            const meta = metaParts.slice(0, 2).join(' · ');
            const badge = room.type === 'class'
                ? '<span class="room-type-badge">클래스</span>'
                : room.type === 'group'
                    ? '<span class="room-type-badge">그룹</span>'
                    : '';
            const preview = room.last_message || '';
            const time = room.last_timestamp ? formatTime(room.last_timestamp) : '';

            return `
                <div class="chat-room-item${isPinned ? ' pinned' : ''}${activeRoomId === room.roomId ? ' active' : ''}" data-room-id="${room.roomId}" data-type="${room.type}">
                    <div class="room-avatar" style="${avatar ? `background-image:url(${shared().escapeAttr(avatar)})` : ''}">
                        ${!avatar ? (room.type === 'group' ? '👥' : room.type === 'class' ? '🏫' : '👤') : ''}
                    </div>
                    <div class="room-info">
                        <div class="room-name-row">
                            <span class="room-name" title="${shared().escapeAttr(title)}">
                                <span class="room-name-text">${shared().escapeHtml(title)}</span>
                                <span class="room-name-tags">
                                    ${badge}
                                    ${isPinned ? '<span class="room-pin-icon" aria-label="고정됨">📌</span>' : ''}
                                    ${isMuted ? '<span class="room-mute-icon" aria-label="알림 꺼짐">🔕</span>' : ''}
                                    ${folderName ? `<span class="room-folder-tag" title="${shared().escapeAttr(folderName)}">${shared().escapeHtml(folderName)}</span>` : ''}
                                </span>
                            </span>
                            <span class="room-time" title="${shared().escapeAttr(time)}">${time}</span>
                        </div>
                        <div class="room-preview">${shared().escapeHtml(preview)}</div>
                        ${meta ? `<div class="room-meta-row">${shared().escapeHtml(meta)}</div>` : ''}
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
                if (window.innerWidth <= MOBILE_LAYOUT_BREAKPOINT) {
                    window.CommunityModules.ChatUI?.setMobileViewMode?.('chat');
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
                    shared().openPopupRoom({
                        roomId,
                        roomType: type,
                        name: room.target_name || room.class_name || room.group_name,
                        is_instructor: !!room.is_instructor,
                    });
                } else if (action === 'pin') {
                    togglePin(roomId);
                } else if (action === 'mute') {
                    toggleMute(roomId);
                } else if (action === 'mark-read') {
                    bridge()?.markAsRead?.(roomId, type);
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
        const date = parseChatDate(timestamp);
        if (!date) return '';
        const diffDays = getKoreanDayDiff(date, Date.now());
        if (diffDays === 0) {
            return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: CHAT_TIME_ZONE });
        }
        if (diffDays === 1) return '어제';
        if (diffDays < 7) return date.toLocaleDateString('ko-KR', { weekday: 'short', timeZone: CHAT_TIME_ZONE });
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: CHAT_TIME_ZONE });
    }

    function setActiveRoom(roomId) {
        activeRoomId = roomId;
        if (!roomId) {
            document.querySelectorAll('.chat-room-item').forEach(item => item.classList.remove('active'));
            return;
        }
        const next = roomsCache.get(roomId);
        if (next && Number(next.unread_count || 0) > 0) {
            next.unread_count = 0;
            roomsCache.set(roomId, next);
            renderRooms(activeSearchQuery);
        }
        document.querySelectorAll('.chat-room-item').forEach(item => {
            item.classList.toggle('active', item.dataset.roomId === roomId);
        });
        bridge()?.markAsRead?.(roomId, next?.type || '');
    }

    function getCurrentFilter() {
        return currentFilter;
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
        setFilter,
        getCurrentFilter,
        removeFolder,
        addFolder,
        renderFolderManagerList,
        renderFolderTabs,
    };
})();
