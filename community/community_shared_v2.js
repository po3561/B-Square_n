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

    function normalizeGatheringData(input = {}) {
        const raw = input && typeof input === 'object' ? { ...input } : {};
        const contentPayload = typeof raw.content === 'string' ? tryParseJson(raw.content) : null;
        const messagePayload = typeof raw.message === 'string' ? tryParseJson(raw.message) : null;
        const payload = contentPayload || messagePayload || {};
        const joinedCount = Number(raw.current_count ?? raw.joined_count ?? payload.current_count ?? 0) || 0;
        const minCapacity = Number(raw.capacity_min ?? raw.min_capacity ?? payload.capacity_min ?? payload.min_capacity ?? 0) || 0;
        const maxCapacity = Number(raw.capacity_max ?? raw.max_capacity ?? payload.capacity_max ?? payload.max_capacity ?? 0) || 0;
        const gatheringAt = String(raw.gathering_at || raw.gather_time || payload.gathering_at || payload.gather_time || '').trim();
        const location = String(raw.location || raw.gather_place || payload.location || payload.gather_place || '').trim();
        const title = String(raw.title || raw.gather_title || payload.title || payload.gather_title || '모집 카드').trim() || '모집 카드';
        const description = String(raw.description || payload.description || '').trim();
        const status = String(raw.status || payload.status || 'open').trim().toLowerCase() || 'open';
        const roomId = String(raw.room_id || raw.class_id || payload.class_id || '').trim();
        const gatherId = String(raw.gathering_id || raw.id || payload.gathering_id || payload.id || '').trim();
        const createdBy = String(raw.user_name || raw.sender_name || payload.user_name || payload.sender_name || '').trim();
        const participantLabel = maxCapacity > 0 ? `${joinedCount} / ${maxCapacity}명` : `${joinedCount}명`;
        return {
            ...raw,
            title,
            description,
            location,
            gathering_at: gatheringAt,
            current_count: joinedCount,
            capacity_min: minCapacity,
            min_capacity: minCapacity,
            capacity_max: maxCapacity,
            max_capacity: maxCapacity,
            status,
            room_id: roomId,
            gathering_id: gatherId,
            created_by: createdBy,
            participantLabel,
            isFull: maxCapacity > 0 && joinedCount >= maxCapacity,
        };
    }

    function tryParseJson(value) {
        if (!value || typeof value !== 'string') return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }

    function formatGatheringDate(value) {
        if (!value) return '일정 미정';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
        });
    }

    function renderGatheringPreviewHtml(input = {}, options = {}) {
        const data = normalizeGatheringData(input);
        const canJoin = typeof options.onJoin === 'function';
        const canClose = typeof options.onClose === 'function';
        const statusLabel = data.status === 'closed'
            ? '마감'
            : data.isFull
                ? '정원 마감'
                : '진행중';
        const statusTone = data.status === 'closed' || data.isFull ? 'danger' : 'primary';
        const locationHtml = data.location
            ? `<button type="button" class="gathering-preview-action secondary" data-gathering-action="map"><i class="fa-solid fa-location-dot"></i><span>장소 보기</span></button>`
            : `<button type="button" class="gathering-preview-action secondary" disabled><i class="fa-solid fa-location-dot"></i><span>장소 정보 없음</span></button>`;
        const joinLabel = data.status === 'closed'
            ? '마감됨'
                : data.isFull
                    ? '정원 초과'
                    : '모임 참여';
        const joinDisabled = !canJoin || data.status === 'closed' || data.isFull;
        const closeDisabled = !canClose;
        const closeLabel = data.status === 'closed' ? '마감 완료' : '모임 마감';

        return `
            <div class="gathering-preview-shell">
                <div class="gathering-preview-hero">
                    <div class="gathering-preview-head">
                        <span class="gathering-preview-kicker">모집 카드</span>
                        <span class="gathering-preview-status ${statusTone}">${escapeHtml(statusLabel)}</span>
                    </div>
                    <h4 class="gathering-preview-title">${escapeHtml(data.title)}</h4>
                    <p class="gathering-preview-subtitle">${escapeHtml(data.gathering_at ? formatGatheringDate(data.gathering_at) : '일정 미정')}</p>
                </div>
                <div class="gathering-preview-grid">
                    <div class="gathering-preview-card">
                        <span class="gathering-preview-label">시간</span>
                        <strong class="gathering-preview-value">${escapeHtml(data.gathering_at ? formatGatheringDate(data.gathering_at) : '일정 미정')}</strong>
                    </div>
                    <div class="gathering-preview-card">
                        <span class="gathering-preview-label">장소</span>
                        <strong class="gathering-preview-value">${escapeHtml(data.location || '장소 미정')}</strong>
                    </div>
                    <div class="gathering-preview-card">
                        <span class="gathering-preview-label">인원</span>
                        <strong class="gathering-preview-value">${escapeHtml(data.participantLabel)}</strong>
                    </div>
                </div>
                ${data.description ? `
                    <div class="gathering-preview-description">
                        <span class="gathering-preview-label">상세 설명</span>
                        <p>${escapeHtml(data.description)}</p>
                    </div>
                ` : ''}
                <div class="gathering-preview-actions">
                    ${locationHtml}
                    <button type="button" class="gathering-preview-action primary" data-gathering-action="join" ${joinDisabled ? 'disabled' : ''}>
                        <i class="fa-solid fa-user-plus"></i><span>${escapeHtml(joinLabel)}</span>
                    </button>
                    ${canClose ? `<button type="button" class="gathering-preview-action danger" data-gathering-action="close" ${closeDisabled ? 'disabled' : ''}><i class="fa-solid fa-flag-checkered"></i><span>${escapeHtml(closeLabel)}</span></button>` : ''}
                </div>
                ${data.created_by ? `<div class="gathering-preview-footer">작성자 · ${escapeHtml(data.created_by)}</div>` : ''}
            </div>
        `;
    }

    function setupGatheringPreviewShell() {
        const modal = document.getElementById('gatheringPreviewModal');
        const body = document.getElementById('gatheringPreviewBody');
        if (!modal || !body || modal.dataset.bsqBound === '1') return;
        modal.dataset.bsqBound = '1';

        const close = () => {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('gathering-preview-open');
        };

        const open = (data = {}, actions = {}) => {
            body.innerHTML = renderGatheringPreviewHtml(data, actions);
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('gathering-preview-open');

            const actionMap = {
                join: actions.onJoin,
                close: actions.onClose,
                map: actions.onMap,
            };

            body.querySelectorAll('[data-gathering-action]').forEach((btn) => {
                btn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = btn.dataset.gatheringAction;
                    const handler = actionMap[action];
                    if (typeof handler === 'function') {
                        await handler(normalizeGatheringData(data), btn);
                    } else if (action === 'map') {
                        const normalized = normalizeGatheringData(data);
                        if (normalized.location) {
                            window.open(`https://map.naver.com/v5/search/${encodeURIComponent(normalized.location)}`, '_blank', 'noopener');
                        }
                    } else if (action === 'join') {
                        const normalized = normalizeGatheringData(data);
                        if (normalized.status === 'closed' || normalized.isFull) {
                            toast(normalized.status === 'closed' ? '마감된 모집입니다.' : '정원이 가득 찼습니다.');
                        }
                    }
                });
            });
        };

        const closeButtons = modal.querySelectorAll('#btnGatheringPreviewClose, [data-gathering-action="close"]');
        closeButtons.forEach((btn) => btn.addEventListener('click', close));

        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display !== 'none') close();
        });

        window.BSQCommunityShared.openGatheringPreview = open;
        window.BSQCommunityShared.closeGatheringPreview = close;
        return { open, close };
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
        normalizeGatheringData,
        renderGatheringPreviewHtml,
        setupGatheringPreviewShell,
        openGatheringPreview: null,
        closeGatheringPreview: null,
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
