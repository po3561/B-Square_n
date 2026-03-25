// sync_bridge.js - 모듈4: 서버 데이터 동기화 (D1 API 버전)
// Firebase/Supabase 의존성 완전 제거 → BSQ.api 기반
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.SyncBridge = (function () {
    let userId = null;
    let eventHandlers = {};
    let pollIntervals = {};
    let streamSources = {};

    function init(_db, _supabase, _userId) {
        // _db, _supabase 파라미터는 이전 호환성 유지용 (사용하지 않음)
        userId = _userId;
        console.log("🔄 SyncBridge initialized (D1 API) | userId:", userId);
    }

    function listenMessages(roomId, type, onAdd) {
        if (pollIntervals[roomId]) clearInterval(pollIntervals[roomId]);
        if (streamSources[roomId]) {
            streamSources[roomId].close();
            delete streamSources[roomId];
        }

        let lastTimestamp = 0;

        const streamBase = window.BSQ?.apiBaseUrl || window.location.origin;
        const streamUrl = `${streamBase}/api/dm/${roomId}/messages/stream?room_type=${encodeURIComponent(type)}&since=${lastTimestamp}`;

        try {
            const source = new EventSource(streamUrl, { withCredentials: true });
            streamSources[roomId] = source;
            source.addEventListener('message', (event) => {
                const msg = JSON.parse(event.data);
                lastTimestamp = new Date(msg.created_at || msg.timestamp || Date.now()).getTime();
                onAdd(msg.push_key || msg.id, msg);
            });
            source.addEventListener('error', () => {
                source.close();
                delete streamSources[roomId];
            });
        } catch (error) {
            console.warn('SSE init error:', error);
        }

        async function poll() {
            if (document.visibilityState !== 'visible') return;
            try {
                const endpoint = `/api/dm/${roomId}/messages?room_type=${encodeURIComponent(type)}&since=${lastTimestamp}&limit=100`;
                const res = await window.BSQ.api(endpoint);
                if (res?.success && res.data) {
                    res.data.forEach(msg => {
                        const msgTime = new Date(msg.timestamp || msg.created_at || Date.now()).getTime();
                        if (!lastTimestamp || msgTime > lastTimestamp) {
                            onAdd(msg.push_key || msg.id, msg);
                            lastTimestamp = Math.max(lastTimestamp, msgTime);
                        }
                    });
                }
            } catch (e) {
                console.warn("Poll error:", e);
            }
        }

        poll(); // 즉시 1회 실행
        pollIntervals[roomId] = setInterval(poll, 3000);
    }

    function stopListeningMessages(roomId) {
        if (streamSources[roomId]) {
            streamSources[roomId].close();
            delete streamSources[roomId];
        }
        if (pollIntervals[roomId]) {
            clearInterval(pollIntervals[roomId]);
            delete pollIntervals[roomId];
        }
    }

    // ---- D1 API 기반 프로필 로드 ----
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
        } catch (e) {
            console.warn("getUserProfile error:", e);
            return { name: '사용자', profile_image_url: '' };
        }
    }

    async function searchUsers(query) {
        try {
            const res = await window.BSQ.api(`/api/users/search?q=${encodeURIComponent(query)}`);
            if (res?.success) {
                return (res.data || []).filter(u => u.id !== userId);
            }
            return [];
        } catch (e) {
            return [];
        }
    }

    // ---- 읽지 않은 메시지 카운트 ----
    function updateUnread(roomId, count) {
        // D1에서는 폴링으로 처리하므로 별도 구현 불필요 (로컬 상태만 관리)
    }

    async function markAsRead(roomId) {
        // user_chats의 unread_count를 0으로 설정하는 것은 서버 호출 불필요 — 로컬만 처리
    }

    // ---- 이벤트 시스템 ----
    function on(event, handler) {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
    }

    function emit(event, data) {
        if (eventHandlers[event]) {
            eventHandlers[event].forEach(h => h(data));
        }
    }

    // ---- 정리 ----
    function cleanup() {
        Object.keys(streamSources).forEach(key => streamSources[key].close());
        streamSources = {};
        Object.keys(pollIntervals).forEach(key => clearInterval(pollIntervals[key]));
        pollIntervals = {};
    }

    return {
        init, 
        watchPresence: () => {}, // D1에서는 지원하지 않음
        setupPresence: () => {}, // D1에서는 지원하지 않음
        listenMessages, stopListeningMessages,
        getUserProfile, searchUsers,
        updateUnread, markAsRead,
        on, emit, cleanup,
        getDb: () => null,
        getSupabase: () => null,
        getUserId: () => userId
    };
})();
