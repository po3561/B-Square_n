// chat_list.js - 모듈2: 채팅 목록 관리
// 우클릭/롱프레스 컨텍스트 메뉴, 폴더 분류, 고정/음소거
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatList = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;
    let currentFilter = 'all';
    let currentFolder = null;
    let roomsCache = {};
    let onRoomSelect = null;

    // 사용자별 설정 (localStorage)
    function getSettings() {
        try {
            return JSON.parse(localStorage.getItem('bsq_chat_settings') || '{}');
        } catch { return {}; }
    }
    function saveSettings(s) { localStorage.setItem('bsq_chat_settings', JSON.stringify(s)); }

    function getPinned() { return getSettings().pinned || []; }
    function getMuted() { return getSettings().muted || []; }
    function getFolders() { return getSettings().folders || []; }
    function getRoomFolders() { return getSettings().roomFolders || {}; }

    function togglePin(roomId) {
        const s = getSettings();
        s.pinned = s.pinned || [];
        const idx = s.pinned.indexOf(roomId);
        if (idx >= 0) s.pinned.splice(idx, 1);
        else s.pinned.push(roomId);
        saveSettings(s);
        renderRooms();
    }
    function toggleMute(roomId) {
        const s = getSettings();
        s.muted = s.muted || [];
        const idx = s.muted.indexOf(roomId);
        if (idx >= 0) s.muted.splice(idx, 1);
        else s.muted.push(roomId);
        saveSettings(s);
        renderRooms();
    }
    function addFolder(name) {
        const s = getSettings();
        s.folders = s.folders || [];
        if (!s.folders.includes(name)) {
            s.folders.push(name);
            saveSettings(s);
        }
        renderFolderTabs();
        renderFolderManagerList();
    }
    function removeFolder(name) {
        const s = getSettings();
        s.folders = (s.folders || []).filter(f => f !== name);
        const rf = s.roomFolders || {};
        Object.keys(rf).forEach(rid => {
            if (rf[rid] === name) delete rf[rid];
        });
        s.roomFolders = rf;
        saveSettings(s);
        if (currentFolder === name) currentFolder = null;
        renderFolderTabs();
        renderRooms();
        renderFolderManagerList();
    }
    function assignFolder(roomId, folderName) {
        const s = getSettings();
        s.roomFolders = s.roomFolders || {};
        if (folderName) s.roomFolders[roomId] = folderName;
        else delete s.roomFolders[roomId];
        saveSettings(s);
        renderRooms();
    }

    function init(selectCallback) {
        onRoomSelect = selectCallback;
        setupFilterTabs();
        setupSearch();
        loadChatRooms();
        renderFolderTabs();
        setupFolderModal();
        setupContextMenu();
        console.log("📋 ChatList initialized");
    }

    function setupFilterTabs() {
        document.querySelectorAll('.stab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                currentFolder = null;
                document.querySelectorAll('.folder-tab').forEach(f => f.classList.remove('active'));
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

    // ==== 채팅방 로드 ====
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
                        if (roomInfo.target_id) {
                            try {
                                const profile = await bridge().getUserProfile(roomInfo.target_id);
                                roomInfo.target_name = profile.name || '사용자';
                                roomInfo.target_avatar = profile.profile_image_url || '';
                            } catch (e) { }
                        }
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
                    } else if (roomInfo.type === 'group') {
                        const metaSnap = await db.ref(`group_chats/${roomId}/meta`).once('value');
                        const meta = metaSnap.val() || {};
                        lastMsg = meta.last_message || '';
                        lastTime = meta.last_timestamp || lastTime;
                    }
                } catch (e) { /* ignore */ }

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

    // ==== 렌더링 ====
    function renderRooms(searchQuery = '') {
        const list = document.getElementById('chatRoomList');
        if (!list) return;

        const pinned = getPinned();
        const muted = getMuted();
        const roomFolders = getRoomFolders();
        let rooms = Object.values(roomsCache);

        // 필터
        if (currentFilter !== 'all') {
            rooms = rooms.filter(r => r.type === currentFilter);
        }

        // 폴더 필터
        if (currentFolder) {
            rooms = rooms.filter(r => roomFolders[r.roomId] === currentFolder);
        }

        // 검색
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rooms = rooms.filter(r => {
                const name = (r.target_name || r.class_name || r.group_name || '').toLowerCase();
                return name.includes(q);
            });
        }

        // 정렬: 고정 먼저 → 최신순
        rooms.sort((a, b) => {
            const aPinned = pinned.includes(a.roomId) ? 1 : 0;
            const bPinned = pinned.includes(b.roomId) ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return (b.last_timestamp || 0) - (a.last_timestamp || 0);
        });

        if (rooms.length === 0) {
            list.innerHTML = `<div class="chat-list-empty"><span>💭</span><p>${searchQuery ? '검색 결과 없음' : '채팅이 없습니다'}</p></div>`;
            return;
        }

        list.innerHTML = rooms.map(r => {
            const name = r.target_name || r.class_name || r.group_name || '채팅방';
            const avatar = r.target_avatar || r.class_image || r.group_image || '';
            const preview = r.last_message || '';
            const time = r.last_timestamp ? formatTime(r.last_timestamp) : '';
            const unread = r.unread_count || 0;
            const isPinned = pinned.includes(r.roomId);
            const isMuted = muted.includes(r.roomId);
            const folder = roomFolders[r.roomId];

            let typeBadge = '';
            if (r.type === 'class') typeBadge = '<span class="room-type-badge">클래스</span>';
            else if (r.type === 'group') typeBadge = '<span class="room-type-badge">그룹</span>';

            return `
                <div class="chat-room-item${isPinned ? ' pinned' : ''}" data-room-id="${r.roomId}" data-type="${r.type}">
                    <div class="room-avatar" style="${avatar ? `background-image:url(${avatar})` : ''}">
                        ${!avatar ? (r.type === 'group' ? '👥' : '👤') : ''}
                    </div>
                    <div class="room-info">
                        <div class="room-name-row">
                            <span class="room-name">
                                ${name}${typeBadge}
                                ${isPinned ? '<span class="room-pin-icon">📌</span>' : ''}
                                ${isMuted ? '<span class="room-mute-icon">🔕</span>' : ''}
                                ${folder ? `<span class="room-folder-tag">${folder}</span>` : ''}
                            </span>
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

            // 우클릭 (PC)
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showRoomContextMenu(e.clientX, e.clientY, item.dataset.roomId, item.dataset.type);
            });

            // 롱프레스 (모바일)
            let pressTimer;
            item.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    const touch = e.touches[0];
                    showRoomContextMenu(touch.clientX, touch.clientY, item.dataset.roomId, item.dataset.type);
                }, 700);
            }, { passive: true });
            item.addEventListener('touchend', () => clearTimeout(pressTimer));
            item.addEventListener('touchmove', () => clearTimeout(pressTimer));
        });
    }

    // ==== 채팅방 컨텍스트 메뉴 ====
    function setupContextMenu() {
        document.addEventListener('click', () => {
            document.getElementById('roomContextMenu').style.display = 'none';
        });
    }

    function showRoomContextMenu(x, y, roomId, type) {
        const menu = document.getElementById('roomContextMenu');
        if (!menu) return;

        const isPinned = getPinned().includes(roomId);
        const isMuted = getMuted().includes(roomId);
        const folders = getFolders();

        // 폴더 추가 서브메뉴
        let folderHtml = '';
        if (folders.length > 0) {
            folderHtml = folders.map(f => `<div class="ctx-item ctx-sub" data-action="assign-folder" data-folder="${f}"><span>📁</span>${f}</div>`).join('');
            folderHtml += `<div class="ctx-item ctx-sub" data-action="assign-folder" data-folder=""><span>❌</span>폴더 해제</div>`;
        }

        menu.innerHTML = `
            <div class="ctx-item" data-action="pin"><span>${isPinned ? '📌' : '📌'}</span>${isPinned ? '고정 해제' : '고정'}</div>
            <div class="ctx-item" data-action="mute"><span>${isMuted ? '🔔' : '🔕'}</span>${isMuted ? '알림 켜기' : '알림 끄기'}</div>
            <div class="ctx-item" data-action="mark-read"><span>👁️</span>읽음으로 표시</div>
            ${folders.length > 0 ? `<div class="ctx-item" data-action="show-folders"><span>📂</span>폴더에 추가 ▸</div>` : ''}
            <div class="ctx-item" data-action="clear-chat"><span>🧹</span>대화 내용 비우기</div>
            <div class="ctx-item danger" data-action="delete-chat"><span>🗑️</span>대화 삭제</div>
        `;

        // 위치 보정
        menu.style.display = 'block';
        const menuW = menu.offsetWidth;
        const menuH = menu.offsetHeight;
        menu.style.left = Math.min(x, window.innerWidth - menuW - 10) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - menuH - 10) + 'px';

        // 이벤트
        menu.querySelectorAll('.ctx-item').forEach(item => {
            item.onclick = async () => {
                const action = item.dataset.action;
                if (action === 'pin') togglePin(roomId);
                else if (action === 'mute') toggleMute(roomId);
                else if (action === 'mark-read') bridge().markAsRead(roomId);
                else if (action === 'show-folders') {
                    // 서브메뉴로 교체
                    menu.innerHTML = `
                        <div class="ctx-item" data-action="back"><span>←</span>뒤로</div>
                        ${folderHtml}
                    `;
                    attachFolderActions(roomId, menu);
                    return; // don't close
                }
                else if (action === 'clear-chat') {
                    if (confirm('대화 내용을 모두 비우시겠습니까?')) {
                        try {
                            if (type === 'dm') await bridge().getDb().ref(`dm/${roomId}/messages`).remove();
                            else if (type === 'class') await bridge().getDb().ref(`chats/${roomId}`).remove();
                            else if (type === 'group') await bridge().getDb().ref(`group_chats/${roomId}/messages`).remove();
                        } catch (e) { console.error(e); }
                    }
                }
                else if (action === 'delete-chat') {
                    if (confirm('이 대화를 삭제하시겠습니까?')) {
                        const userId = bridge().getUserId();
                        await bridge().getDb().ref(`user_chats/${userId}/${roomId}`).remove();
                    }
                }
                menu.style.display = 'none';
            };
        });
    }

    function attachFolderActions(roomId, menu) {
        menu.querySelectorAll('.ctx-item').forEach(item => {
            item.onclick = () => {
                const action = item.dataset.action;
                if (action === 'back') {
                    showRoomContextMenu(parseInt(menu.style.left), parseInt(menu.style.top), roomId, '');
                    return;
                }
                if (action === 'assign-folder') {
                    assignFolder(roomId, item.dataset.folder || null);
                }
                menu.style.display = 'none';
            };
        });
    }

    // ==== 폴더 탭 렌더링 ====
    function renderFolderTabs() {
        const container = document.getElementById('folderTabs');
        if (!container) return;
        const folders = getFolders();
        if (folders.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'flex';
        container.innerHTML = folders.map(f =>
            `<button class="folder-tab${currentFolder === f ? ' active' : ''}" data-folder="${f}">${f}</button>`
        ).join('');

        container.querySelectorAll('.folder-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const folder = btn.dataset.folder;
                if (currentFolder === folder) {
                    currentFolder = null;
                    btn.classList.remove('active');
                } else {
                    currentFolder = folder;
                    container.querySelectorAll('.folder-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
                renderRooms();
            });
        });
    }

    // ==== 폴더 관리 모달 ====
    function setupFolderModal() {
        document.getElementById('btnCreateFolder')?.addEventListener('click', () => {
            const input = document.getElementById('newFolderInput');
            const name = input?.value.trim();
            if (name) {
                addFolder(name);
                input.value = '';
            }
        });
        renderFolderManagerList();
    }

    function renderFolderManagerList() {
        const list = document.getElementById('folderList');
        if (!list) return;
        const folders = getFolders();
        const roomFolders = getRoomFolders();

        list.innerHTML = folders.map(f => {
            const count = Object.values(roomFolders).filter(rf => rf === f).length;
            return `<div class="folder-item">
                <span class="folder-item-name">${f}</span>
                <span class="folder-item-count">대화 ${count}개</span>
                <button onclick="window.CommunityModules.ChatList.removeFolder('${f}')" title="삭제">🗑️</button>
            </div>`;
        }).join('') || '<p style="color:var(--comm-text2);text-align:center;font-size:0.85rem;">폴더가 없습니다</p>';
    }

    // ==== 시간 포맷 ====
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

    return {
        init, renderRooms, setActiveRoom, loadChatRooms,
        removeFolder, addFolder, renderFolderManagerList, renderFolderTabs
    };
})();
