// chat_ui.js - 모듈3: 채팅 UI 기능
// 텔레그램 스타일 입력, 이모지, 파일, 테마 토글, 메시지 검색, 컨텍스트 메뉴
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatUI = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;
    const DM = () => window.CommunityModules.DM;
    let currentRoomId = null;
    let currentRoomType = null;
    let currentRoomInfo = null;
    let replyTarget = null;
    let editingMsgKey = null;

    const EMOJIS = ['😀', '😂', '🥰', '😍', '🤔', '😅', '😎', '🥳', '😢', '😡', '👍', '👎', '❤️', '🔥', '⭐', '🎉', '💯', '🙌', '👏', '🤝', '💪', '🙏', '✨', '💬', '📌', '📎', '🎵', '🎮', '☕', '🍕', '🎊', '💐', '🌈', '🍀', '🐶', '🐱', '🦊', '🐻'];

    function init() {
        setupInputUI();
        setupEmojiPicker();
        setupFileUpload();
        setupInputAutoResize();
        setupReply();
        setupThemeToggle();
        setupMessageSearch();
        restoreTheme();
        console.log("🎨 ChatUI initialized");
    }

    // ==== 입력 UI ====
    function setupInputUI() {
        // 전송 버튼은 항상 보임, 추가 로직 불필요
    }

    // ==== 테마 토글 (🌙 ↔ ☀️) ====
    function setupThemeToggle() {
        const btn = document.getElementById('btnThemeToggle');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            btn.textContent = next === 'dark' ? '🌙' : '☀️';
            localStorage.setItem('bsq_theme', next);
        });
    }

    function restoreTheme() {
        const saved = localStorage.getItem('bsq_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        const btn = document.getElementById('btnThemeToggle');
        if (btn) btn.textContent = saved === 'dark' ? '🌙' : '☀️';
    }

    // ==== 메시지 내 검색 ====
    function setupMessageSearch() {
        const btnSearch = document.getElementById('btnChatSearch');
        const searchBar = document.getElementById('chatSearchBar');
        const searchInput = document.getElementById('msgSearchInput');
        const searchClose = document.getElementById('msgSearchClose');
        const searchCount = document.getElementById('msgSearchCount');
        const searchPrev = document.getElementById('msgSearchPrev');
        const searchNext = document.getElementById('msgSearchNext');

        if (!btnSearch || !searchBar) return;

        let matches = [];
        let currentMatchIdx = -1;

        btnSearch.addEventListener('click', () => {
            const isOpen = searchBar.style.display !== 'none';
            searchBar.style.display = isOpen ? 'none' : 'flex';
            if (!isOpen) searchInput?.focus();
            else clearSearchHighlights();
        });

        searchClose?.addEventListener('click', () => {
            searchBar.style.display = 'none';
            clearSearchHighlights();
        });

        searchInput?.addEventListener('input', () => {
            clearSearchHighlights();
            const query = searchInput.value.trim().toLowerCase();
            if (!query) { searchCount.textContent = ''; return; }

            matches = [];
            currentMatchIdx = -1;
            document.querySelectorAll('.msg-bubble').forEach(bubble => {
                const text = bubble.textContent.toLowerCase();
                if (text.includes(query)) {
                    matches.push(bubble);
                    bubble.classList.add('search-highlight');
                }
            });
            searchCount.textContent = matches.length > 0 ? `${matches.length}개 발견` : '없음';
            if (matches.length > 0) navigateMatch(0);
        });

        searchPrev?.addEventListener('click', () => {
            if (matches.length > 0) navigateMatch(currentMatchIdx - 1);
        });
        searchNext?.addEventListener('click', () => {
            if (matches.length > 0) navigateMatch(currentMatchIdx + 1);
        });

        function navigateMatch(idx) {
            if (idx < 0) idx = matches.length - 1;
            if (idx >= matches.length) idx = 0;
            currentMatchIdx = idx;
            matches[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchCount.textContent = `${idx + 1} / ${matches.length}`;
        }

        function clearSearchHighlights() {
            document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
            matches = [];
            currentMatchIdx = -1;
        }
    }

    // ==== 채팅방 열기 ====
    function openRoom(roomId, roomType, roomInfo) {
        if (currentRoomId) {
            const prevPath = currentRoomType === 'class' ? `chats/${currentRoomId}` : currentRoomType === 'group' ? `group_chats/${currentRoomId}/messages` : `dm/${currentRoomId}/messages`;
            bridge().stopListeningMessages(prevPath);
        }

        currentRoomId = roomId;
        currentRoomType = roomType;
        currentRoomInfo = roomInfo || {};
        editingMsgKey = null;
        replyTarget = null;

        const container = document.getElementById('chatMessagesContainer');
        container.innerHTML = '';

        const noChatSelectedEl = document.getElementById('noChatSelected');
        if (noChatSelectedEl) noChatSelectedEl.style.display = 'none';

        const chatActiveAreaEl = document.getElementById('chatActiveArea');
        if (chatActiveAreaEl) chatActiveAreaEl.style.display = 'flex';

        // 입력 초기화
        const msgInput = document.getElementById('msgInput');
        if (msgInput) msgInput.value = '';

        // 검색바 숨기기
        const searchBar = document.getElementById('chatSearchBar');
        if (searchBar) searchBar.style.display = 'none';
        // 정보 패널 닫기
        const infoPanel = document.getElementById('commInfoPanel');
        if (infoPanel) infoPanel.style.display = 'none';

        // 헤더 업데이트
        const name = roomInfo?.target_name || roomInfo?.class_name || roomInfo?.group_name || '채팅방';
        const avatar = roomInfo?.target_avatar || roomInfo?.class_image || roomInfo?.group_image || '';
        document.getElementById('chatHeaderName').textContent = name;
        const avatarEl = document.getElementById('chatHeaderAvatar');
        if (avatarEl) {
            if (avatar) {
                avatarEl.style.backgroundImage = `url(${avatar})`;
                avatarEl.textContent = '';
            } else {
                avatarEl.style.backgroundImage = '';
                avatarEl.textContent = roomType === 'group' ? '👥' : '👤';
            }
        }

        // 아바타/이름 클릭 → 정보 패널 열기
        avatarEl.style.cursor = 'pointer';
        avatarEl.onclick = () => renderInfoPanel(roomId, roomType, roomInfo);
        const nameEl = document.getElementById('chatHeaderName');
        nameEl.style.cursor = 'pointer';
        nameEl.onclick = () => renderInfoPanel(roomId, roomType, roomInfo);

        // 상태
        const statusEl = document.getElementById('chatHeaderStatus');
        if (roomType === 'dm' && roomInfo?.target_id) {
            bridge().watchPresence(roomInfo.target_id, (p) => {
                statusEl.textContent = p.online ? '온라인' : '오프라인';
                statusEl.className = 'chat-header-status' + (p.online ? ' online' : '');
            });
        } else if (roomType === 'class') {
            statusEl.textContent = '클래스 채팅';
            statusEl.className = 'chat-header-status';
        } else if (roomType === 'group') {
            statusEl.textContent = '그룹 채팅';
            statusEl.className = 'chat-header-status';
        }

        bridge().markAsRead(roomId);

        // 메시지 리스너
        let msgPath;
        if (roomType === 'class') msgPath = `chats/${roomId}`;
        else if (roomType === 'group') msgPath = `group_chats/${roomId}/messages`;
        else msgPath = `dm/${roomId}/messages`;

        bridge().listenMessages(msgPath,
            (key, msg) => {
                if (roomType === 'class' && !msg.sender_id) {
                    msg.sender_id = msg.user_id;
                    msg.user_name = msg.user_name || '사용자';
                    msg.type = msg.type || 'text';
                }
                renderMessage(key, msg, 'add');
            },
            (key, msg) => {
                if (roomType === 'class' && !msg.sender_id) msg.sender_id = msg.user_id;
                renderMessage(key, msg, 'update');
            },
            (key) => removeMessage(key)
        );
    }

    // ==== 메시지 렌더링 ====
    async function renderMessage(msgId, msgData, append = true) {
        if (!msgData) return;

        let currentUserId = window.CommunityModules.SyncBridge.getUserId();
        if (window.__BSQ_DEV_MODE__) {
            currentUserId = 'OPERATOR_GHOST';
        }

        const isMine = msgData.sender_id === currentUserId;

        let row = document.getElementById(`msg-${msgId}`);
        if (!append && row) { // Update existing message
            const bubble = row.querySelector('.msg-bubble');
            if (bubble) bubble.textContent = msgData.content || '';
            const edited = row.querySelector('.msg-edited');
            if (msgData.edited && !edited) {
                const metaRow = row.querySelector('.msg-meta');
                if (metaRow) {
                    const ed = document.createElement('span');
                    ed.className = 'msg-edited';
                    ed.textContent = '수정됨';
                    metaRow.prepend(ed);
                }
            }
            return;
        }

        if (append && row) return; // Message already exists, no need to add again

        row = document.createElement('div');
        row.className = `msg-row ${isMine ? 'mine' : 'other'} ${msgData.sender_id === 'OPERATOR_GHOST' ? 'operator' : ''}`;
        row.id = `msg-${msgId}`;

        let senderName = msgData.user_name || msgData.sender_name || '';
        let senderAvatar = msgData.user_avatar || msgData.sender_avatar || '';

        if (msgData.sender_id === 'OPERATOR_GHOST') {
            senderName = '운영자';
            senderAvatar = 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png';
        }

        const timeStr = msgData.timestamp ? new Date(msgData.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

        let contentHtml = '';
        if (msgData.type === 'image' && msgData.file_data) {
            contentHtml = `<img class="msg-image" src="${msgData.file_data}" alt="이미지">`;
        } else if (msgData.type === 'file' && msgData.file_name) {
            contentHtml = `<div class="msg-file-attachment">
                <span class="file-icon">📄</span>
                <div class="file-info">
                    <span class="file-name">${msgData.file_name}</span>
                    <span class="file-size">${formatFileSize(msgData.file_size)}</span>
                </div>
            </div>`;
        } else {
            contentHtml = `<div class="msg-bubble">${escapeHtml(msgData.content || '')}</div>`;
        }

        const instructorBadge = (currentRoomType === 'class' && msgData.is_instructor)
            ? '<span class="chat-instructor-badge" style="background:var(--comm-accent); color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:10px; margin-left:6px; font-weight:600;">강사</span>'
            : '';

        row.innerHTML = `
            ${!isMine ? `<div class="msg-avatar-sm" style="${senderAvatar ? `background-image:url(${senderAvatar})` : ''}">${!senderAvatar ? '👤' : ''}</div>` : ''}
            <div class="msg-bubble-wrap">
                ${!isMine && (currentRoomType === 'class' || currentRoomType === 'group') ? `<span class="msg-sender-name">${senderName}${instructorBadge}</span>` : ''}
                ${contentHtml}
                <div class="msg-meta">
                    ${msgData.edited ? '<span class="msg-edited">수정됨</span>' : ''}
                    <span class="msg-time-sm">${timeStr}</span>
                    ${isMine ? '<span class="msg-read-check">✓</span>' : ''}
                </div>
            </div>
        `;

        // 컨텍스트 메뉴 (우클릭 / 롱프레스)
        setupMsgContextMenu(row, msgId, msgData, isMine);

        const container = document.getElementById('chatMessagesContainer');
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
    }

    function removeMessage(key) {
        document.getElementById(`msg-${key}`)?.remove();
    }

    // ==== 메시지 컨텍스트 메뉴 ====
    function setupMsgContextMenu(row, key, msg, isMine) {
        let pressTimer;

        const showMenu = (x, y) => {
            closeAllMenus();
            const menu = document.createElement('div');
            menu.className = 'msg-context-menu';
            menu.innerHTML = `
                <div class="ctx-item" data-action="reply"><span>↩️</span>답장</div>
                <div class="ctx-item" data-action="react"><span>😊</span>리액션</div>
                <div class="ctx-item" data-action="copy"><span>📋</span>복사</div>
                ${isMine ? `<div class="ctx-item" data-action="edit"><span>✏️</span>수정</div>` : ''}
                ${isMine ? `<div class="ctx-item danger" data-action="delete"><span>🗑️</span>삭제</div>` : ''}
            `;
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            document.body.appendChild(menu);

            menu.querySelectorAll('.ctx-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    if (action === 'reply') setReply(key, msg.content);
                    else if (action === 'copy') navigator.clipboard?.writeText(msg.content || '');
                    else if (action === 'edit') startEdit(key, msg.content);
                    else if (action === 'delete') deleteMsg(key);
                    else if (action === 'react') showQuickReact(row, key);
                    menu.remove();
                });
            });

            setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
        };

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMenu(e.clientX, e.clientY);
        });

        row.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                const touch = e.touches[0];
                showMenu(touch.clientX, touch.clientY);
            }, 700);
        }, { passive: true });
        row.addEventListener('touchend', () => clearTimeout(pressTimer));
        row.addEventListener('touchmove', () => clearTimeout(pressTimer));
    }

    function showQuickReact(row, key) {
        const picker = document.createElement('div');
        picker.className = 'msg-context-menu';
        picker.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;padding:8px;min-width:200px;';
        ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'].forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.style.cssText = 'font-size:1.3rem;cursor:pointer;padding:4px;border-radius:6px;';
            span.onmouseover = () => span.style.background = 'var(--comm-hover)';
            span.onmouseout = () => span.style.background = '';
            span.onclick = () => {
                if (currentRoomType === 'dm') DM().toggleReaction(currentRoomId, key, emoji);
                picker.remove();
            };
            picker.appendChild(span);
        });
        const rect = row.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.left = rect.left + 'px';
        picker.style.top = (rect.top - 50) + 'px';
        document.body.appendChild(picker);
        setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 100);
    }

    function setReply(key, text) {
        replyTarget = key;
        document.getElementById('replyPreview').style.display = 'flex';
        document.getElementById('replyText').textContent = text || '';
        document.getElementById('msgInput')?.focus();
    }

    function startEdit(key, content) {
        editingMsgKey = key;
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.value = content || '';
            msgInput.focus();
            msgInput.dispatchEvent(new Event('input'));
        }
    }

    async function deleteMsg(key) {
        if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
        try {
            if (currentRoomType === 'dm') {
                await DM().deleteMessage(currentRoomId, key);
            } else {
                const path = currentRoomType === 'class' ? `chats/${currentRoomId}/${key}` : `group_chats/${currentRoomId}/messages/${key}`;
                await bridge().getDb().ref(path).remove();
            }
        } catch (e) { console.error('Delete failed:', e); }
    }

    // ==== 메시지 전송 ====
    async function sendCurrentMessage() {
        const msgInput = document.getElementById('msgInput');
        const content = msgInput.value.trim();
        if (!content || !currentRoomId) return;

        try {
            // 운영자 모드 확인
            let currentUserId = window.CommunityModules.SyncBridge.getUserId();
            if (window.__BSQ_DEV_MODE__) {
                currentUserId = 'OPERATOR_GHOST';
            }

            if (editingMsgKey) {
                if (currentRoomType === 'dm') {
                    await DM().editMessage(currentRoomId, editingMsgKey, content);
                }
                editingMsgKey = null;
            } else if (currentRoomType === 'class') {
                const userId = bridge().getUserId();
                const profile = await bridge().getUserProfile(userId);
                await bridge().getDb().ref(`chats/${currentRoomId}`).push({
                    content,
                    sender_id: currentUserId,
                    user_id: userId,
                    user_name: profile.name || '사용자',
                    user_avatar: profile.profile_image_url || '',
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    type: 'text',
                    is_instructor: currentRoomInfo && currentRoomInfo.is_instructor ? true : false
                });
            } else if (currentRoomType === 'group') {
                const userId = bridge().getUserId();
                const profile = await bridge().getUserProfile(userId);
                await bridge().getDb().ref(`group_chats/${currentRoomId}/messages`).push({
                    content,
                    sender_id: currentUserId,
                    user_name: profile.name || '사용자',
                    user_avatar: profile.profile_image_url || '',
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    type: 'text'
                });
                await bridge().getDb().ref(`group_chats/${currentRoomId}/meta`).update({
                    last_message: content,
                    last_timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } else {
                const msgData = {
                    sender_id: currentUserId,
                    content: content,
                    type: currentRoomType === 'dm' ? undefined : 'text',
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    edited: false,
                    reactions: {}
                };
                await DM().sendMessage(currentRoomId, content, 'text', replyTarget, null, msgData);
            }

            msgInput.value = '';
            msgInput.dispatchEvent(new Event('input'));
            replyTarget = null;
            document.getElementById('replyPreview').style.display = 'none';
        } catch (e) {
            console.error('Send error:', e);
        }
    }

    // ==== 이모지 피커 ====
    function setupEmojiPicker() {
        const btn = document.getElementById('btnEmoji');
        const picker = document.getElementById('emojiPicker');
        const grid = document.getElementById('emojiGrid');
        if (!btn || !picker || !grid) return;

        grid.innerHTML = EMOJIS.map(e => `<span>${e}</span>`).join('');

        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        });

        grid.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const input = document.getElementById('msgInput');
                input.value += e.target.textContent;
                input.focus();
                input.dispatchEvent(new Event('input'));
                picker.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!picker.contains(e.target) && e.target !== btn) {
                picker.style.display = 'none';
            }
        });
    }

    // ==== 파일 업로드 ====
    function setupFileUpload() {
        const btn = document.getElementById('btnAttach');
        const fileInput = document.getElementById('fileInput');
        if (!btn || !fileInput) return;

        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

        // 드래그 앤 드롭
        const main = document.getElementById('commMain');
        const overlay = document.getElementById('fileDropOverlay');
        if (!main || !overlay) return;

        main.addEventListener('dragover', (e) => { e.preventDefault(); overlay.classList.add('active'); });
        main.addEventListener('dragleave', (e) => {
            if (!main.contains(e.relatedTarget)) overlay.classList.remove('active');
        });
        main.addEventListener('drop', (e) => {
            e.preventDefault();
            overlay.classList.remove('active');
            handleFileSelect(e.dataTransfer.files);
        });
    }

    function handleFileSelect(files) {
        if (!files || !currentRoomId) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const isImage = file.type.startsWith('image/');
                const fileData = { name: file.name, size: file.size, data: e.target.result };

                // 운영자 모드 확인
                let currentUserId = window.CommunityModules.SyncBridge.getUserId();
                if (window.__BSQ_DEV_MODE__) {
                    currentUserId = 'OPERATOR_GHOST';
                }

                if (currentRoomType === 'dm') {
                    const msgData = {
                        sender_id: currentUserId,
                        content: isImage ? '' : file.name,
                        type: isImage ? 'image' : 'file',
                        file_name: file.name,
                        file_size: file.size,
                        file_data: e.target.result,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };
                    await DM().sendMessage(currentRoomId, isImage ? '' : file.name, isImage ? 'image' : 'file', null, fileData, msgData);
                } else {
                    const userId = bridge().getUserId();
                    const profile = await bridge().getUserProfile(userId);
                    const path = currentRoomType === 'class' ? `chats/${currentRoomId}` : `group_chats/${currentRoomId}/messages`;
                    await bridge().getDb().ref(path).push({
                        content: isImage ? '' : file.name,
                        sender_id: currentUserId,
                        user_name: profile.name || '사용자',
                        type: isImage ? 'image' : 'file',
                        file_name: file.name,
                        file_size: file.size,
                        file_data: e.target.result,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // ==== 입력 자동 리사이즈 ====
    function setupInputAutoResize() {
        const msgInput = document.getElementById('msgInput');
        if (!msgInput) return;
        msgInput.addEventListener('input', () => {
            msgInput.style.height = 'auto';
            msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
        });
    }

    // ==== 답장 ====
    function setupReply() {
        document.getElementById('btnReplyCancel')?.addEventListener('click', () => {
            replyTarget = null;
            document.getElementById('replyPreview').style.display = 'none';
        });
    }

    // ==== 유틸 ====
    function closeAllMenus() {
        document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / 1048576).toFixed(1) + 'MB';
    }

    // ==== 정보 패널 렌더링 ====
    async function renderInfoPanel(roomId, roomType, roomInfo) {
        const panel = document.getElementById('commInfoPanel');
        const title = document.getElementById('infoPanelTitle');
        const body = document.getElementById('infoPanelBody');
        if (!panel || !body) return;

        const isOpen = panel.style.display !== 'none';
        if (isOpen) { panel.style.display = 'none'; return; }

        panel.style.display = 'flex';
        body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--comm-text2);">로딩 중...</div>';

        if (roomType === 'dm' && roomInfo?.target_id) {
            title.textContent = '프로필';
            await renderUserProfile(body, roomInfo.target_id, roomInfo);
        } else if (roomType === 'class') {
            title.textContent = '클래스 정보';
            await renderClassInfo(body, roomId, roomInfo);
        } else if (roomType === 'group') {
            title.textContent = '그룹 정보';
            renderGroupInfo(body, roomId, roomInfo);
        }
    }

    // ---- DM 유저 프로필 ----
    async function renderUserProfile(body, targetId, roomInfo) {
        const db = bridge().getDb();
        const sb = bridge().getSupabase();

        let profile = {};
        try { profile = await bridge().getUserProfile(targetId); } catch (e) { }

        // 수강 클래스 가져오기
        let enrolledClasses = [];
        try {
            const enrollSnap = await db.ref(`enrollments/${targetId}`).once('value');
            const enrollments = enrollSnap.val() || {};
            for (const [classId, data] of Object.entries(enrollments)) {
                if (data.status === 'approved' || data.enrolled) {
                    const classSnap = await db.ref(`classes/${classId}`).once('value');
                    const cls = classSnap.val();
                    if (cls) enrolledClasses.push({ id: classId, title: cls.title || '클래스', image: cls.image_url || '' });
                }
            }
        } catch (e) { }

        // 연락처 상태 확인
        const userId = bridge().getUserId();
        let isContact = false;
        try {
            const snap = await db.ref(`contacts/${userId}/${targetId}`).once('value');
            isContact = snap.exists();
        } catch (e) { }

        // 차단 상태 확인
        let isBlocked = false;
        try {
            const snap = await db.ref(`blocked/${userId}/${targetId}`).once('value');
            isBlocked = snap.exists();
        } catch (e) { }

        const avatarUrl = profile.profile_image_url || roomInfo?.target_avatar || '';
        const name = profile.name || roomInfo?.target_name || '사용자';
        const email = profile.email || '';
        const statusMsg = profile.status_message || '';

        body.innerHTML = `
            <div class="info-profile-section">
                <div class="info-avatar" style="${avatarUrl ? `background-image:url(${avatarUrl})` : ''}">
                    ${!avatarUrl ? '👤' : ''}
                </div>
                <h4 class="info-name">${name}</h4>
                <p class="info-id">${email}</p>
                ${statusMsg ? `<p class="info-status-msg">"${statusMsg}"</p>` : ''}
            </div>

            <div class="info-divider"></div>

            <div class="info-section">
                <h5 class="info-section-title">수강 중인 클래스</h5>
                ${enrolledClasses.length > 0
                ? enrolledClasses.map(c => `
                        <a href="../class_view/class_view.html?classId=${c.id}" class="info-class-item">
                            <div class="info-class-thumb" style="${c.image ? `background-image:url(${c.image})` : ''}">
                                ${!c.image ? '📚' : ''}
                            </div>
                            <span>${c.title}</span>
                        </a>
                    `).join('')
                : '<p class="info-empty">수강 중인 클래스 없음</p>'
            }
            </div>

            <div class="info-divider"></div>

            <div class="info-actions">
                <button class="btn-info-action ${isContact ? 'active' : ''}" id="btnToggleContact">
                    ${isContact ? '✅ 연락처 등록됨' : '➕ 친구 추가'}
                </button>
                <button class="btn-info-action danger ${isBlocked ? 'active' : ''}" id="btnToggleBlock">
                    ${isBlocked ? '🔓 차단 해제' : '🚫 차단'}
                </button>
            </div>
        `;

        // 친구 추가/해제
        document.getElementById('btnToggleContact')?.addEventListener('click', async () => {
            try {
                if (isContact) {
                    await db.ref(`contacts/${userId}/${targetId}`).remove();
                } else {
                    await db.ref(`contacts/${userId}/${targetId}`).set({
                        name, avatar: avatarUrl, added_at: firebase.database.ServerValue.TIMESTAMP
                    });
                }
                renderInfoPanel(currentRoomId, currentRoomType, roomInfo);
            } catch (e) { console.error(e); }
        });

        // 차단/해제
        document.getElementById('btnToggleBlock')?.addEventListener('click', async () => {
            try {
                if (isBlocked) {
                    await db.ref(`blocked/${userId}/${targetId}`).remove();
                } else {
                    await db.ref(`blocked/${userId}/${targetId}`).set({
                        name, blocked_at: firebase.database.ServerValue.TIMESTAMP
                    });
                }
                renderInfoPanel(currentRoomId, currentRoomType, roomInfo);
            } catch (e) { console.error(e); }
        });
    }

    // ---- 클래스 정보 패널 ----
    async function renderClassInfo(body, classId, roomInfo) {
        const db = bridge().getDb();
        let classData = {};
        try {
            const snap = await db.ref(`classes/${classId}`).once('value');
            classData = snap.val() || {};
        } catch (e) { }

        const imageUrl = classData.image_url || roomInfo?.class_image || '';
        const title = classData.title || roomInfo?.class_name || '클래스';
        const description = classData.description || '';
        const instructor = classData.instructor_name || classData.creator_name || '';
        const category = classData.category || '';
        const price = classData.price || 0;
        const duration = classData.duration || '';
        const maxStudents = classData.max_students || '';
        const schedule = classData.schedule || '';
        const location = classData.location || classData.address || '';

        body.innerHTML = `
            <div class="info-class-hero" style="${imageUrl ? `background-image:url(${imageUrl})` : ''}">
                ${!imageUrl ? '<span style="font-size:3rem;">📚</span>' : ''}
            </div>

            <div class="info-section" style="padding-top:12px;">
                <h4 class="info-name">${title}</h4>
                ${instructor ? `<p class="info-id">강사: ${instructor}</p>` : ''}
                ${category ? `<span class="info-tag">${category}</span>` : ''}
            </div>

            ${description ? `
                <div class="info-divider"></div>
                <div class="info-section">
                    <h5 class="info-section-title">클래스 소개</h5>
                    <p class="info-desc">${description}</p>
                </div>
            ` : ''}

            <div class="info-divider"></div>

            <div class="info-section">
                <h5 class="info-section-title">수강 정보</h5>
                <div class="info-detail-grid">
                    ${price ? `<div class="info-detail-item"><span class="detail-label">가격</span><span class="detail-value">${Number(price).toLocaleString()}원</span></div>` : ''}
                    ${duration ? `<div class="info-detail-item"><span class="detail-label">기간</span><span class="detail-value">${duration}</span></div>` : ''}
                    ${maxStudents ? `<div class="info-detail-item"><span class="detail-label">정원</span><span class="detail-value">${maxStudents}명</span></div>` : ''}
                    ${schedule ? `<div class="info-detail-item"><span class="detail-label">일정</span><span class="detail-value">${schedule}</span></div>` : ''}
                    ${location ? `<div class="info-detail-item"><span class="detail-label">위치</span><span class="detail-value">${location}</span></div>` : ''}
                </div>
            </div>

            <div class="info-divider"></div>

            <div class="info-actions">
                <a href="../class_view/class_view.html?classId=${classId}" class="btn-info-action primary" style="text-align:center;text-decoration:none;display:block;">
                    📖 클래스 페이지 바로가기
                </a>
                <button class="btn-info-action reenroll" id="btnReenroll" data-class-id="${classId}">
                    🔄 재수강 신청
                </button>
            </div>
        `;

        // 재수강 버튼 (나중에 결제창 연동)
        document.getElementById('btnReenroll')?.addEventListener('click', () => {
            alert('결제 시스템이 연동되면 재수강 신청이 가능합니다.\n클래스: ' + title);
        });
    }

    // ---- 그룹 정보 ----
    function renderGroupInfo(body, groupId, roomInfo) {
        const name = roomInfo?.group_name || '그룹';
        body.innerHTML = `
            <div class="info-profile-section">
                <div class="info-avatar">👥</div>
                <h4 class="info-name">${name}</h4>
                <p class="info-id">그룹 채팅</p>
            </div>
        `;
    }

    return {
        init, openRoom, sendCurrentMessage, renderInfoPanel,
        getCurrentRoomId: () => currentRoomId,
        getCurrentRoomType: () => currentRoomType
    };
})();
