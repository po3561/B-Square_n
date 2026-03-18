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
    let themeStorageKey = 'bsq_theme';
    let isSending = false; // 중복 전송 방지용 플래그
    let currentPins = {};
    let activePinRef = null;
    let presenceRef = null;
    // 현재 채팅방의 고정 메시지 상태 추적

    const EMOJIS = ['😀', '😂', '🥰', '😍', '🤔', '😅', '😎', '🥳', '😢', '😡', '👍', '👎', '❤️', '🔥', '⭐', '🎉', '💯', '🙌', '👏', '🤝', '💪', '🙏', '✨', '💬', '📌', '📎', '🎵', '🎮', '☕', '🍕', '🎊', '💐', '🌈', '🍀', '🐶', '🐱', '🦊', '🐻'];

    function init(options = {}) {
        if (options.themeKey) themeStorageKey = options.themeKey;
        setupInputUI();
        setupEmojiPicker();
        setupFileUpload();
        setupInputAutoResize();
        setupReply();
        setupThemeToggle();
        setupMessageSearch();
        setupInfoPanelToggle(); // 사이드바 토글 연동 추가
        setupGatheringUI();
        setupScrollUX();
        setupLightbox();
        restoreTheme();
        console.log("🎨 ChatUI initialized");
    }

    // ==== 이미지 라이트박스 ====
    function setupLightbox() {
        if (document.getElementById('lightboxOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'lightboxOverlay';
        overlay.className = 'lightbox-overlay';
        overlay.innerHTML = '<img class="lightbox-image" src="" alt="확대 이미지">';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', () => overlay.classList.remove('active'));
    }

    function openLightbox(src) {
        const overlay = document.getElementById('lightboxOverlay');
        const img = overlay?.querySelector('img');
        if (overlay && img) {
            img.src = src;
            overlay.classList.add('active');
        }
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

    function setupInputUI() {
        const btnSend = document.getElementById('btnSend');
        if (btnSend) {
            btnSend.addEventListener('click', () => sendCurrentMessage());
        }

        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendCurrentMessage();
                }
            });
        }
    }

    // ==== 테마 토글 (🌙 ↔ ☀️) ====
    function setupThemeToggle() {
        const btns = document.querySelectorAll('#btnThemeToggle');
        if (btns.length === 0) return;

        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const html = document.documentElement;
                const current = html.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                html.setAttribute('data-theme', next);

                // Sync all theme buttons
                document.querySelectorAll('#themeIcon').forEach(icon => {
                    icon.className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
                });
                document.querySelectorAll('#btnThemeToggle').forEach(b => {
                    b.setAttribute('title', next === 'dark' ? '다크 모드' : '라이트 모드');
                });

                localStorage.setItem(themeStorageKey, next);
            });
        });
    }

    function restoreTheme() {
        const saved = localStorage.getItem(themeStorageKey) || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        // Update theme icons and titles based on the restored theme
        document.querySelectorAll('#themeIcon').forEach(icon => {
            icon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        });
        document.querySelectorAll('#btnThemeToggle').forEach(b => {
            b.setAttribute('title', saved === 'dark' ? '다크 모드' : '라이트 모드');
        });
    }

    function toggleInfoPanel() {
        const panel = document.getElementById('commInfoPanel');
        if (panel) {
            const isVisible = panel.classList.toggle('visible');
            if (isVisible) {
                renderInfoPanel();
            }
        }
    }

    function setupInfoPanelToggle() {
        // [중요: 싱글톤 패턴] 전역 리스너가 이미 등록되어 있다면 다시 등록하지 않음.
        // 이를 통해 '열리자마자 바로 닫히는' 중복 실행 현상을 완벽히 방지함.
        if (window.__BSQ_INFO_LISTENER_SET__) return;
        window.__BSQ_INFO_LISTENER_SET__ = true;

        console.log("🛡️ Binding Unified Info Panel Listener...");
        // Use explicit binding for better reliability in class_view
        const btn = document.getElementById('btnChatInfo');
        if (btn) {
            btn.onclick = (e) => {
                e.preventDefault();
                toggleInfoPanel();
            };
        }

        // Fallback for dynamically added buttons
        document.addEventListener('click', e => {
            const dynamicBtn = e.target.closest('#btnChatInfo');
            if (dynamicBtn && dynamicBtn !== btn) {
                e.preventDefault();
                toggleInfoPanel();
            }
        });

        document.addEventListener('click', (e) => {
            const panel = document.getElementById('commInfoPanel');
            // 외부 클릭 시 닫기
            if (panel && panel.classList.contains('visible')) {
                const isInside = panel.contains(e.target);
                const isClose = e.target.closest('#btnClosePanel');
                if (!isInside || isClose) {
                    panel.classList.remove('visible');
                }
            }
        });
    }

    // ==== 메시지 내 검색 ====
    function setupMessageSearch() {
        const btns = document.querySelectorAll('#btnChatSearch');
        const searchBar = document.getElementById('chatSearchBar');
        const searchInput = document.getElementById('msgSearchInput');
        if (btns.length === 0 || !searchBar) return;

        let matches = [];
        let currentMatchIdx = -1;

        btns.forEach(btnSearch => {
            btnSearch.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = searchBar.style.display !== 'none';
                searchBar.style.display = isOpen ? 'none' : 'flex';
                if (!isOpen) {
                    searchInput?.focus();
                } else {
                    clearSearchHighlights();
                }
            });
        });

        // Other search elements (assumed unique or first found)
        const searchClose = document.getElementById('msgSearchClose');
        const searchCount = document.getElementById('msgSearchCount');
        const searchPrev = document.getElementById('msgSearchPrev');
        const searchNext = document.getElementById('msgSearchNext');

        searchClose?.addEventListener('click', () => {
            searchBar.style.display = 'none';
            clearSearchHighlights();
        });

        searchInput?.addEventListener('input', () => {
            clearSearchHighlights();
            const query = searchInput.value.trim().toLowerCase();
            if (!query) {
                if (searchCount) searchCount.textContent = '';
                return;
            }

            matches = [];
            currentMatchIdx = -1;
            document.querySelectorAll('.msg-bubble').forEach(bubble => {
                const text = bubble.textContent.toLowerCase();
                if (text.includes(query)) {
                    matches.push(bubble);
                    bubble.classList.add('search-highlight');
                }
            });
            if (searchCount) searchCount.textContent = matches.length > 0 ? `${matches.length}개 발견` : '없음';
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
            if (searchCount) searchCount.textContent = `${idx + 1} / ${matches.length}`;
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

                if (isNearBottom || scrollTop < 50 || scrollHeight <= clientHeight) {
                    // 맨 하단, 맨 상단, 혹은 스크롤할 내용이 없으면 무조건 보임
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
        const db = bridge().getDb();
        if (currentRoomId) {
            const prevPath = currentRoomType === 'class' ? `chats/${currentRoomId}` : currentRoomType === 'group' ? `group_chats/${currentRoomId}/messages` : `dm/${currentRoomId}/messages`;
            bridge().stopListeningMessages(prevPath);
            if (activePinRef) activePinRef.off();
            if (presenceRef) presenceRef.off();

            // Cleanup current user's room-specific presence before switching
            const currentUserId = bridge().getUserId();
            if (currentUserId && currentUserId !== 'OPERATOR_GHOST') {
                db.ref(`presence_room/${currentRoomId}/${currentUserId}`).remove();
            }
        }

        currentRoomId = roomId;
        currentRoomType = roomType;
        currentRoomInfo = roomInfo || {};
        editingMsgKey = null;
        replyTarget = null;

        const container = document.getElementById('chatMessagesContainer');
        if (container) container.innerHTML = '';

        // Room-specific Presence
        const currentUserId = bridge().getUserId();
        if (currentUserId && currentUserId !== 'OPERATOR_GHOST') {
            const roomPresenceRef = db.ref(`presence_room/${roomId}/${currentUserId}`);
            roomPresenceRef.set({
                online: true,
                last_seen: firebase.database.ServerValue.TIMESTAMP
            });
            roomPresenceRef.onDisconnect().remove();
        }

        const noChatSelectedEl = document.getElementById('noChatSelected');
        if (noChatSelectedEl) noChatSelectedEl.style.display = 'none';

        const chatActiveAreaEl = document.getElementById('chatActiveArea');
        if (chatActiveAreaEl) chatActiveAreaEl.style.display = 'flex';

        // 핀 메시지 리스너 시작
        listenPinnedMessage(roomId);

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
            if (presenceRef) presenceRef.off(); // Stop previous presence listener
            presenceRef = bridge().watchPresence(roomInfo.target_id, (p) => {
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
                btnGoToClass.style.display = 'none'; // 사용자의 제거 요청 반영
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
                renderMessage(key, msg, true);
            },
            (key, msg) => {
                if (roomType === 'class' && !msg.sender_id) msg.sender_id = msg.user_id;
                renderMessage(key, msg, false);
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
            const contentArea = row.querySelector('.msg-content-area');
            if (contentArea) {
                // 재렌더링 시 내용과 인용구, 리액션 등을 모두 갱신
                const newContentHtml = await generateMessageContentHtml(msgId, msgData, currentUserId);
                contentArea.innerHTML = newContentHtml;

                // 수정됨 상태 명시적 추가/갱신
                const metaRow = row.querySelector('.msg-meta');
                if (msgData.edited && metaRow) {
                    let ed = metaRow.querySelector('.msg-edited');
                    if (!ed) {
                        ed = document.createElement('span');
                        ed.className = 'msg-edited';
                        ed.textContent = '수정됨';
                        metaRow.prepend(ed);
                    }
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

        const instructorBadge = (currentRoomType === 'class' && msgData.is_instructor)
            ? '<span class="chat-instructor-badge">강사</span>'
            : '';

        const contentHtml = await generateMessageContentHtml(msgId, msgData, currentUserId);

        row.innerHTML = `
            ${!isMine ? `<div class="msg-avatar" style="${senderAvatar ? `background-image:url(${senderAvatar})` : ''}">${!senderAvatar ? '👤' : ''}</div>` : ''}
            <div class="msg-bubble-wrap">
                ${!isMine && (currentRoomType === 'class' || currentRoomType === 'group') ? `<span class="msg-sender-name">${senderName}${instructorBadge}</span>` : ''}
                <div class="msg-content-area">${contentHtml}</div>
                <div class="msg-meta">
                    ${msgData.edited ? '<span class="msg-edited">수정됨</span>' : ''}
                    <span class="msg-time-sm">${timeStr}</span>
                    ${isMine ? '<span class="msg-read-check">✓</span>' : ''}
                </div>
            </div>
        `;

        // 이미지 클릭 시 라이트박스
        row.querySelectorAll('.msg-image').forEach(img => {
            img.addEventListener('click', () => openLightbox(img.src));
        });

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

    async function generateMessageContentHtml(msgId, msgData, currentUserId) {
        let contentHtml = '';

        // 1. 답장 인용구 추가
        if (msgData.reply_to && msgData.reply_text) {
            contentHtml += `<div class="msg-reply-quote" onclick="document.getElementById('msg-${msgData.reply_to}')?.scrollIntoView({behavior:'smooth', block:'center'})">
                <span class="reply-quote-user">${msgData.reply_user || '이전 메시지'}</span>
                <span class="reply-quote-content">${escapeHtml(msgData.reply_text)}</span>
            </div>`;
        }

        // 2. 메시지 유형별 렌더링
        if (msgData.type === 'image' && msgData.file_data) {
            contentHtml += `<div class="msg-bubble image-only"><img class="msg-image" src="${msgData.file_data}" alt="이미지"></div>`;
        } else if (msgData.type === 'file' && msgData.file_name) {
            contentHtml += `<div class="msg-bubble"><div class="msg-file-attachment">
                <span class="file-icon">📄</span>
                <div class="file-info">
                    <span class="file-name">${msgData.file_name}</span>
                    <span class="file-size">${formatFileSize(msgData.file_size)}</span>
                </div>
            </div></div>`;
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
            let userId = bridge().getUserId();
            if (window.__BSQ_DEV_MODE__) userId = 'OPERATOR_GHOST';
            const isMine = msgData.user_id === userId;

            const passSnap = await bridge().getDb().ref(`user_passes/${userId}/${currentRoomId}`).once('value');
            const passInfo = passSnap.val() || {};
            const isMonthly = !!passInfo.monthly;

            contentHtml += `
            <div class="msg-bubble gathering-card">
                <div class="gathering-header">
                    <h4>${title}</h4>
                </div>
                
                <div class="gathering-content">
                    <div class="gathering-detail-item">
                        <i class="fas fa-clock"></i>
                        <span>${timeInfo}</span>
                    </div>
                    <div class="gathering-detail-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${placeInfo}</span>
                    </div>
                    
                    <div class="gathering-progress-container">
                        <div style="display:flex; justify-content:space-between; font-size: 0.75rem; font-weight:700; color:var(--comm-text2); margin-bottom:4px;">
                            <span>참여현황</span>
                            <span>${currentCount} / ${maxCap}명</span>
                        </div>
                        <div class="gathering-progress-bar">
                            <div class="gathering-progress-fill" style="width:${Math.min((currentCount / (maxCap || 1)) * 100, 100)}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="gathering-footer">
                    <div class="gathering-actions" style="flex-direction: column;">
                        <button class="btn-gathering-action" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--comm-accent); margin-bottom:8px;" onclick="window.open('https://map.naver.com/v5/search/${encodeURIComponent(placeInfo)}')">
                            <i class="fas fa-map-marked-alt"></i> 장소 정보 확인
                        </button>
                        ${isMine
                    ? `<button class="btn-gathering-action" style="background:var(--comm-text); color:#000;" onclick="window.CommunityModules.ChatUI.closeGathering('${currentRoomId}', '${gatherId}')">모임 마감</button>`
                    : status === 'closed'
                        ? `<button disabled class="btn-gathering-action">마감됨</button>`
                        : isFull
                            ? `<button disabled class="btn-gathering-action">정원 초과</button>`
                            : `
                                        <button class="btn-gathering-action" style="background:var(--comm-accent); color:#fff;" onclick="window.CommunityModules.ChatUI.joinGathering('${currentRoomId}', '${gatherId}')">
                                            ${isMonthly ? '모임 참여' : '수강권 사용'}
                                        </button>
                                      `
                }
                    </div>
                </div>
            </div>`;
        } else {
            contentHtml += `<div class="msg-bubble">${escapeHtml(msgData.content || '')}</div>`;
        }

        // 3. 리액션 뱃지 추가 (프리미엄 알약형 디자인)
        contentHtml += await renderReactionsHtml(msgId, msgData.reactions || {}, currentUserId);

        return contentHtml;
    }

    function removeMessage(key) {
        document.getElementById(`msg-${key}`)?.remove();
    }

    // ==== 리액션 렌더링 ====
    async function renderReactionsHtml(msgId, reactions, currentUserId) {
        if (!reactions || Object.keys(reactions).length === 0) return '';

        let html = '<div class="msg-reactions">';
        for (const [emoji, users] of Object.entries(reactions)) {
            const uids = Object.keys(users);
            const count = uids.length;
            if (count === 0) continue;

            const isMine = users[currentUserId] === true;

            html += `
                <div class="reaction-pill ${isMine ? 'mine' : ''}" onclick="window.CommunityModules.ChatUI.toggleEmojiReaction('${msgId}', '${emoji}')">
                    <span class="reaction-emoji-sm">${emoji}</span>
                    <span class="reaction-count-sm">${count}</span>
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    async function toggleEmojiReaction(msgId, emoji) {
        const userId = bridge().getUserId();
        const path = currentRoomType === 'class' ? `chats/${currentRoomId}/${msgId}/reactions/${emoji}/${userId}` :
            currentRoomType === 'group' ? `group_chats/${currentRoomId}/messages/${msgId}/reactions/${emoji}/${userId}` :
                `dm/${currentRoomId}/messages/${msgId}/reactions/${emoji}/${userId}`;

        const ref = bridge().getDb().ref(path);
        const snap = await ref.once('value');
        if (snap.exists()) {
            await ref.remove();
        } else {
            await ref.set(true);
        }
    }

    // ==== 메시지 컨텍스트 메뉴 ====
    function setupMsgContextMenu(row, key, msg, isMine) {
        let pressTimer;

        const showMenu = (x, y) => {
            closeAllMenus();
            const menu = document.createElement('div');
            menu.className = 'msg-context-menu';

            // 권한 체크: 강사 또는 운영자(개발모드)
            const isInstructor = currentRoomInfo?.is_instructor || window.__BSQ_DEV_MODE__;
            const isPinned = !!currentPins[key];

            // 퀵 리액션 바 (이미지 참고: 6종 + 확장 버튼)
            const quickReactions = ['🥰', '❤️', '👍', '😢', '👎', '🔥'];
            let quickHtml = `<div class="msg-quick-react-bar">`;
            quickReactions.forEach(e => {
                quickHtml += `<span class="quick-emoji" onclick="window.CommunityModules.ChatUI.toggleEmojiReaction('${key}', '${e}'); window.CommunityModules.ChatUI.closeAllMenus();">${e}</span>`;
            });
            quickHtml += `<span class="quick-emoji expand" onclick="window.CommunityModules.ChatUI.showEmojiPickerAt('${key}', this)"><i class="fas fa-chevron-down"></i></span>`;
            quickHtml += `</div><div class="ctx-divider"></div>`;

            menu.innerHTML = `
                ${quickHtml}
                <div class="ctx-item" data-action="reply">
                    <div class="ctx-item-label"><i class="fas fa-reply"></i> 답장</div>
                </div>
                ${isInstructor ? `
                <div class="ctx-item" id="ctxPinAction" data-action="${isPinned ? 'unpin' : 'pin'}">
                    <div class="ctx-item-label">
                        <i class="fas fa-thumbtack" style="${isPinned ? 'transform: rotate(45deg); color: var(--comm-danger);' : ''}"></i> 
                        ${isPinned ? '고정 해제' : '고정'}
                    </div>
                </div>
                ` : ''}
                <div class="ctx-item" data-action="copy">
                    <div class="ctx-item-label"><i class="fas fa-copy"></i> 텍스트 복사</div>
                </div>
                <div class="ctx-divider"></div>
                <div class="ctx-item" data-action="select">
                    <div class="ctx-item-label"><i class="fas fa-check-circle"></i> 선택</div>
                </div>
                <div class="ctx-item" data-action="edit">
                    <div class="ctx-item-label"><i class="fas fa-pen"></i> 수정</div>
                    ${!isMine ? '<style>.ctx-item[data-action="edit"] { display: none; }</style>' : ''}
                </div>
                <div class="ctx-item danger" data-action="delete">
                    <div class="ctx-item-label"><i class="fas fa-trash"></i> 삭제</div>
                    ${!isMine ? '<style>.ctx-item[data-action="delete"] { display: none; }</style>' : ''}
                </div>
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
                item.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const action = item.dataset.action;
                    const senderName = msg.user_name || msg.sender_name || '사용자';
                    if (action === 'reply') setReply(key, msg.content, senderName);
                    else if (action === 'pin') pinMessage(key, msg.content);
                    else if (action === 'unpin') unpinMessage(key);
                    else if (action === 'copy') {
                        const txt = (msg.content || '').replace(/<[^>]*>?/gm, ''); // HTML 제거
                        navigator.clipboard?.writeText(txt);
                        alert('복사되었습니다.');
                    }
                    else if (action === 'edit') startEdit(key, msg.content);
                    else if (action === 'delete') deleteMsg(key);
                    else if (action === 'select') {
                        alert('준비 중인 기능입니다.');
                    }
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
                else window.CommunityModules.ChatUI.toggleEmojiReaction(key, emoji);
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

    function setReply(key, text, senderName) {
        replyTarget = key;
        const preview = document.getElementById('replyPreview');
        const previewText = document.getElementById('replyText');
        if (preview && previewText) {
            preview.style.display = 'flex';
            previewText.textContent = `${senderName || '사용자'}님에게 답장: ${text || ''}`;
        }
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.focus();
            // 답장 바가 생기면서 레이아웃이 변하므로 스크롤 하단 고정 재시도
            setTimeout(() => {
                const container = document.getElementById('chatMessagesContainer');
                if (container) container.scrollTop = container.scrollHeight;
            }, 50);
        }
    }

    function startEdit(key, content) {
        editingMsgKey = key;
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.value = content || '';
            msgInput.focus();
            msgInput.style.background = 'rgba(255, 77, 77, 0.05)';
            msgInput.style.borderColor = 'var(--comm-accent)';
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
        if (!msgInput) {
            console.warn('💬 sendCurrentMessage: msgInput 엘리먼트를 찾지 못했습니다.');
            return;
        }

        const content = msgInput.value.trim();

        // 디버그 로그: 어떤 이유로 전송이 막히는지 확인
        if (!content) {
            console.log('💬 sendCurrentMessage: 내용이 비어 있어 전송하지 않습니다.');
            return;
        }
        if (!currentRoomId) {
            console.error('💬 sendCurrentMessage: currentRoomId 가 없어 전송할 수 없습니다. ChatUI.openRoom 이 아직 호출되지 않았을 가능성이 큽니다.');
            alert('채팅방이 아직 준비되지 않았습니다. 잠시 후 다시 시도하거나 새로고침 해주세요.');
            return;
        }
        if (isSending) {
            console.log('💬 sendCurrentMessage: 이미 전송 중입니다. 중복 전송 방지.');
            return;
        }

        console.log('💬 sendCurrentMessage: 전송 시작', {
            roomId: currentRoomId,
            roomType: currentRoomType,
            length: content.length
        });
        isSending = true; // 전송 시작
        const btnSend = document.getElementById('btnSend');
        if (btnSend) btnSend.style.opacity = '0.5';

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
                const pushData = {
                    content,
                    sender_id: currentUserId,
                    user_id: userId,
                    user_name: profile.name || '사용자',
                    user_avatar: profile.profile_image_url || '',
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    type: 'text',
                    is_instructor: (currentRoomInfo && currentRoomInfo.is_instructor) || window.__BSQ_DEV_MODE__ ? true : false
                };

                // 답장 정보 추가
                if (replyTarget) {
                    const replyText = document.getElementById('replyText')?.textContent.split(': ')[1] || '';
                    pushData.reply_to = replyTarget;
                    pushData.reply_text = replyText;
                    pushData.reply_user = document.getElementById('replyText')?.textContent.split('님에게')[0] || '';
                }

                await bridge().getDb().ref(`chats/${currentRoomId}`).push(pushData);
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
            msgInput.style.background = '';
            msgInput.style.borderColor = '';
            msgInput.dispatchEvent(new Event('input'));
            replyTarget = null;
            editingMsgKey = null;
            document.getElementById('replyPreview').style.display = 'none';
        } catch (e) {
            console.error('Send error:', e);
        } finally {
            isSending = false; // 전송 완료 (성공/실패 무관)
            const btnSend = document.getElementById('btnSend');
            if (btnSend) btnSend.style.opacity = '1';
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

    // ==== 스크롤 UX ====
    function setupScrollUX() {
        const container = document.getElementById('chatMessagesContainer');
        const btnScrollBottom = document.getElementById('btnScrollBottom');
        if (!container) return;

        // 메시지 입력창 포커스 시 자동으로 하단 스크롤
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.addEventListener('focus', () => {
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 200);
            });
        }

        container.addEventListener('scroll', () => {
            if (!btnScrollBottom) return;
            const threshold = 200;
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

            if (isNearBottom) {
                btnScrollBottom.classList.remove('visible');
                btnScrollBottom.style.display = 'none';
            } else {
                btnScrollBottom.classList.add('visible');
                btnScrollBottom.style.display = 'flex';
            }
        });

        if (btnScrollBottom) {
            btnScrollBottom.addEventListener('click', () => {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            });
        }
    }

    // ---- 공통 헤더 UI 이벤트 연결 ----
    function setupHeaderUI() {
        // [중요] btnInfo.onclick 제거: setupInfoPanelToggle 의 이벤트 위임(Delegation)과 충돌하여 
        // 열리자마자 닫히는 현상(Double-trigger)이 발생했으므로 중복 등록 방지.

        const btnTheme = document.getElementById('btnThemeToggle');
        if (btnTheme) {
            btnTheme.onclick = (e) => {
                e.stopPropagation();
                const current = localStorage.getItem('bsq_theme_class') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                localStorage.setItem('bsq_theme_class', next);
                applyTheme('bsq_theme_class');
            };
        }

        const btnSearch = document.getElementById('btnChatSearch');
        if (btnSearch) {
            btnSearch.onclick = (e) => {
                e.stopPropagation();
                toggleSearchBar();
            };
        }
    }

    function toggleSearchBar() {
        const bar = document.getElementById('chatSearchBar');
        if (!bar) return;
        const isVisible = bar.style.display !== 'none';
        bar.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            document.getElementById('msgSearchInput')?.focus();
        }
    }

    // ==== 정보 패널 렌더링 ====
    async function renderInfoPanel(roomId, roomType, roomInfo) {
        roomId = roomId || currentRoomId;
        roomType = roomType || currentRoomType;
        roomInfo = roomInfo || currentRoomInfo;

        const panel = document.getElementById('commInfoPanel');
        const title = document.getElementById('infoPanelTitle');
        const body = document.getElementById('infoPanelBody');

        if (!panel || !body) {
            console.error("❌ CRITICAL: Info panel elements missing!");
            alert("시스템 오류: 정보 패널을 찾을 수 없습니다. (HTML 구조 문제)");
            return;
        }

        // Toggle logic: 이미 열려있으면 닫기 (이벤트 리스너에서 이미 처리하므로 여기서는 보장만 함)
        if (panel.classList.contains('visible')) {
            return;
        }

        try {
            panel.classList.add('visible');

            // [UX 보정] 사이드바가 채팅 레이아웃 내부에서만 보이도록 클리핑 제어
            if (panel.style) {
                panel.style.display = 'flex';
                panel.style.visibility = 'visible';
                panel.style.opacity = '1';
                panel.style.zIndex = '2000';
            }

            body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--comm-text2);"><i class="fas fa-circle-notch fa-spin"></i></div>';

            if (!roomId) roomId = currentRoomId;
            if (!roomId) {
                console.warn("⚠️ Room ID missing during render");
                body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--comm-text2);font-size:0.9rem;">채널 정보를 불러올 수 없습니다.</div>';
                return;
            }

            if (roomType === 'dm' && roomInfo?.target_id) {
                if (title) title.textContent = '프로필';
                await renderUserProfile(body, roomInfo.target_id, roomInfo);
            } else if (roomType === 'class') {
                if (title) title.textContent = '클래스 정보';
                await renderClassInfo(body, roomId, roomInfo);
            } else if (roomType === 'group') {
                if (title) title.textContent = '그룹 정보';
                renderGroupInfo(body, roomId, roomInfo);
            }
        } catch (err) {
            console.error("❌ renderInfoPanel fatal error:", err);
            if (body) {
                body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--comm-danger);">정보를 불러오는 중 시스템 오류가 발생했습니다.<br><small style="opacity:0.7;">${err.message}</small></div>`;
            }
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

        const imageUrl = classData.image_url || roomInfo?.class_image || roomInfo?.image_url || '';
        const title = classData.title || roomInfo?.class_name || roomInfo?.title || '클래스';
        const description = classData.description || roomInfo?.description || '';
        const instructor = classData.instructor_name || classData.creator_name || roomInfo?.instructor_name || '';
        const category = classData.category || roomInfo?.category || '';
        const price = classData.price || roomInfo?.price || 0;
        const duration = classData.duration || roomInfo?.duration || '';
        const maxStudents = classData.max_students || roomInfo?.max_students || '';
        const schedule = classData.schedule || roomInfo?.schedule || '';
        const location = classData.location || classData.address || roomInfo?.location || '';
        const isInstructor = roomInfo?.is_instructor || window.__BSQ_DEV_MODE__;
        const currentUserId = bridge().getUserId();

        const passIssued = classData.total_passes_issued || 0;
        const passUsed = classData.total_passes_used || 0;

        // Real-time Presence Count in this room
        const presencePath = `presence_room/${classId}`;
        const presenceListener = db.ref(presencePath).on('value', snap => {
            const count = snap.numChildren();
            const presenceCountEl = document.getElementById('infoPresenceCount');
            if (presenceCountEl) presenceCountEl.textContent = `현재 ${count}명 채팅중`;
        });
        // We might want to store this listener to detach it later, 
        // but for now let's focus on fixing the crash.

        // Supabase Data (Category, Total Enrolled)
        let categoryName = category;
        let totalEnrolled = 0;
        try {
            const { data: cls } = await bridge().getSupabase().from('classes').select('category').eq('id', classId).maybeSingle();
            if (cls) categoryName = cls.category;

            const { count: enrollCount } = await bridge().getSupabase().from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', classId);
            totalEnrolled = enrollCount || 0;
        } catch (e) { console.warn("Supabase fetch error:", e); }

        body.innerHTML = `
            <div class="panel-v2-container staggered-entry">
                <div class="panel-v2-header stagger-1">
                    <div class="header-main-row">
                        <div class="header-avatar" style="background-image:url('${imageUrl}')"></div>
                        <div class="header-title-box">
                            <h4 class="title-text">클래스 참여자 / <span class="total-count">총 ${totalEnrolled}명 수강</span></h4>
                            <p class="category-text">${categoryName}</p>
                        </div>
                        <button class="btn-close-v2" onclick="window.CommunityModules.ChatUI.toggleInfoPanel()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="header-status-row">
                        <span id="infoPresenceCount" class="presence-badge pulse">현재 0명 채팅중</span>
                    </div>
                </div>

                <div class="info-section-v2 stagger-2">
                    <div id="infoStudentList" class="v2-student-list">
                        <!-- renderInfoStudentList will populate here -->
                        <div class="v2-loading">수강생 정보를 불러오는 중...</div>
                    </div>
                </div>

                <div class="info-gathering-v2 stagger-3">
                    <div class="gathering-card">
                        <div class="gathering-row">
                            <div class="gathering-icon-circle"><i class="fas fa-calendar-alt"></i></div>
                            <span class="gathering-label">모임일시 : ${schedule || '-'}</span>
                        </div>
                        <div class="gathering-row" style="margin-top:12px;">
                            <div class="gathering-icon-circle"><i class="fas fa-map-marker-alt"></i></div>
                            <span class="gathering-label">모임장소 : ${location || '-'}</span>
                        </div>
                        <button class="btn-v2-map" onclick="window.open('https://map.naver.com/v5/search/${encodeURIComponent(location || '')}')">
                            지도 바로가기
                        </button>

                        <div class="gathering-pass-stats">
                            <p>발행된 수강권 수량 : ${passIssued}개</p>
                            <p>사용된 수강권 수량 : ${passUsed}개</p>
                        </div>

                        <div class="gathering-action-area">
                            <button class="btn-v2-status-main" disabled style="background:#fff; color:#000; opacity:1;">모집 마감</button>
                            <div class="gathering-stats-row">
                                <span class="stats-left">참여 : 1 / ${maxStudents || 100}명</span>
                                <span class="stats-right">최소 56명 필요</span>
                            </div>
                            <div class="v2-progress-container">
                                <div class="v2-progress-bar" style="width: ${Math.min(100, (passUsed / (passIssued || 1)) * 100)}%;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="panel-v2-footer stagger-4">
                    <button class="btn-v2-recharge" id="btnRechargePass">
                        <i class="fas fa-bolt"></i> 수강권 충전하기 (잔여: <span id="myPassCount">0</span>회)
                    </button>
                    <a href="../class_view/class_view.html?classId=${classId}" class="btn-v2-detail" target="_blank">
                        클래스 상세 페이지 바로가기 <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </div>
        `;
        renderInfoStudentList(classId);
    }

    async function renderInfoStudentList(classId) {
        const studentList = document.getElementById('infoStudentList');
        if (!studentList) return;

        const db = bridge().getDb();
        const supabase = bridge().getSupabase();
        const isInstructor = currentRoomInfo?.is_instructor || window.__BSQ_DEV_MODE__;

        try {
            const enrollSnap = await db.ref(`enrollments/${classId}`).once('value');
            const enrollments = enrollSnap.val() || {};
            const userIds = Object.keys(enrollments);

            if (userIds.length === 0) {
                studentList.innerHTML = '<p class="info-empty">아직 수강생이 없습니다.</p>';
                return;
            }

            // Fetch profiles and contacts in batch
            const { data: users } = await supabase.from('users').select('id, name, nickname, profile_image_url').in('id', userIds);
            const userMap = {};
            users?.forEach(u => userMap[u.id] = u);

            const userId = bridge().getUserId();
            const contactSnap = await db.ref(`contacts/${userId}`).once('value');
            const contacts = contactSnap.val() || {};

            let html = '';
            for (const uid of userIds) {
                const u = userMap[uid] || { name: '사용자', nickname: '사용자' };
                const isAdded = !!contacts[uid];

                // Real-time Pass Count for each student
                const passSnap = await db.ref(`user_passes/${uid}/${classId}`).get();
                const passData = passSnap.val() || { count: 0 };

                html += `
                    <div class="v2-student-card">
                        <div class="v2-student-avatar-box">
                            <div class="v2-student-avatar" style="background-image:url('${u.profile_image_url || ''}')"></div>
                        </div>
                        <div class="v2-student-info">
                            <div class="v2-nickname">${u.nickname || u.name}</div>
                            ${isInstructor ? `
                                <div class="v2-real-info">${u.name} | 010-****-****</div>
                            ` : ''}
                        </div>
                        <div class="v2-pass-badge">
                            <span class="pass-label">잔여 수강권 수</span>
                            <span class="pass-val">${passData.count}</span>
                        </div>
                        <button class="btn-v2-add-friend" onclick="window.CommunityModules.ChatUI.v2ToggleContact('${uid}', '${u.nickname || u.name}', '${u.profile_image_url || ''}')">
                            ${isAdded ? '친구 삭제' : '친구 추가'}
                        </button>
                    </div>
                `;
            }
            studentList.innerHTML = html;
        } catch (e) {
            console.error("Student list error:", e);
            studentList.innerHTML = '<p class="info-empty">정보 로드 실패</p>';
        }
    }

    // Helper for v2 contact toggle
    async function v2ToggleContact(targetId, name, avatarUrl) {
        const userId = bridge().getUserId();
        if (!userId || userId === 'OPERATOR_GHOST') return;
        const db = bridge().getDb();
        try {
            const snap = await db.ref(`contacts/${userId}/${targetId}`).once('value');
            if (snap.exists()) {
                await db.ref(`contacts/${userId}/${targetId}`).remove();
            } else {
                await db.ref(`contacts/${userId}/${targetId}`).set({
                    name, avatar: avatarUrl, added_at: firebase.database.ServerValue.TIMESTAMP
                });
            }
            // Re-render student list to update button state
            renderInfoStudentList(currentClassId || currentRoomId);
        } catch (e) { console.error(e); }
    }

    renderInfoStudentList(classId).catch(err => console.error("StudentList error:", err));
    renderInfoGathering(classId).catch(err => console.error("Gathering error:", err));

    // 수강권 개수 업데이트 (실시간)
    if (currentUserId && currentUserId !== 'OPERATOR_GHOST') {
        db.ref(`user_passes/${currentUserId}/${classId}/count`).on('value', snap => {
            const countEl = document.getElementById('myPassCount');
            if (countEl) countEl.textContent = snap.val() || 0;
        });
    }

    // 충전 버튼 이벤트 (global class_view.js 함수 호출)
    document.getElementById('btnRechargePass')?.addEventListener('click', () => {
        if (typeof window.openPaymentBottomSheet === 'function') {
            window.openPaymentBottomSheet();
        } else {
            alert("수강권 충전 기능을 초기화 중입니다. 잠시 후 다시 시도해주세요.");
        }
    });

    // 닫기 버튼 이벤트 등록 (한 번만)
    const btnClose = document.getElementById('btnClosePanel');
    if (btnClose) {
        btnClose.onclick = () => {
            const panel = document.getElementById('commInfoPanel');
            if (panel) panel.classList.remove('visible');
        };
    }
}

    async function renderInfoGathering(classId) {
    const gatheringSection = document.getElementById('infoGatheringSection');
    if (!gatheringSection) return;

    // Fetch latest gathering card from chat
    const db = bridge().getDb();
    // 클래스 아이티 하위의 채팅 목록에서 type이 gathering_card인 것 중 마지막 하나
    const snap = await db.ref(`chats/${classId}`).orderByChild('type').equalTo('gathering_card').limitToLast(1).once('value');
    const data = snap.val();

    if (data) {
        const gatherId = Object.keys(data)[0];
        const g = data[gatherId];
        gatheringSection.innerHTML = `
                <div class="info-divider"></div>
                <div class="info-section">
                    <h5 class="info-section-title">최근 모임(모집) 정보</h5>
                    <div class="info-gathering-box">
                        <p class="gathering-box-title">${g.gather_title || '클래스 모임'}</p>
                        <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
                            <p class="gathering-box-row">
                                <span class="gathering-box-label">일정</span>
                                <span class="gathering-box-value">${g.gather_time || '-'}</span>
                            </p>
                            <p class="gathering-box-row">
                                <span class="gathering-box-label">장소</span>
                                <span class="gathering-box-value">${g.gather_place || '-'}</span>
                            </p>
                            <p class="gathering-box-row">
                                <span class="gathering-box-label">인원</span>
                                <span class="gathering-box-value">${g.current_count || 0} / ${g.max_capacity || 0}명</span>
                            </p>
                        </div>
                    </div>
                </div>
            `;
    } else {
        gatheringSection.innerHTML = ''; // 없으면 비움
    }
}

async function renderInfoStudentList(classId) {
    const listEl = document.getElementById('infoStudentList');
    if (!listEl) return;
    const db = bridge().getDb();
    const enrollSnap = await db.ref('enrollments').once('value');
    const enrollments = enrollSnap.val() || {};

    // 현재 사용자가 강사/운영자인지 확인 (roomInfo or dev mode)
    const isInstructor = currentRoomInfo?.is_instructor || window.__BSQ_DEV_MODE__;

    const targetUids = [];
    for (const [uid, classes] of Object.entries(enrollments)) {
        if (classes[classId]) targetUids.push(uid);
    }

    if (targetUids.length === 0) {
        listEl.innerHTML = '<p class="info-empty">수강생이 없습니다.</p>';
        return;
    }

    // 병렬로 프로필 데이터 가져오기
    const profilePromises = targetUids.map(uid => bridge().getUserProfile(uid));
    const profiles = await Promise.all(profilePromises);

    let studentsHtml = '<div class="student-list-container">';

    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        const uid = targetUids[i];

        let uc = 0;
        if (isInstructor && uid !== 'OPERATOR_GHOST') {
            try {
                const psnap = await db.ref(`user_passes/${uid}/${classId}/count`).once('value');
                uc = psnap.val() || 0;
            } catch (e) { }
        }

        const nickname = profile.nickname || profile.name || '수강생';
        const realName = profile.name || '사용자 이름';
        const phone = profile.phone || '전화번호';

        studentsHtml += `
                <div class="participant-row-item">
                    <div class="participant-avatar" style="background-color: ${stringToColor(nickname)}; ${profile.profile_image_url ? `background-image:url(${profile.profile_image_url})` : ''}">
                        ${!profile.profile_image_url ? nickname.charAt(0) : ''}
                        <span class="online-indicator" id="presence-dot-${uid}"></span>
                    </div>
                    <div class="participant-info-block">
                        <div class="participant-name-line">
                            <span class="nick">${nickname}</span>
                            ${isInstructor ? `
                                <div class="instructor-private-info">
                                    <span class="real">${realName}</span>
                                    <span class="phone">${phone}</span>
                                </div>
                            ` : ''}
                        </div>
                        ${isInstructor ? `<span class="pass-tag">연계 수강권 ${uc}수</span>` : ''}
                    </div>
                    <button class="btn-add-friend" onclick="window.CommunityModules.ChatUI.addFriend('${uid}')">친구 추가</button>
                </div>
            `;

        // Presence watch (실시간 초록불)
        bridge().watchPresence(uid, (p) => {
            const dot = document.getElementById(`presence-dot-${uid}`);
            if (dot) {
                dot.className = p.online ? 'online-indicator online' : 'online-indicator';
            }
        });
    }

    studentsHtml += '</div>';
    listEl.innerHTML = studentsHtml;
}

async function changeClassImage(classId) {
    const url = prompt("클래스 프로필 이미지 URL을 입력해주세요:");
    if (url) {
        await bridge().getDb().ref(`classes/${classId}/image_url`).set(url);
        alert("이미지가 업데이트되었습니다.");
        // Refresh info panel
        renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo);
    }
}

// ==== 고정 메시지 (Pin) ====
function listenPinnedMessage(roomId) {
    const pinRef = bridge().getDb().ref(`pinned_messages/${roomId}`);
    pinRef.on('value', (snap) => {
        const data = snap.val() || {};
        currentPins = {};
        Object.entries(data).forEach(([pinId, pinObj]) => {
            if (pinObj.messageId) currentPins[pinObj.messageId] = pinId;
        });
        renderPinnedBar(data);
    });
}

function renderPinnedBar(pinData) {
    const bar = document.getElementById('pinnedMsgBar');
    const contentEl = document.getElementById('pinnedMsgContent');
    const container = document.getElementById('chatMessagesContainer');

    if (!pinData) {
        if (bar) bar.style.display = 'none';
        if (container) container.classList.remove('has-pin');
        return;
    }

    // Get latest pin
    const pinsArr = Object.entries(pinData).map(([id, v]) => ({ id, ...v }));
    if (pinsArr.length === 0) {
        if (bar) bar.style.display = 'none';
        if (container) container.classList.remove('has-pin');
        return;
    }
    pinsArr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const latest = pinsArr[pinsArr.length - 1];

    if (bar && contentEl) {
        bar.style.display = 'flex';
        if (container) container.classList.add('has-pin');

        const txt = latest.text || latest.content || '';
        contentEl.innerHTML = `<span class="pinned-msg-title">고정된 메시지</span> <span class="pinned-msg-text">${escapeHtml(txt)}</span>`;

        bar.onclick = () => {
            const msgId = latest.messageId;
            const msgEl = document.getElementById(`msg-${msgId}`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                msgEl.classList.add('highlight-pin');
                setTimeout(() => msgEl.classList.remove('highlight-pin'), 2000);
            }
        };
    }
}

async function pinMessage(key, content) {
    if (!currentRoomId) return;
    const db = bridge().getDb();
    // Use message ID as the unique key to ensure idempotency
    await db.ref(`pinned_messages/${currentRoomId}/${key}`).set({
        messageId: key,
        text: content,
        pinnerId: bridge().getUserId(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    alert("메시지가 고정되었습니다.");
}

async function unpinMessage(key) {
    if (!currentRoomId || !key) return;
    const db = bridge().getDb();
    await db.ref(`pinned_messages/${currentRoomId}/${key}`).remove();
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
function closeAllMenus() {
    document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
    document.querySelectorAll('.emoji-picker-popup').forEach(p => p.remove());
}

function showEmojiPickerAt(msgId, targetEl) {
    closeAllMenus();
    const picker = document.createElement('div');
    picker.className = 'msg-context-menu emoji-picker-popup';
    picker.style.cssText = 'display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; padding:12px; min-width:240px;';

    EMOJIS.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'quick-emoji';
        span.textContent = emoji;
        span.onclick = () => {
            toggleEmojiReaction(msgId, emoji);
            closeAllMenus();
        };
        picker.appendChild(span);
    });

    const rect = targetEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
    picker.style.top = Math.max(10, rect.top - 200) + 'px';
    document.body.appendChild(picker);

    setTimeout(() => document.addEventListener('click', (e) => {
        if (!picker.contains(e.target)) closeAllMenus();
    }, { once: true }), 100);
}

return {
    init, openRoom, sendCurrentMessage, renderInfoPanel,
    getCurrentRoomId: () => currentRoomId,
    getCurrentRoomType: () => currentRoomType,
    sendGatheringCard, joinGathering, closeGathering,
    toggleEmojiReaction, closeAllMenus, showEmojiPickerAt
};
}) ();
