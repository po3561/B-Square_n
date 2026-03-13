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
        setupGatheringUI();
        setupScrollUX();
        restoreTheme();
        console.log("🎨 ChatUI initialized");
    }

    // ==== 모집 카드 UI 이벤트 ====
    function setupGatheringUI() {
        const btnGathering = document.getElementById('btnGathering');
        const modal = document.getElementById('gatheringModal');
        const btnClose = document.getElementById('btnCloseGatheringModal');
        const btnSubmit = document.getElementById('btnSendGatheringSubmit');

        if (!btnGathering || !modal) return;

        btnGathering.addEventListener('click', () => {
            modal.style.display = 'flex';
            document.getElementById('gatherTitle').value = '';
            document.getElementById('gatherMin').value = '';
            document.getElementById('gatherMax').value = '';
        });

        if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');

        if (btnSubmit) {
            btnSubmit.addEventListener('click', () => {
                const title = document.getElementById('gatherTitle').value.trim();
                const time = document.getElementById('gatherTime').value.trim();
                const place = document.getElementById('gatherPlace').value.trim();
                const min = parseInt(document.getElementById('gatherMin').value.trim());
                const max = parseInt(document.getElementById('gatherMax').value.trim());

                if (!title || !time || !place || isNaN(min) || isNaN(max)) {
                    alert("모든 항목을 올바르게 입력해주세요.");
                    return;
                }

                if (min < 0 || max <= 0) {
                    alert("인원은 0보다 커야 합니다.");
                    return;
                }

                if (min > max) {
                    alert("최소 인원이 최대 인원보다 클 수 없습니다.");
                    return;
                }

                sendGatheringCard(title, min, max, time, place);
                modal.style.display = 'none';
            });
        }
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
            
            // Sync all theme buttons
            document.querySelectorAll('#btnThemeToggle').forEach(b => {
                b.textContent = next === 'dark' ? '🌙' : '☀️';
                b.setAttribute('title', next === 'dark' ? '다크 모드' : '라이트 모드');
            });
            
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

    // ==== 스크롤 UX (하단 이동 버튼, 입력창 자동 숨김) ====
    let lastScrollTop = 0;
    let unreadCount = 0;

    function setupScrollUX() {
        const container = document.getElementById('chatMessagesContainer');
        const btnScroll = document.getElementById('btnScrollBottom');
        const badge = document.getElementById('scrollBadge');
        const inputArea = document.querySelector('.chat-input-area');

        if (!container || !btnScroll) return;

        container.addEventListener('scroll', () => {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

            // 하단 이동 버튼 보이게/숨기게
            if (isNearBottom) {
                btnScroll.classList.remove('active');
                unreadCount = 0;
                if (badge) badge.style.display = 'none';
            } else {
                if (scrollTop < scrollHeight - clientHeight - 300) {
                    btnScroll.classList.add('active');
                }
            }

            // 입력창 자동 숨김/보임 (스크롤 방향 감지)
            if (inputArea) {
                const diff = scrollTop - lastScrollTop;
                
                if (isNearBottom || scrollTop < 50) {
                    // 맨 하단이나 맨 상단 근처면 무조건 보임
                    inputArea.classList.remove('hidden');
                } else if (diff > 20) {
                    // 아래로 스크롤 중 (최신 메시지 방향) -> 보임
                    inputArea.classList.remove('hidden');
                } else if (diff < -20) {
                    // 위로 스크롤 중 (과거 메시지 탐색) -> 숨김
                    inputArea.classList.add('hidden');
                }
            }
            lastScrollTop = scrollTop;
        });

        btnScroll.addEventListener('click', () => {
            scrollToBottom(true);
            unreadCount = 0;
            if (badge) badge.style.display = 'none';
            btnScroll.classList.remove('active');
        });
    }

    function scrollToBottom(smooth = false) {
        const container = document.getElementById('chatMessagesContainer');
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
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

        // 스크롤 상태 초기화
        lastScrollTop = 0;
        unreadCount = 0;
        const inputArea = document.querySelector('.chat-input-area');
        if (inputArea) inputArea.classList.remove('hidden');

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
        if (avatarEl) {
            avatarEl.style.cursor = 'pointer';
            avatarEl.onclick = () => renderInfoPanel(roomId, roomType, roomInfo);
        }
        const nameEl = document.getElementById('chatHeaderName');
        if (nameEl) {
            nameEl.style.cursor = 'pointer';
            nameEl.onclick = () => renderInfoPanel(roomId, roomType, roomInfo);
        }

        // 상태 & UI 업데이트
        const statusEl = document.getElementById('chatHeaderStatus');
        const btnGathering = document.getElementById('btnGathering');
        const btnGoToClass = document.getElementById('btnGoToClass');

        if (roomType === 'dm' && roomInfo?.target_id) {
            bridge().watchPresence(roomInfo.target_id, (p) => {
                if (statusEl) {
                    statusEl.textContent = p.online ? '온라인' : '오프라인';
                    statusEl.className = 'chat-header-status' + (p.online ? ' online' : '');
                }
            });
            if (btnGathering) btnGathering.style.display = 'none';
            if (btnGoToClass) btnGoToClass.style.display = 'none';
        } else if (roomType === 'class') {
            if (statusEl) {
                statusEl.textContent = '클래스 채팅';
                statusEl.className = 'chat-header-status';
            }
            if (btnGathering) {
                // 운영자(개발모드)이거나 강사면 보임
                const isOp = window.__BSQ_DEV_MODE__;
                btnGathering.style.display = (isOp || (roomInfo && roomInfo.is_instructor)) ? 'inline-flex' : 'none';
                // alignItems/justifyContent 적용을 위해 inline-flex 추천 (btn-input-icon 스타일)
            }
            if (btnGoToClass) {
                btnGoToClass.style.display = 'inline-block';
                btnGoToClass.href = `../class_view/class_view.html?id=${roomId}`;
            }
        } else if (roomType === 'group') {
            if (statusEl) {
                statusEl.textContent = '그룹 채팅';
                statusEl.className = 'chat-header-status';
            }
            if (btnGathering) btnGathering.style.display = 'none';
            if (btnGoToClass) btnGoToClass.style.display = 'none';
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
        } else if (msgData.type === 'gathering_card') {
            const gatherId = msgId;
            const title = msgData.gather_title || '클래스 모임';
            const timeInfo = msgData.gather_time || '-';
            const placeInfo = msgData.gather_place || '-';
            const minCap = msgData.min_capacity || 0;
            const maxCap = msgData.max_capacity || 0;
            const currentCount = msgData.current_count || 0;
            const status = msgData.status || 'open';

            const isFull = maxCap > 0 && currentCount >= maxCap;

            // Role check (Simplified for rendering)
            let userId = bridge().getUserId();
            if (window.__BSQ_DEV_MODE__) userId = 'OPERATOR_GHOST';
            const isCardMine = msgData.user_id === userId;

            // Background fetch for pass info (async but we pre-calculate based on bridge state)
            const passSnap = await bridge().getDb().ref(`user_passes/${userId}/${currentRoomId}`).once('value');
            const passInfo = passSnap.val() || {};
            const isMonthly = !!passInfo.monthly;

            contentHtml = `
            <div class="msg-bubble gathering-card" style="padding:24px; background:#fff; min-width:320px; border-radius:25px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border:none; color:#333; position:relative; overflow:hidden;">
                <!-- Content Section -->
                <div style="background:#f1f3f5; border-radius:20px; padding:18px; margin-bottom:15px;">
                    <div style="font-weight:800; font-size:1.15rem; color:#2d3436; line-height:1.6;">
                        모임 시간 : ${timeInfo}<br>
                        모임 장소 : ${placeInfo}
                    </div>
                </div>

                <!-- Map Button -->
                <button style="width:100%; padding:14px; border-radius:30px; border:1px solid #eee; background:#fff; font-weight:800; font-size:1rem; color:#2d3436; cursor:pointer; margin-bottom:15px; display:flex; align-items:center; justify-content:center; gap:8px;" onclick="window.open('https://map.naver.com/v5/search/${encodeURIComponent(placeInfo)}')">
                    지도 바로가기 <span style="font-size:0.8rem;">➜</span>
                </button>

                <!-- Status Section -->
                <div style="margin-bottom:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-weight:900; font-size:1.2rem; color:#2d3436;">참여 : ${currentCount} / ${maxCap}명</span>
                    </div>
                    <div style="width:100%; height:12px; background:#e9ecef; border-radius:6px; overflow:hidden;">
                        <div style="width:${Math.min((currentCount / maxCap) * 100, 100)}%; height:100%; background:#4db6ac; transition: width 0.5s ease;"></div>
                    </div>
                    <p style="font-size:0.85rem; color:#868e96; margin-top:8px; font-weight:700;">최소 ${minCap}명 필요</p>
                </div>

                <!-- Action Button Logic -->
                <div style="display:flex; gap:10px; margin-top:10px;">
                    ${isMine 
                        ? `<button class="btn-submit" style="flex:1; background:#4db6ac; color:#fff; padding:18px; border-radius:35px; border:none; font-weight:800; font-size:1.2rem; cursor:pointer;" onclick="window.CommunityModules.ChatUI.closeGathering('${currentRoomId}', '${gatherId}')">모임 마감</button>`
                        : status === 'closed'
                            ? `<button disabled style="flex:1; background:#cfd4d9; color:#fff; padding:18px; border-radius:35px; border:none; font-weight:800; font-size:1.2rem; cursor:not-allowed;">마감됨</button>`
                            : isFull
                                ? `<button disabled style="flex:1; background:#cfd4d9; color:#fff; padding:18px; border-radius:35px; border:none; font-weight:800; font-size:1.2rem; cursor:not-allowed;">정원 초과</button>`
                                : `
                                    <button style="flex:2; background:#4db6ac; color:#fff; padding:18px; border-radius:35px; border:none; font-weight:800; font-size:1.2rem; cursor:pointer;" onclick="window.CommunityModules.ChatUI.joinGathering('${currentRoomId}', '${gatherId}')">
                                        ${isMonthly ? '모임 참여' : '수강권 사용'}
                                    </button>
                                    <button style="flex:1; background:#ffd8d8; color:#ff6b6b; padding:18px; border-radius:35px; border:none; font-weight:800; font-size:1rem; cursor:pointer;">
                                        불참
                                    </button>
                                  `
                    }
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
                <div class="msg-meta" style="display:flex; align-items:center; gap:4px; margin-top:4px; font-size:0.75rem; color:rgba(255,255,255,0.6);">
                    ${msgData.edited ? '<span class="msg-edited">수정됨</span>' : ''}
                    <span class="msg-time-sm">${timeStr}</span>
                    ${isMine ? '<span class="msg-read-check" style="color:#6e8efb; font-weight:bold;">✓</span>' : ''}
                </div>
            </div>
        `;

        // 컨텍스트 메뉴 (우클릭 / 롱프레스)
        setupMsgContextMenu(row, msgId, msgData, isMine);

        const container = document.getElementById('chatMessagesContainer');
        const scrollHeight = container.scrollHeight;
        const scrollTop = container.scrollTop;
        const clientHeight = container.clientHeight;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 400; // 넉넉하게 체크

        container.appendChild(row);

        if (isMine || isNearBottom) {
            scrollToBottom();
        } else {
            // 하단 버튼의 배지 업데이트
            unreadCount++;
            const badge = document.getElementById('scrollBadge');
            const btnScroll = document.getElementById('btnScrollBottom');
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = 'block';
            }
            if (btnScroll) btnScroll.classList.add('active');
        }
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
            menu.style.position = 'fixed';
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            document.body.appendChild(menu);

            // Prevent menu from going off-screen
            const rect = menu.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
            if (y + rect.height > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

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
                } else if (currentRoomType === 'class') {
                    await bridge().getDb().ref(`chats/${currentRoomId}/${editingMsgKey}`).update({
                        content: content,
                        edited: true
                    });
                } else if (currentRoomType === 'group') {
                    await bridge().getDb().ref(`group_chats/${currentRoomId}/messages/${editingMsgKey}`).update({
                        content: content,
                        edited: true
                    });
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
                    is_instructor: (currentRoomInfo && currentRoomInfo.is_instructor) || window.__BSQ_DEV_MODE__ ? true : false
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

    // ==== 모집(Gathering) 카드 로직 ====
    async function sendGatheringCard(title, minCap, maxCap, time, place) {
        if (!currentRoomId || currentRoomType !== 'class') return;
        try {
            const currentUserId = bridge().getUserId();
            const profile = await bridge().getUserProfile(currentUserId);

            await bridge().getDb().ref(`chats/${currentRoomId}`).push({
                type: 'gathering_card',
                gather_title: title,
                gather_time: time,
                gather_place: place,
                min_capacity: parseInt(minCap, 10),
                max_capacity: parseInt(maxCap, 10),
                current_count: 0,
                status: 'open',
                sender_id: currentUserId,
                user_id: currentUserId,
                user_name: profile.name || '강사',
                user_avatar: profile.profile_image_url || '',
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                is_instructor: true
            });
        } catch (e) {
            console.error('Send Gathering error:', e);
            alert("모집 카드 전송에 실패했습니다.");
        }
    }

    async function joinGathering(roomId, gatherId) {
        let userId = bridge().getUserId();
        if (window.__BSQ_DEV_MODE__) userId = 'OPERATOR_GHOST';
        const db = bridge().getDb();

        try {
            // First check user's passes
            const passSnap = await db.ref(`user_passes/${userId}/${roomId}`).once('value');
            const passInfo = passSnap.val() || {};

            if (!passInfo.monthly && (!passInfo.count || passInfo.count <= 0) && !window.__BSQ_DEV_MODE__) {
                alert("수강권이 부족합니다. 클래스 페이지에서 수강권을 구매해주세요.");
                return;
            }

            // Check if already joined
            const partSnap = await db.ref(`class_participants/${gatherId}/${userId}`).once('value');
            if (partSnap.exists()) {
                alert("이미 참여하셨습니다.");
                return;
            }

            // Use transaction to safely check and increment
            const gatherRef = db.ref(`chats/${roomId}/${gatherId}`);
            let errorMsg = null;
            const result = await gatherRef.transaction((currentData) => {
                if (currentData) {
                    if (currentData.status !== 'open') {
                        errorMsg = "이미 마감된 모집입니다.";
                        return; // Abort
                    }
                    if (currentData.max_capacity > 0 && currentData.current_count >= currentData.max_capacity) {
                        errorMsg = "모집 정원이 꽉 찼습니다.";
                        return; // Abort
                    }
                    currentData.current_count = (currentData.current_count || 0) + 1;
                }
                return currentData;
            });

            if (!result.committed) {
                alert(errorMsg || "모집에 참여할 수 없습니다.");
                return;
            }

            // Record participant
            await db.ref(`class_participants/${gatherId}/${userId}`).set({
                joined_at: firebase.database.ServerValue.TIMESTAMP,
                used_pass: passInfo.monthly ? 'monthly' : 'ticket',
                user_name: (await bridge().getUserProfile(userId)).name || '참여자'
            });

            // Deduct pass if ticket and not dev mode
            if (!passInfo.monthly && !window.__BSQ_DEV_MODE__) {
                await db.ref(`user_passes/${userId}/${roomId}/count`).set(passInfo.count - 1);
            }
            const msg = passInfo.monthly ? "모임 참여가 완료되었습니다!" : "수강권 1개를 사용하여 참여하였습니다!";
            alert(msg);

        } catch (e) {
            console.error("Gathering join error:", e);
            alert("참여 처리 중 오류가 발생했습니다.");
        }
    }

    async function closeGathering(roomId, gatherId) {
        if (!confirm("모집을 마감하시겠습니까? (최소 인원 미달 시 수강생들의 패스가 자동 환불됩니다.)")) return;
        const db = bridge().getDb();
        try {
            const gatherRef = db.ref(`chats/${roomId}/${gatherId}`);
            const gatherSnap = await gatherRef.once('value');
            const gatherData = gatherSnap.val();

            if (!gatherData || gatherData.status === 'closed') {
                alert("이미 마감되었거나 존재하지 않는 모집입니다.");
                return;
            }

            await gatherRef.update({ status: 'closed' });

            if (gatherData.current_count < gatherData.min_capacity) {
                alert(`최소 인원(${gatherData.min_capacity}명) 미달로 모집이 자동 취소되며, 수강생들의 수강권이 자동 환불(반환)됩니다.`);
                const partsSnap = await db.ref(`class_participants/${gatherId}`).once('value');
                const parts = partsSnap.val() || {};

                // Refund pass tickets
                for (const [uid, info] of Object.entries(parts)) {
                    if (info.used_pass === 'ticket') {
                        const countSnap = await db.ref(`user_passes/${uid}/${roomId}/count`).once('value');
                        const curCount = countSnap.val() || 0;
                        await db.ref(`user_passes/${uid}/${roomId}/count`).set(curCount + 1);
                    }
                }
            } else {
                alert(`총 ${gatherData.current_count}명 모집 확정되었습니다!`);
            }
        } catch (e) {
            console.error("Close gathering error:", e);
            alert("마감 처리 중 오류가 발생했습니다.");
        }
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

        const isOpen = panel.classList.contains('active');
        if (isOpen) { 
            panel.classList.remove('active'); 
            return; 
        }

        panel.classList.add('active');
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
        getCurrentRoomType: () => currentRoomType,
        sendGatheringCard, joinGathering, closeGathering
    };
})();
