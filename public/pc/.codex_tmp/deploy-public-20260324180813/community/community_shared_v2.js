window.BSQCommunityShared = window.BSQCommunityShared || {};

(() => {
    const STORAGE_KEY = 'bsq_community_shell_settings_v2';

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

    function makePopupUrl({ roomId, roomType, name, avatar }) {
        const url = new URL('../community/message_popup.html', window.location.href);
        if (roomId) url.searchParams.set('room', roomId);
        if (roomType) url.searchParams.set('type', roomType);
        if (name) url.searchParams.set('name', name);
        if (avatar) url.searchParams.set('avatar', avatar);
        return url.toString();
    }

    function openPopupRoom(options = {}) {
        const url = makePopupUrl(options);
        const features = 'width=520,height=820,resizable=yes,scrollbars=no,noopener=yes,noreferrer=yes';
        const win = window.open(url, '_blank', features);
        if (win) win.focus();
        return win;
    }

    function currentUserId() {
        return window.CommunityModules?.SyncBridge?.getUserId?.() || window.BSQ?.session?.user?.id || '';
    }

    async function requestFriend(targetUserId) {
        const userId = currentUserId();
        if (!userId || !targetUserId || userId === targetUserId) return { success: false, error: 'invalid_target' };

        try {
            const res = await window.BSQ.api('/api/friends', {
                method: 'POST',
                body: JSON.stringify({ action: 'request', user_id: userId, friend_id: targetUserId })
            });
            return res || { success: false, error: 'unknown_error' };
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
        requestFriend,
        toast,
    };

    applySettings();
})();
