// sync_bridge.js - 모듈4: 서버 데이터 동기화 (D1 API 버전)
// Firebase/Supabase 의존성 완전 제거 → BSQ.api 기반
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.SyncBridge = (function () {
    let userId = null;
    let eventHandlers = {};
    let pollIntervals = {};

    function init(_db, _supabase, _userId) {
        // _db, _supabase 파라미터는 이전 호환성 유지용 (사용하지 않음)
        userId = _userId;
        console.log("🔄 SyncBridge initialized (D1 API) | userId:", userId);
    }

    // ---- D1 API 기반 메시지 리스닝 (폴링) ----
    function listenMessages(roomId, type, onAdd) {
        // 폴링 간격: 3초
        if (pollIntervals[roomId]) clearInterval(pollIntervals[roomId]);
        
        let lastTimestamp = null;

        async function poll() {
            try {
                let endpoint;
                if (type === 'dm') {
                    endpoint = `/api/dm?room_id=${roomId}&limit=100`;
                } else if (type === 'class') {
                    endpoint = `/api/chat?class_id=${roomId}&limit=100`;
                } else if (type === 'group') {
                    endpoint = `/api/dm?room_id=${roomId}&limit=100`; // 그룹 채팅도 dm 테이블 사용
                }
                
                const res = await window.BSQ.api(endpoint);
                if (res?.success && res.data) {
                    res.data.forEach(msg => {
                        const msgTime = msg.timestamp || msg.created_at || '';
                        if (!lastTimestamp || msgTime > lastTimestamp) {
                            onAdd(msg.push_key || msg.id, msg);
                        }
                    });
                    
                    if (res.data.length > 0) {
                        const lastMsg = res.data[res.data.length - 1];
                        lastTimestamp = lastMsg.timestamp || lastMsg.created_at;
                    }
                }
            } catch (e) {
                console.warn("Poll error:", e);
            }
        }

        poll(); // 즉시 1회 실행
        pollIntervals[roomId] = setInterval(poll, 3000);
    }

    function stopListeningMessages(roomId) {
        if (pollIntervals[roomId]) {
            clearInterval(pollIntervals[roomId]);
            delete pollIntervals[roomId];
        }
    }

    // ---- D1 API 기반 프로필 로드 ----
    async function getUserProfile(uid) {
        if (uid === 'OPERATOR_GHOST') {
            return { name: '운영자', profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png', is_operator: true };
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
