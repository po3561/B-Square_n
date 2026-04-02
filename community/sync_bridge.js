window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.SyncBridge = (function () {
    let userId = null;
    let eventHandlers = {};
    const listeners = new Map();
    const roomReadState = new Map();
    const MESSAGE_CURSOR_OVERLAP_MS = 1000;

    function init(_db, _supabase, _userId) {
        userId = _userId;
        console.log('SyncBridge initialized (D1 API) | userId:', userId);
    }

    function parseMaybeJson(value, fallback = null) {
        if (value == null || value === '') return fallback;
        if (typeof value === 'object') return value;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

      function normalizeMessage(row) {
          if (!row) return row;

          const normalized = { ...row };
          const content = normalized.content || normalized.message || normalized.text || '';
          normalized.content = content;
          normalized.message = normalized.message || content;
          normalized.text = normalized.text || content;
          normalized.file_data = normalized.file_data || normalized.image_url || null;
          const avatar = normalized.user_avatar
              || normalized.sender_avatar
              || normalized.avatar_url
              || normalized.profile_image_url
              || normalized.target_avatar
              || '';
          const senderName = normalized.user_name || normalized.sender_name || normalized.name || normalized.target_name || '';
          normalized.user_avatar = normalized.user_avatar || avatar;
          normalized.sender_avatar = normalized.sender_avatar || avatar;
          normalized.avatar_url = normalized.avatar_url || avatar;
          normalized.profile_image_url = normalized.profile_image_url || avatar;
          normalized.user_name = normalized.user_name || senderName;
          normalized.sender_name = normalized.sender_name || senderName;
          normalized.reactions = parseMaybeJson(normalized.reactions, {}) || {};
          normalized.reply_data = parseMaybeJson(normalized.reply_data, null);
          normalized.edited = !!(normalized.edited || normalized.is_edited === 1 || normalized.is_edited === true);

        if (normalized.reply_data && typeof normalized.reply_data === 'object') {
            normalized.reply_to = normalized.reply_to || normalized.reply_data.id || null;
            normalized.reply_text = normalized.reply_text || normalized.reply_data.message || normalized.reply_data.content || '';
            normalized.reply_user = normalized.reply_user || normalized.reply_data.user_name || normalized.reply_data.sender_name || '';
        }

        if ((normalized.type === 'gathering' || normalized.type === 'gathering_card') && content && !normalized.gather_title) {
            const payload = parseMaybeJson(content, null);
            if (payload && typeof payload === 'object') {
                normalized.gather_title = payload.title || payload.gather_title || '';
                normalized.gather_time = payload.gathering_at || payload.gather_time || '';
                normalized.gather_place = payload.location || payload.gather_place || '';
                normalized.min_capacity = payload.min_capacity || payload.capacity_min || normalized.min_capacity || null;
                normalized.capacity_min = payload.capacity_min || payload.min_capacity || normalized.capacity_min || null;
                normalized.max_capacity = payload.max_capacity || payload.capacity_max || normalized.max_capacity || null;
                normalized.capacity_max = payload.capacity_max || payload.max_capacity || normalized.capacity_max || null;
                normalized.current_count = payload.current_count || normalized.current_count || 0;
                normalized.status = payload.status || normalized.status || 'open';
                normalized.type = 'gathering_card';
            }
        }

        return normalized;
    }

    function messageCursor(msg) {
        const ts = new Date(msg?.updated_at || msg?.created_at || msg?.timestamp || Date.now()).getTime();
        if (Number.isFinite(ts) && ts > 0) return ts;

        const numericId = Number(msg?.id || msg?.key);
        if (Number.isFinite(numericId)) return numericId;
        return 0;
    }

    function messageSignature(msg) {
        const reactionEntries = msg?.reactions && typeof msg.reactions === 'object'
            ? Object.keys(msg.reactions)
                .sort()
                .map((key) => `${key}=${serializeReactionValue(msg.reactions[key])}`)
                .join('|')
            : '';

          return [
              msg?.type || '',
              msg?.content || '',
              msg?.message || '',
              msg?.text || '',
              msg?.user_avatar || '',
              msg?.sender_avatar || '',
              msg?.profile_image_url || '',
              msg?.file_name || '',
              msg?.file_size || '',
              msg?.file_data ? 'file' : '',
            msg?.gather_title || '',
            msg?.gather_time || '',
            msg?.gather_place || '',
            msg?.capacity_min || '',
            msg?.capacity_max || '',
            msg?.current_count || '',
            msg?.status || '',
            msg?.reply_to || '',
            msg?.reply_text || '',
            msg?.reply_user || '',
            msg?.is_pinned ? '1' : '0',
            msg?.edited ? '1' : '0',
            msg?.updated_at || '',
            msg?.timestamp || msg?.created_at || '',
            reactionEntries,
        ].join('||');
    }

    function serializeReactionValue(value) {
        if (!value) return '';
        if (Array.isArray(value)) return value.map(String).sort().join(',');
        if (typeof value === 'object') return Object.keys(value).sort().map((key) => `${key}:${value[key]}`).join(',');
        return String(value);
    }

    function roomKey(roomId, type = 'dm') {
        return `${String(type || 'dm')}:${String(roomId || '')}`;
    }

    function buildMessagesUrl(roomId, type, { since = '', limit = 100, pinnedOnly = false, stream = false } = {}) {
        const roomType = String(type || 'dm');

        if (roomType === 'class') {
            const params = new URLSearchParams();
            params.set('class_id', String(roomId));
            params.set('limit', String(limit));
            if (since !== '' && since != null) params.set('since', String(since));
            if (pinnedOnly) params.set('pinned_only', '1');
            if (stream) params.set('stream', '1');
            return `/api/chat?${params.toString()}`;
        }

        const params = new URLSearchParams();
        params.set('room_type', roomType);
        params.set('limit', String(limit));
        if (since !== '' && since != null) params.set('since', String(since));
        if (pinnedOnly) params.set('pinned_only', '1');
        if (stream) {
            params.set('stream', '1');
            return `/api/dm/${encodeURIComponent(String(roomId))}/messages/stream?${params.toString()}`;
        }
        return `/api/dm/${encodeURIComponent(String(roomId))}/messages?${params.toString()}`;
    }

    function replaySince(cursor, overlapMs = MESSAGE_CURSOR_OVERLAP_MS) {
        const numeric = Number(cursor);
        const overlap = Math.max(0, Number(overlapMs) || 0);
        if (!Number.isFinite(numeric) || numeric <= 0) return 0;
        return Math.max(0, numeric - overlap);
    }

    function stopListenerState(state) {
        if (!state) return;
        state.stopped = true;

        if (state.stream) {
            try {
                state.stream.close();
            } catch {}
            state.stream = null;
        }

        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }

        if (state.visibilityHandler) {
            document.removeEventListener('visibilitychange', state.visibilityHandler);
            state.visibilityHandler = null;
        }
    }

    function stopListeningMessages(roomId, type = 'dm') {
        const key = roomKey(roomId, type);
        const state = listeners.get(key);
        if (!state) return;
        stopListenerState(state);
        listeners.delete(key);
    }

    function listenMessages(roomId, type, onAdd, options = {}) {
        if (!roomId) {
            return {
                stop: () => {},
                refresh: async () => {},
                prime: () => {},
                setCursor: () => {},
                getCursor: () => 0,
                getMode: () => 'idle',
            };
        }

        const key = roomKey(roomId, type);
        stopListeningMessages(roomId, type);

        const state = {
            roomId,
            type: String(type || 'dm'),
            cursor: Number(options.since) || 0,
            seen: new Map(),
            stream: null,
            pollTimer: null,
            pollInFlight: false,
            pollInterval: Math.max(1000, Number(options.pollInterval) || 3500),
            limit: Math.min(Math.max(Number(options.limit) || 100, 1), 200),
            cursorOverlapMs: Math.max(0, Number(options.cursorOverlapMs) || MESSAGE_CURSOR_OVERLAP_MS),
            preferSse: options.preferSse !== false,
            fallbackActive: false,
            stopped: false,
            onAdd: typeof onAdd === 'function' ? onAdd : null,
            onStatus: typeof options.onStatus === 'function' ? options.onStatus : null,
            onError: typeof options.onError === 'function' ? options.onError : null,
            visibilityHandler: null,
        };

        listeners.set(key, state);

        const emitMessage = (row, source) => {
            const msg = normalizeMessage(row);
            const id = String(msg.id || msg.key || '');
            if (!id) return false;

            const signature = messageSignature(msg);
            if (state.seen.get(id) === signature) return false;

            state.seen.set(id, signature);
            const cursor = messageCursor(msg);
            if (cursor > state.cursor) state.cursor = cursor;

            try {
                state.onAdd?.(msg, {
                    source,
                    roomId,
                    type: state.type,
                    cursor: state.cursor,
                });
            } catch (error) {
                console.warn('SyncBridge listener callback error:', error);
            }

            return true;
        };

        const prime = (messages) => {
            if (!Array.isArray(messages)) return;
            messages.forEach((row) => {
                const msg = normalizeMessage(row);
                const id = String(msg.id || msg.key || '');
                if (!id) return;
                state.seen.set(id, messageSignature(msg));
                const cursor = messageCursor(msg);
                if (cursor > state.cursor) state.cursor = cursor;
            });
        };

        const pollOnce = async () => {
            if (state.stopped || state.pollInFlight) return;
            if (document.visibilityState !== 'visible') return;

            state.pollInFlight = true;
            try {
                const endpoint = buildMessagesUrl(roomId, state.type, {
                    since: replaySince(state.cursor, state.cursorOverlapMs),
                    limit: state.limit,
                });
                const res = await window.BSQ.api(endpoint);
                const rows = res?.success
                    ? (Array.isArray(res.data) ? res.data : (res.data?.messages || []))
                    : [];

                let maxCursor = state.cursor;
                for (const row of rows) {
                    const msg = normalizeMessage(row);
                    const id = String(msg.id || msg.key || '');
                    if (!id) continue;

                    const signature = messageSignature(msg);
                    if (state.seen.get(id) === signature) continue;

                    state.seen.set(id, signature);
                    const cursor = messageCursor(msg);
                    if (cursor > maxCursor) maxCursor = cursor;
                    emitMessage(msg, 'poll');
                }

                if (maxCursor > state.cursor) state.cursor = maxCursor;
            } catch (error) {
                state.onError?.(error);
                console.warn('SyncBridge poll error:', error);
            } finally {
                state.pollInFlight = false;
                if (!state.stopped && state.fallbackActive) {
                    clearTimeout(state.pollTimer);
                    state.pollTimer = setTimeout(pollOnce, state.pollInterval);
                }
            }
        };

        const startFallback = (reason = 'error') => {
            if (state.stopped) return;
            if (!state.fallbackActive) {
                state.fallbackActive = true;
                state.onStatus?.('polling', { reason, roomId, type: state.type });
            }

            if (state.stream) {
                try {
                    state.stream.close();
                } catch {}
                state.stream = null;
            }

            clearTimeout(state.pollTimer);
            state.pollTimer = setTimeout(pollOnce, 0);
        };

        const startStream = () => {
            if (state.stopped) return;
            if (!state.preferSse || typeof EventSource === 'undefined') {
                startFallback('unsupported');
                return;
            }

            try {
                const url = buildMessagesUrl(roomId, state.type, {
                    since: replaySince(state.cursor, state.cursorOverlapMs),
                    limit: state.limit,
                    stream: true,
                });

                state.onStatus?.('connecting', { roomId, type: state.type });
                const source = new EventSource(url, { withCredentials: true });
                state.stream = source;

                source.addEventListener('message', (event) => {
                    if (!event?.data) return;
                    let data;
                    try {
                        data = JSON.parse(event.data);
                    } catch {
                        return;
                    }
                    emitMessage(data, 'sse');
                });

                source.addEventListener('open', () => {
                    if (state.stopped) return;
                    state.fallbackActive = false;
                    clearTimeout(state.pollTimer);
                    state.pollTimer = null;
                    state.onStatus?.('live', { roomId, type: state.type });
                });

                source.addEventListener('error', () => {
                    if (state.stopped) return;
                    startFallback('error');
                });
            } catch (error) {
                state.onError?.(error);
                startFallback('init_error');
            }
        };

        state.visibilityHandler = () => {
            if (state.stopped) return;
            if (document.visibilityState === 'visible' && state.fallbackActive) {
                clearTimeout(state.pollTimer);
                state.pollTimer = setTimeout(pollOnce, 0);
            }
        };
        document.addEventListener('visibilitychange', state.visibilityHandler);

        if (Array.isArray(options.seedMessages)) {
            prime(options.seedMessages);
        }

        state.setCursor = (cursor) => {
            const numeric = Number(cursor);
            if (Number.isFinite(numeric) && numeric > state.cursor) state.cursor = numeric;
        };

        state.prime = prime;
        state.refresh = pollOnce;
        state.getCursor = () => state.cursor;
        state.getMode = () => (state.fallbackActive ? 'polling' : (state.stream ? 'sse' : 'idle'));
        state.stop = () => stopListeningMessages(roomId, state.type);

        startStream();

        return {
            stop: state.stop,
            refresh: state.refresh,
            prime,
            setCursor: state.setCursor,
            getCursor: state.getCursor,
            getMode: state.getMode,
        };
    }

    // --- Existing helper API ---
    async function getUserProfile(uid) {
        if (uid === 'OPERATOR_GHOST') {
            return { name: '운영자', profile_image_url: '/assets/default-avatar.svg', is_operator: true };
        }

        try {
            const res = await window.BSQ.api(`/api/users/${uid}`);
            if (res?.success && res.data) {
                return res.data;
            }
            return { name: '사용자', profile_image_url: '' };
        } catch (error) {
            console.warn('getUserProfile error:', error);
            return { name: '사용자', profile_image_url: '' };
        }
    }

    async function searchUsers(query) {
        try {
            const res = await window.BSQ.api(`/api/users/search?q=${encodeURIComponent(query)}`);
            if (res?.success) {
                return (res.data || []).filter((u) => u.id !== userId);
            }
            return [];
        } catch {
            return [];
        }
    }

    function updateUnread(roomId, count) {
        emit('unread_updated', {
            roomId: String(roomId || ''),
            count: Number(count) || 0,
        });
    }

    async function markAsRead(roomId) {
        if (!roomId) return false;
        roomReadState.set(String(roomId), Date.now());
        emit('room_read', {
            roomId: String(roomId),
            userId,
        });
        return true;
    }

    function on(event, handler) {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
    }

    function emit(event, data) {
        if (eventHandlers[event]) {
            eventHandlers[event].forEach((handler) => handler(data));
        }
    }

    function cleanup() {
        for (const [key, state] of listeners.entries()) {
            stopListenerState(state);
            listeners.delete(key);
        }
        eventHandlers = {};
    }

    return {
        init,
        listenMessages,
        stopListeningMessages,
        getUserProfile,
        searchUsers,
        updateUnread,
        markAsRead,
        on,
        emit,
        cleanup,
        normalizeMessage,
        messageSignature,
        buildMessagesUrl,
        getDb: () => null,
        getSupabase: () => null,
        getUserId: () => userId,
    };
})();
