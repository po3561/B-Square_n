// chat_list.js - 모듈2: 채팅 목록 관리 (텔레그램 스타일)
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatList = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;
    let currentFilter = 'all';
    let roomsCache = {};
    let onRoomSelect = null;

    function init(selectCallback) {
        onRoomSelect = selectCallback;
        setupFilterTabs();
        loadChatRooms();
        setupSearch();
    }

    function setupFilterTabs() {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderRooms();
            });
        });
    }

    function setupSearch() {
        const input = document.getElementById('chatSearchInput');
        if (input) {
            input.addEventListener('input', () => renderRooms(input.value.trim()));
        }
    }

    function loadChatRooms() {
        const db = bridge().getDb();
        const userId = bridge().getUserId();
        if (!userId) return;

        db.ref(`user_chats/${userId}`).on('value', snap => {
            const data = snap.val() || {};
            roomsCache = {};

            const promises = Object.entries(data).map(async ([roomId, roomInfo]) => {
                let lastMsg = '';
                let lastTime = roomInfo.last_seen || 0;

                try {
                    if (roomInfo.type === 'dm') {
                        const metaSnap = await db.ref(`dm/${roomId}/meta`).once('value');
                        const meta = metaSnap.val() || {};
                        lastMsg = meta.last_message || '';
                        lastTime = meta.last_timestamp || lastTime;
                    } else if (roomInfo.type === 'class') {
                        const metaSnap = await db.ref(`chats/${roomId}`).limitToLast(1).once('value');
                        metaSnap.forEach(child => {
                            lastMsg = child.val().content || '';
                            lastTime = child.val().timestamp || lastTime;
                        });
                    }
                } catch (e) { /* 권한 오류 시 무시 */ }

                roomsCache[roomId] = {
                    ...roomInfo,
                    roomId,
                    last_message: lastMsg,
                    last_timestamp: lastTime,
                    unread_count: roomInfo.unread_count || 0
                };
            });

            Promise.all(promises).then(() => renderRooms());
        });
    }

    function renderRooms(searchQuery = '') {
        const list = document.getElementById('chatRoomList');
        if (!list) return;

        let rooms = Object.values(roomsCache);

        // 필터
        if (currentFilter !== 'all') {
            rooms = rooms.filter(r => r.type === currentFilter);
        }

        // 검색
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rooms = rooms.filter(r => {
                const name = (r.target_name || r.class_name || '').toLowerCase();
                return name.includes(q);
            });
        }

        // 최신순 정렬
        rooms.sort((a, b) => (b.last_timestamp || 0) - (a.last_timestamp || 0));

        if (rooms.length === 0) {
            list.innerHTML = `<div class="chat-list-empty"><span>💭</span><p>${searchQuery ? '검색 결과 없음' : '채팅이 없습니다'}</p></div>`;
            return;
        }

        list.innerHTML = rooms.map(r => {
            const name = r.target_name || r.class_name || '채팅방';
            const avatar = r.target_avatar || r.class_image || '';
            const preview = r.last_message || '';
            const time = r.last_timestamp ? formatTime(r.last_timestamp) : '';
            const unread = r.unread_count || 0;
            const typeBadge = r.type === 'class' ? '<span class="room-type-badge">클래스</span>' : '';

            return `
                <div class="chat-room-item" data-room-id="${r.roomId}" data-type="${r.type}">
                    <div class="room-avatar" style="${avatar ? `background-image:url(${avatar})` : ''}">
                        ${!avatar ? '👤' : ''}
                    </div>
                    <div class="room-info">
                        <div class="room-name-row">
                            <span class="room-name">${name}${typeBadge}</span>
                            <span class="room-time">${time}</span>
                        </div>
                        <div class="room-preview">${preview}</div>
                    </div>
                    ${unread > 0 ? `<div class="room-badge">${unread}</div>` : ''}
                </div>
            `;
        }).join('');

        // 클릭 이벤트
        list.querySelectorAll('.chat-room-item').forEach(item => {
            item.addEventListener('click', () => {
                list.querySelectorAll('.chat-room-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const roomId = item.dataset.roomId;
                const type = item.dataset.type;
                if (onRoomSelect) onRoomSelect(roomId, type, roomsCache[roomId]);
            });
        });
    }

    function formatTime(ts) {
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        const diff = Math.floor((now - d) / 86400000);
        if (diff === 1) return '어제';
        if (diff < 7) return d.toLocaleDateString('ko-KR', { weekday: 'short' });
        return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }

    function setActiveRoom(roomId) {
        document.querySelectorAll('.chat-room-item').forEach(i => {
            i.classList.toggle('active', i.dataset.roomId === roomId);
        });
    }

    return { init, renderRooms, setActiveRoom, loadChatRooms };
})();
