// sync_bridge.js - 모듈4: 이벤트 감지 + 서버 간 데이터 동기화
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.SyncBridge = (function () {
    let db = null;
    let supabase = null;
    let userId = null;
    let listeners = {};
    let eventHandlers = {};

    function init(_db, _supabase, _userId) {
        db = _db;
        supabase = _supabase;
        userId = _userId;
        console.log("🔄 SyncBridge initialized | userId:", userId);
        setupPresence();
    }

    // ---- 온라인 상태 관리 ----
    function setupPresence() {
        if (!userId) return;
        if (window.__BSQ_DEV_MODE__) return; // 운영자는 흔적을 남기지 않음

        const presenceRef = db.ref(`presence/${userId}`);
        presenceRef.set({ online: true, last_seen: firebase.database.ServerValue.TIMESTAMP });
        presenceRef.onDisconnect().set({ online: false, last_seen: firebase.database.ServerValue.TIMESTAMP });
    }

    function watchPresence(targetUserId, callback) {
        const ref = db.ref(`presence/${targetUserId}`);
        ref.on('value', snap => {
            const data = snap.val() || { online: false };
            callback(data);
        });
        registerListener(`presence_${targetUserId}`, ref);
    }

    // ---- Firebase 리스너 관리 ----
    function listenMessages(path, onAdd, onChange, onRemove) {
        const ref = db.ref(path);
        ref.on('child_added', snap => onAdd(snap.key, snap.val()));
        ref.on('child_changed', snap => onChange(snap.key, snap.val()));
        ref.on('child_removed', snap => onRemove(snap.key, snap.val()));
        registerListener(`msg_${path}`, ref);
    }

    function stopListeningMessages(path) {
        const key = `msg_${path}`;
        if (listeners[key]) {
            listeners[key].off();
            delete listeners[key];
        }
    }

    function registerListener(key, ref) {
        if (listeners[key]) listeners[key].off();
        listeners[key] = ref;
    }

    // ---- Supabase 프로필 로드 ----
    async function getUserProfile(uid) {
        if (uid === 'OPERATOR_GHOST') {
            return { name: '운영자', profile_image_url: 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png', is_operator: true };
        }

        try {
            const { data } = await supabase.from('users').select('name, email, profile_image_url, status_message').eq('id', uid).maybeSingle();
            return data || { name: '사용자', profile_image_url: '' };
        } catch (e) {
            return { name: '사용자', profile_image_url: '' };
        }
    }

    async function searchUsers(query) {
        try {
            const { data } = await supabase.from('users').select('id, name, email, profile_image_url')
                .ilike('name', `%${query}%`).limit(20);
            return (data || []).filter(u => u.id !== userId);
        } catch (e) {
            return [];
        }
    }

    // ---- 읽지 않은 메시지 카운트 업데이트 ----
    function updateUnread(roomId, count) {
        if (!userId) return;
        db.ref(`user_chats/${userId}/${roomId}/unread_count`).set(count);
    }

    function markAsRead(roomId) {
        if (!userId) return;
        db.ref(`user_chats/${userId}/${roomId}`).update({
            unread_count: 0,
            last_seen: firebase.database.ServerValue.TIMESTAMP
        });
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
        Object.values(listeners).forEach(ref => ref.off());
        listeners = {};
    }

    return {
        init, setupPresence, watchPresence,
        listenMessages, stopListeningMessages,
        getUserProfile, searchUsers,
        updateUnread, markAsRead,
        on, emit, cleanup,
        getDb: () => db,
        getSupabase: () => supabase,
        getUserId: () => userId
    };
})();
