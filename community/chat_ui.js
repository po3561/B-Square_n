// chat_ui.js - 모듈3: 채팅 UI 기능
// 이모지, 리액션, 파일 업로드, 메시지 수정/삭제, 메인 컨트롤러와 실시간 소통
window.CommunityModules = window.CommunityModules || {};

window.CommunityModules.ChatUI = (function () {
    const bridge = () => window.CommunityModules.SyncBridge;
    const DM = () => window.CommunityModules.DM;
    let currentRoomId = null;
    let currentRoomType = null;
    let replyTarget = null;
    let editingMsgKey = null;

    const EMOJIS = ['😀', '😂', '🥰', '😍', '🤔', '😅', '😎', '🥳', '😢', '😡', '👍', '👎', '❤️', '🔥', '⭐', '🎉', '💯', '🙌', '👏', '🤝', '💪', '🙏', '✨', '💬', '📌', '📎', '🎵', '🎮', '☕', '🍕'];

    function init() {
        setupEmojiPicker();
        setupFileUpload();
        setupInputAutoResize();
        setupReply();
        console.log("🎨 ChatUI initialized");
    }

    // ---- 채팅방 열기 ----
    function openRoom(roomId, roomType, roomInfo) {
        // 이전 방 리스너 정리
        if (currentRoomId) {
            const prevPath = currentRoomType === 'class' ? `chats/${currentRoomId}` : `dm/${currentRoomId}/messages`;
            bridge().stopListeningMessages(prevPath);
        }

        currentRoomId = roomId;
        currentRoomType = roomType;
        editingMsgKey = null;
        replyTarget = null;

        const container = document.getElementById('chatMessagesContainer');
        container.innerHTML = '';

        document.getElementById('noChatSelected').style.display = 'none';
        document.getElementById('chatActiveArea').style.display = 'flex';

        // 헤더 업데이트
        const name = roomInfo?.target_name || roomInfo?.class_name || '채팅방';
        const avatar = roomInfo?.target_avatar || roomInfo?.class_image || '';
        document.getElementById('chatHeaderName').textContent = name;
        const avatarEl = document.getElementById('chatHeaderAvatar');
        if (avatar) {
            avatarEl.style.backgroundImage = `url(${avatar})`;
            avatarEl.textContent = '';
        } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = '👤';
        }

        // 상태 표시
        const statusEl = document.getElementById('chatHeaderStatus');
        if (roomType === 'dm' && roomInfo?.target_id) {
            bridge().watchPresence(roomInfo.target_id, (p) => {
                if (p.online) {
                    statusEl.textContent = '온라인';
                    statusEl.className = 'chat-header-status online';
                } else {
                    statusEl.textContent = '오프라인';
                    statusEl.className = 'chat-header-status';
                }
            });
        } else if (roomType === 'class') {
            statusEl.textContent = '클래스 채팅';
            statusEl.className = 'chat-header-status';
        }

        // 읽음 처리
        bridge().markAsRead(roomId);

        // 메시지 리스너 시작 (class vs dm 경로 분기)
        const msgPath = roomType === 'class' ? `chats/${roomId}` : `dm/${roomId}/messages`;
        bridge().listenMessages(msgPath,
            (key, msg) => {
                // 클래스 채팅은 sender_id 대신 user_id 필드 사용
                if (roomType === 'class' && !msg.sender_id) {
                    msg.sender_id = msg.user_id;
                    msg.user_name = msg.user_name || '사용자';
                    msg.user_avatar = msg.user_avatar || '';
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

    // ---- 메시지 렌더링 ----
    function renderMessage(key, msg, action) {
        const container = document.getElementById('chatMessagesContainer');
        const userId = bridge().getUserId();
        const isMine = msg.sender_id === userId;

        if (action === 'update') {
            const existing = document.getElementById(`msg-${key}`);
            if (existing) existing.remove();
        }

        const row = document.createElement('div');
        row.className = `msg-row ${isMine ? 'mine' : 'other'}`;
        row.id = `msg-${key}`;
        row.dataset.key = key;
        row.dataset.senderId = msg.sender_id;

        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
        const editedMark = msg.edited ? '<span class="msg-edited">(수정됨)</span>' : '';

        // 리액션 렌더링
        let reactionsHTML = '';
        if (msg.reactions) {
            const reactionMap = {};
            Object.entries(msg.reactions).forEach(([emoji, users]) => {
                const count = Object.keys(users).length;
                const isMineReaction = users[userId] ? 'mine' : '';
                reactionMap[emoji] = { count, isMineReaction };
            });
            reactionsHTML = '<div class="msg-reactions">' +
                Object.entries(reactionMap).map(([emoji, { count, isMineReaction }]) =>
                    `<div class="reaction-chip ${isMineReaction}" data-emoji="${emoji}" data-key="${key}">
                        ${emoji}<span class="reaction-count">${count}</span>
                    </div>`
                ).join('') + '</div>';
        }

        // 콘텐츠
        let contentHTML = '';
        if (msg.type === 'image') {
            contentHTML = `<img src="${msg.content}" class="msg-image" alt="이미지">`;
        } else if (msg.type === 'file') {
            const icon = getFileIcon(msg.file_name);
            contentHTML = `<div class="msg-file-attachment">
                <span class="file-icon">${icon}</span>
                <div class="file-info">
                    <span class="file-name">${msg.file_name || '파일'}</span>
                    <span class="file-size">${formatFileSize(msg.file_size)}</span>
                </div>
            </div>`;
        } else {
            contentHTML = msg.content || '';
        }

        // 답장
        let replyHTML = '';
        if (msg.reply_to) {
            replyHTML = `<div class="msg-reply-ref" style="font-size:0.75rem;color:var(--comm-text2);border-left:2px solid var(--comm-accent);padding-left:8px;margin-bottom:4px;">↩ 답장</div>`;
        }

        row.innerHTML = `
            ${!isMine ? `<div class="msg-avatar-sm" style="${msg.user_avatar ? `background-image:url(${msg.user_avatar})` : ''}"></div>` : ''}
            <div class="msg-bubble-wrap">
                ${!isMine ? `<span class="msg-sender-name">${msg.user_name || '사용자'}</span>` : ''}
                <div class="msg-bubble">
                    ${replyHTML}
                    ${contentHTML}
                </div>
                <div class="msg-meta">
                    ${editedMark}
                    <span class="msg-time-sm">${time}</span>
                </div>
                ${reactionsHTML}
            </div>
        `;

        // 더블클릭 → 좋아요 리액션
        row.addEventListener('dblclick', (e) => {
            e.preventDefault();
            DM().toggleReaction(currentRoomId, key, '❤️');
        });

        // 우클릭 → 컨텍스트 메뉴
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, key, msg, isMine);
        });

        // 리액션 칩 클릭
        row.querySelectorAll('.reaction-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                DM().toggleReaction(currentRoomId, chip.dataset.key, chip.dataset.emoji);
            });
        });

        if (action === 'update') {
            // 시간 순서 위치 찾기
            const messages = container.querySelectorAll('.msg-row');
            let inserted = false;
            for (const m of messages) {
                if (m.id > `msg-${key}`) {
                    container.insertBefore(row, m);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) container.appendChild(row);
        } else {
            container.appendChild(row);
        }

        container.scrollTop = container.scrollHeight;
    }

    function removeMessage(key) {
        const el = document.getElementById(`msg-${key}`);
        if (el) el.remove();
    }

    // ---- 컨텍스트 메뉴 ----
    function showContextMenu(e, key, msg, isMine) {
        closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'msg-context-menu';
        menu.id = 'msgContextMenu';

        let items = [
            { icon: '↩', label: '답장', action: () => setReply(key, msg.content) },
            { icon: '📋', label: '복사', action: () => navigator.clipboard.writeText(msg.content) },
            { icon: '😀', label: '리액션', action: () => showQuickReaction(key) },
        ];

        if (isMine) {
            items.push({ icon: '✏️', label: '수정', action: () => startEdit(key, msg.content) });
            items.push({ icon: '🗑️', label: '삭제', action: () => confirmDelete(key), danger: true });
        }

        menu.innerHTML = items.map(i =>
            `<div class="ctx-item ${i.danger ? 'danger' : ''}" data-action="${i.label}">${i.icon} ${i.label}</div>`
        ).join('');

        document.body.appendChild(menu);

        // 위치
        menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';

        // 이벤트 연결
        menu.querySelectorAll('.ctx-item').forEach((el, i) => {
            el.addEventListener('click', () => {
                items[i].action();
                closeContextMenu();
            });
        });

        setTimeout(() => {
            document.addEventListener('click', closeContextMenu, { once: true });
        }, 50);
    }

    function closeContextMenu() {
        const menu = document.getElementById('msgContextMenu');
        if (menu) menu.remove();
    }

    function showQuickReaction(key) {
        const quickEmojis = ['❤️', '👍', '😂', '🔥', '😢', '👏'];
        quickEmojis.forEach(emoji => {
            // 임시: 첫 번째 이모지 바로 적용
        });
        // 이모지 피커 열기
        const picker = document.getElementById('emojiPicker');
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        picker._reactionTarget = key;
    }

    // ---- 메시지 수정 ----
    function startEdit(key, content) {
        editingMsgKey = key;
        const input = document.getElementById('msgInput');
        input.value = content;
        input.focus();
        input.dataset.editing = key;
        bridge().emit('editing_start', { key });
    }

    function cancelEdit() {
        editingMsgKey = null;
        const input = document.getElementById('msgInput');
        input.value = '';
        delete input.dataset.editing;
    }

    // ---- 메시지 삭제 ----
    function confirmDelete(key) {
        if (confirm('이 메시지를 삭제하시겠습니까?')) {
            DM().deleteMessage(currentRoomId, key);
        }
    }

    // ---- 답장 ----
    function setReply(key, content) {
        replyTarget = key;
        document.getElementById('replyPreview').style.display = 'flex';
        document.getElementById('replyText').textContent = content?.substring(0, 50) || '';
        document.getElementById('msgInput').focus();
    }

    function setupReply() {
        document.getElementById('btnReplyCancel')?.addEventListener('click', () => {
            replyTarget = null;
            document.getElementById('replyPreview').style.display = 'none';
        });
    }

    // ---- 이모지 피커 ----
    function setupEmojiPicker() {
        const grid = document.getElementById('emojiGrid');
        if (!grid) return;

        grid.innerHTML = EMOJIS.map(e => `<span data-emoji="${e}">${e}</span>`).join('');

        grid.addEventListener('click', (e) => {
            const emoji = e.target.dataset.emoji;
            if (!emoji) return;

            const picker = document.getElementById('emojiPicker');
            if (picker._reactionTarget) {
                DM().toggleReaction(currentRoomId, picker._reactionTarget, emoji);
                picker._reactionTarget = null;
                picker.style.display = 'none';
            } else {
                const input = document.getElementById('msgInput');
                input.value += emoji;
                input.focus();
            }
        });

        document.getElementById('btnEmoji')?.addEventListener('click', () => {
            const picker = document.getElementById('emojiPicker');
            picker._reactionTarget = null;
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        });
    }

    // ---- 파일 업로드 ----
    function setupFileUpload() {
        const btn = document.getElementById('btnAttach');
        const input = document.getElementById('fileInput');

        btn?.addEventListener('click', () => input?.click());
        input?.addEventListener('change', (e) => processFiles(e.target.files));

        // 드래그앤드롭
        const mainArea = document.getElementById('commMain');
        if (mainArea) {
            mainArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                document.getElementById('fileDropOverlay')?.classList.add('active');
            });
            mainArea.addEventListener('dragleave', () => {
                document.getElementById('fileDropOverlay')?.classList.remove('active');
            });
            mainArea.addEventListener('drop', (e) => {
                e.preventDefault();
                document.getElementById('fileDropOverlay')?.classList.remove('active');
                processFiles(e.dataTransfer.files);
            });
        }
    }

    function processFiles(files) {
        if (!currentRoomId) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const isImage = file.type.startsWith('image/');
                const type = isImage ? 'image' : 'file';
                const content = e.target.result;

                const profile = await bridge().getUserProfile(bridge().getUserId());
                const fileData = !isImage ? { name: file.name, size: file.size, data: content } : null;

                await DM().sendMessage(currentRoomId, content, type, null, fileData);
            };
            reader.readAsDataURL(file);
        });
    }

    // ---- 인풋 자동 크기 ----
    function setupInputAutoResize() {
        const textarea = document.getElementById('msgInput');
        if (!textarea) return;

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
    }

    // ---- 메시지 전송 ----
    async function sendCurrentMessage() {
        if (!currentRoomId) return;

        const input = document.getElementById('msgInput');
        const content = input.value.trim();
        if (!content) return;

        // 수정 모드 (DM만)
        if (input.dataset.editing && currentRoomType === 'dm') {
            await DM().editMessage(currentRoomId, input.dataset.editing, content);
            cancelEdit();
            return;
        }

        const profile = await bridge().getUserProfile(bridge().getUserId());

        if (currentRoomType === 'class') {
            // 클래스 채팅: chats/{classId}에 직접 push
            const db = bridge().getDb();
            await db.ref(`chats/${currentRoomId}`).push({
                user_id: bridge().getUserId(),
                user_name: profile.name || '사용자',
                user_avatar: profile.profile_image_url || '',
                content: content,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                type: 'text',
                is_instructor: false
            });
        } else {
            // DM 전송
            await DM().sendMessage(currentRoomId, content, 'text', replyTarget);
        }

        input.value = '';
        input.style.height = 'auto';
        replyTarget = null;
        document.getElementById('replyPreview').style.display = 'none';
    }

    // ---- 유틸리티 ----
    function getFileIcon(fileName) {
        if (!fileName) return '📄';
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', zip: '🗜️', mp3: '🎵', mp4: '🎬', wav: '🎵' };
        return icons[ext] || '📄';
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    return {
        init, openRoom, sendCurrentMessage,
        getCurrentRoomId: () => currentRoomId,
        cancelEdit
    };
})();
