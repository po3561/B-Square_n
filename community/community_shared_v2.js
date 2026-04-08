window.BSQCommunityShared = window.BSQCommunityShared || {};

(() => {
    const STORAGE_KEY = 'bsq_community_shell_settings_v2';
    const BLOCK_STORAGE_KEY = 'bsq_comm_blocked_targets_v1';
    const relationCache = new Map();

    function loadSettings() {
        const fallback = {
            theme: localStorage.getItem('bsq_theme') || 'dark',
            density: localStorage.getItem('bsq_comm_density') || 'comfortable',
            enterToSend: localStorage.getItem('bsq_comm_enter_to_send') !== '0',
            reduceMotion: localStorage.getItem('bsq_comm_reduce_motion') === '1',
        };

        try {
            return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) };
        } catch {
            return fallback;
        }
    }

    function saveSettings(next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem('bsq_theme', next.theme || 'dark');
        localStorage.setItem('bsq_comm_density', next.density || 'comfortable');
        localStorage.setItem('bsq_comm_enter_to_send', next.enterToSend ? '1' : '0');
        localStorage.setItem('bsq_comm_reduce_motion', next.reduceMotion ? '1' : '0');
    }

    function applySettings(overrides = {}) {
        const settings = { ...loadSettings(), ...overrides };
        saveSettings(settings);

        document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
        if (document.body) {
            document.body.dataset.commDensity = settings.density || 'comfortable';
            document.body.dataset.commMotion = settings.reduceMotion ? 'reduce' : 'normal';
        }

        window.CommunityShellSettings = settings;
        return settings;
    }

    function setTheme(theme) {
        const next = applySettings({ theme });
        return next;
    }

    function toggleTheme() {
        const current = loadSettings();
        return setTheme(current.theme === 'dark' ? 'light' : 'dark');
    }

    function updateSetting(key, value) {
        const next = applySettings({ [key]: value });
        return next;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function makePopupUrl({ roomId, roomType, name, avatar, panel }) {
        const url = new URL('../community/message_popup.html', window.location.href);
        if (roomId) url.searchParams.set('room', roomId);
        if (roomType) url.searchParams.set('type', roomType);
        if (name) url.searchParams.set('name', name);
        if (avatar) url.searchParams.set('avatar', avatar);
        if (panel) url.searchParams.set('panel', panel);
        return url.toString();
    }

    function openPopupRoom(options = {}) {
        const url = makePopupUrl(options);
        const isSmallScreen = window.innerWidth <= 768 || window.matchMedia?.('(max-width: 768px)')?.matches;
        const width = isSmallScreen
            ? Math.max(360, Math.min(window.screen.availWidth || 360, window.innerWidth || 360))
            : Math.max(520, Math.min(980, Math.floor((window.screen.availWidth || 1280) * 0.88)));
        const height = isSmallScreen
            ? Math.max(640, Math.min(window.screen.availHeight || 640, window.innerHeight || 640))
            : Math.max(760, Math.min(920, Math.floor((window.screen.availHeight || 900) * 0.9)));
        const left = Math.max(0, Math.floor(((window.screen.availWidth || width) - width) / 2));
        const top = Math.max(0, Math.floor(((window.screen.availHeight || height) - height) / 2));
        const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,noopener=yes,noreferrer=yes`;
        const win = window.open(url, '_blank', features);
        if (win) win.focus();
        return win;
    }

    function currentUserId() {
        return window.CommunityModules?.SyncBridge?.getUserId?.() || window.BSQ?.session?.user?.id || '';
    }

    function blockedStorageKey(userId = currentUserId()) {
        return `${BLOCK_STORAGE_KEY}:${String(userId || 'guest')}`;
    }

    function readBlockedUserIds(userId = currentUserId()) {
        try {
            const raw = localStorage.getItem(blockedStorageKey(userId)) || '[]';
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function writeBlockedUserIds(next, userId = currentUserId()) {
        const unique = Array.from(new Set((Array.isArray(next) ? next : []).map((item) => String(item)).filter(Boolean)));
        localStorage.setItem(blockedStorageKey(userId), JSON.stringify(unique));
        return unique;
    }

    function isBlockedUser(targetUserId, userId = currentUserId()) {
        if (!targetUserId) return false;
        return readBlockedUserIds(userId).includes(String(targetUserId));
    }

    function clearFriendRelationCache(targetUserId = '') {
        const normalized = String(targetUserId || '').trim();
        if (!normalized) {
            relationCache.clear();
            return;
        }
        for (const key of relationCache.keys()) {
            if (String(key).endsWith(`:${normalized}`)) {
                relationCache.delete(key);
            }
        }
    }

    async function getFriendRelation(targetUserId, { force = false } = {}) {
        const userId = currentUserId();
        const targetId = String(targetUserId || '').trim();
        if (!userId || !targetId || userId === targetId) {
            return { status: 'none', friend: false, pending: false, blocked: false, direction: null };
        }

        if (isBlockedUser(targetId, userId)) {
            return { status: 'blocked', friend: false, pending: false, blocked: true, direction: null, source: 'local' };
        }

        const cacheKey = `${userId}:${targetId}`;
        if (!force && relationCache.has(cacheKey)) {
            return relationCache.get(cacheKey);
        }

        const promise = (async () => {
            try {
                if (typeof window.BSQ?.api !== 'function') {
                    return { status: 'none', friend: false, pending: false, blocked: false, direction: null };
                }

                const res = await window.BSQ.api('/api/friends', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'check', user_id: userId, friend_id: targetId })
                });
                const data = res?.data || {};
                const status = String(data.status || 'none');
                return {
                    status,
                    friend: status === 'accepted',
                    pending: status === 'pending',
                    blocked: false,
                    direction: data.direction || null,
                };
            } catch {
                return { status: 'none', friend: false, pending: false, blocked: false, direction: null };
            }
        })();

        relationCache.set(cacheKey, promise);
        const result = await promise;
        relationCache.set(cacheKey, Promise.resolve(result));
        return result;
    }

    async function requestFriend(targetUserId) {
        const userId = currentUserId();
        if (!userId || !targetUserId || userId === targetUserId) return { success: false, error: 'invalid_target' };

        try {
            const res = await window.BSQ.api('/api/friends', {
                method: 'POST',
                body: JSON.stringify({ action: 'request', user_id: userId, friend_id: targetUserId })
            });
            clearFriendRelationCache(targetUserId);
            return res || { success: false, error: 'unknown_error' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async function blockUser(targetUserId) {
        const userId = currentUserId();
        const targetId = String(targetUserId || '').trim();
        if (!userId || !targetId || userId === targetId) return { success: false, error: 'invalid_target' };

        try {
            if (typeof window.BSQ?.api !== 'function') {
                return { success: false, error: 'api_unavailable' };
            }

            await window.BSQ.api('/api/contacts', {
                method: 'POST',
                body: JSON.stringify({ target_user_id: targetId })
            }).catch(() => null);

            const res = await window.BSQ.api('/api/contacts', {
                method: 'PATCH',
                body: JSON.stringify({ target_user_id: targetId, status: 'blocked' })
            });

            writeBlockedUserIds([...readBlockedUserIds(userId), targetId], userId);
            clearFriendRelationCache(targetId);
            return res || { success: true, blocked: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async function unblockUser(targetUserId) {
        const userId = currentUserId();
        const targetId = String(targetUserId || '').trim();
        if (!userId || !targetId || userId === targetId) return { success: false, error: 'invalid_target' };

        try {
            if (typeof window.BSQ?.api !== 'function') {
                return { success: false, error: 'api_unavailable' };
            }

            const res = await window.BSQ.api('/api/contacts', {
                method: 'PATCH',
                body: JSON.stringify({ target_user_id: targetId, status: 'active' })
            });

            writeBlockedUserIds(readBlockedUserIds(userId).filter((item) => String(item) !== targetId), userId);
            clearFriendRelationCache(targetId);
            return res || { success: true, unblocked: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    function toast(message) {
        if (typeof window.showToast === 'function') {
            window.showToast('info', '알림', message);
            return;
        }
        alert(message);
    }

    window.BSQCommunityShared = {
        loadSettings,
        saveSettings,
        applySettings,
        setTheme,
        toggleTheme,
        updateSetting,
        escapeHtml,
        escapeAttr,
        makePopupUrl,
        openPopupRoom,
        currentUserId,
        getFriendRelation,
        isBlockedUser,
        readBlockedUserIds,
        writeBlockedUserIds,
        clearFriendRelationCache,
        requestFriend,
        blockUser,
        unblockUser,
        toast,
    };

    applySettings();
})();
