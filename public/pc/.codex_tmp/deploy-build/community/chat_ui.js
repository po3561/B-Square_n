// chat_ui.js - 모듈3: 채팅 UI 기능 (D1 API 버전)
// Firebase/Supabase 의존성 완전 제거 → BSQ.api 기반
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
    let isSending = false;
    let currentPins = [];
    let pollTimer = null;
    let lastMsgTimestamp = 0;
    let messageStream = null;

    function isClassRoom(roomType = currentRoomType) {
        return roomType === 'class';
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

    function normalizeIncomingMessage(row) {
        if (!row) return row;

        const normalized = { ...row };
        const content = normalized.content || normalized.message || normalized.text || '';
        normalized.content = content;
        normalized.message = normalized.message || content;
        normalized.text = normalized.text || content;
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

    function getMessageContainer() {
        return document.getElementById('chatMessagesContainer');
    }

    function isNearBottom(container, threshold = 140) {
        if (!container) return true;
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    }

    function normalizePreviewText(text, maxLength = 110) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return '';
        return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
    }

    function serializeReactionValue(value) {
        if (!value) return '';
        if (Array.isArray(value)) return value.map(String).sort().join(',');
        if (typeof value === 'object') return Object.keys(value).sort().map(key => `${key}:${value[key]}`).join(',');
        return String(value);
    }

    function buildMessageSignature(msgData) {
        const reactionEntries = msgData?.reactions && typeof msgData.reactions === 'object'
            ? Object.keys(msgData.reactions).sort().map(key => `${key}=${serializeReactionValue(msgData.reactions[key])}`).join('|')
            : '';

        return [
            msgData?.type || '',
            msgData?.content || '',
            msgData?.message || '',
            msgData?.text || '',
            msgData?.file_name || '',
            msgData?.file_size || '',
            msgData?.file_data ? 'file' : '',
            msgData?.gather_title || '',
            msgData?.gather_time || '',
            msgData?.gather_place || '',
            msgData?.capacity_min || '',
            msgData?.capacity_max || '',
            msgData?.current_count || '',
            msgData?.status || '',
            msgData?.reply_to || '',
            msgData?.reply_text || '',
            msgData?.reply_user || '',
            msgData?.is_pinned ? '1' : '0',
            msgData?.edited ? '1' : '0',
            msgData?.updated_at || '',
            msgData?.timestamp || msgData?.created_at || '',
            reactionEntries
        ].join('||');
    }

    function renderReplyPreviewText(previewTextEl, replyTarget) {
        if (!previewTextEl) return;
        previewTextEl.innerHTML = '';

        const title = document.createElement('span');
        title.className = 'reply-preview-name';
        title.textContent = replyTarget?.senderName || '이전 메시지';

        const snippet = document.createElement('span');
        snippet.className = 'reply-preview-snippet';
        snippet.textContent = normalizePreviewText(replyTarget?.text || replyTarget?.message || '');

        previewTextEl.append(title, snippet);
    }

    function clearReplyPreview() {
        replyTarget = null;
        const preview = document.getElementById('replyPreview');
        const previewText = document.getElementById('replyText');
        if (preview) preview.style.display = 'none';
        if (previewText) previewText.innerHTML = '';
    }

    function buildPinnedMessagesSectionHtml(roomType) {
        if (!currentPins.length) return '';

        const title = roomType === 'dm' ? '고정 메시지' : '고정 메시지';
        const items = currentPins.map(pin => {
            const messageId = pin.id || pin.key || '';
            const senderName = pin.user_name || pin.sender_name || '메시지';
            const snippet = normalizePreviewText(pin.content || pin.message || pin.text || '');
            const timestamp = pin.updated_at || pin.timestamp || pin.created_at || '';
            const timeText = timestamp ? new Date(timestamp).toLocaleString('ko-KR', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) : '';

            return `
                <button type="button" class="info-pinned-item" data-msg-id="${escapeAttr(messageId)}">
                    <span class="info-pinned-item-title">${escapeHtml(senderName)}</span>
                    <span class="info-pinned-item-snippet">${escapeHtml(snippet || '고정된 메시지')}</span>
                    ${timeText ? `<span class="info-pinned-item-meta">${escapeHtml(timeText)}</span>` : ''}
                </button>
            `;
        }).join('');

        return `
            <section class="info-pinned-section">
                <div class="info-section-title">
                    <i class="fa-solid fa-thumbtack"></i>
                    <span>${escapeHtml(title)} ${currentPins.length}</span>
                </div>
                <div class="info-pinned-list">${items}</div>
            </section>
        `;
    }

    function bindPinnedMessageItems(container) {
        if (!container) return;
        container.querySelectorAll('.info-pinned-item').forEach(item => {
            item.addEventListener('click', () => {
                const msgId = item.dataset.msgId;
                const target = msgId ? document.getElementById(`msg-${msgId}`) : null;
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('msg-focus');
                    window.setTimeout(() => target.classList.remove('msg-focus'), 1400);
                }
            });
        });
    }

    function refreshVisibleMessages() {
        return loadMessages({ refreshAll: true });
    }

    function getRoomMessageCollectionUrl() {
        return isClassRoom() ? '/api/chat' : `/api/dm/${currentRoomId}/messages`;
    }

    function getRoomMessagesUrl({ since = '', limit = 100, pinnedOnly = false, stream = false } = {}) {
        if (isClassRoom()) {
            const params = new URLSearchParams();
            params.set('class_id', currentRoomId);
            params.set('limit', String(limit));
            if (since !== '' && since != null) params.set('since', String(since));
            if (pinnedOnly) params.set('pinned_only', 'true');
            if (stream) params.set('stream', '1');
            return `/api/chat?${params.toString()}`;
        }

        const params = new URLSearchParams();
        params.set('room_type', currentRoomType || 'dm');
        params.set('limit', String(limit));
        if (since !== '' && since != null) params.set('since', String(since));
        if (pinnedOnly) params.set('pinned_only', '1');
        if (stream) params.set('stream', '1');
        return `/api/dm/${currentRoomId}/messages?${params.toString()}`;
    }

    function getRoomMessageItemUrl(messageId, action = '') {
        if (!messageId) return getRoomMessageCollectionUrl();
        if (isClassRoom()) {
            const base = `/api/chat/${encodeURIComponent(messageId)}`;
            return action ? `${base}/${action}` : base;
        }
        const base = `/api/dm/${currentRoomId}/messages/${encodeURIComponent(messageId)}`;
        return action ? `${base}/${action}` : base;
    }

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
        setupInfoPanelToggle();
        setupGatheringUI();
        setupScrollUX();
        setupLightbox();
        restoreTheme();
        console.log("🎨 ChatUI initialized (D1 API version)");
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
        if (overlay && img) { img.src = src; overlay.classList.add('active'); }
    }

    // ==== 모집 카드 UI 이벤트 ====
    function setupGatheringUI() {
        const btnGathering = document.getElementById('btnGathering');
        const modal = document.getElementById('gatheringModal');
        if (!btnGathering || !modal) return;

        btnGathering.addEventListener('click', () => { modal.style.display = 'flex'; });

        const btnClose = document.getElementById('btnGatheringClose');
        if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');

        const btnSubmit = document.getElementById('btnGatheringSubmit');
        if (btnSubmit) {
            btnSubmit.addEventListener('click', async () => {
                const title = document.getElementById('gatheringTitle')?.value.trim();
                const at = document.getElementById('gatheringAt')?.value;
                const location = document.getElementById('gatheringLocation')?.value.trim();
                const desc = document.getElementById('gatheringDesc')?.value.trim();
                const min = parseInt(document.getElementById('gatherMin')?.value) || 2;
                const max = parseInt(document.getElementById('gatheringCapacity')?.value) || 10;

                if (!title || !at || !location) { alert("모임명, 일시, 장소를 모두 입력해주세요."); return; }

                try {
                    // D1 API로 모임 생성
                    const res = await window.BSQ.api('/api/gatherings', {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'create',
                            class_id: currentRoomId,
                            instructor_id: bridge()?.getUserId?.() || null,
                            title, gathering_at: at, location, description: desc,
                            capacity_min: min,
                            min_capacity: min,
                            capacity_max: max,
                            max_capacity: max,
                            deadline_at: at
                        })
                    });

                    if (res?.success) {
                        // 모임 카드를 채팅에도 전송
                        await sendGatheringCard(title, min, max, at, location);
                        modal.style.display = 'none';
                    } else {
                        alert('모임 생성 실패: ' + (res?.error || ''));
                    }
                } catch (e) {
                    console.error('Gathering create error:', e);
                    alert('모임 생성 중 오류 발생');
                }
            });
        }
    }

    function setupInputUI() {
        const btnSend = document.getElementById('btnSend');
        if (btnSend) btnSend.addEventListener('click', () => sendCurrentMessage());
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                const enterToSend = window.CommunityShellSettings?.enterToSend !== false;
                if (enterToSend && e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendCurrentMessage();
                }
            });
        }
    }

    // ==== 테마 토글 ====
    function setupThemeToggle() {
        const btns = document.querySelectorAll('#btnThemeToggle');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                document.querySelectorAll('#themeIcon').forEach(icon => { icon.className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun'; });
                localStorage.setItem(themeStorageKey, next);
            });
        });
    }

    function restoreTheme() {
        const saved = localStorage.getItem(themeStorageKey) || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        document.querySelectorAll('#themeIcon').forEach(icon => { icon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun'; });
    }

    function toggleInfoPanel() {
        const panel = document.getElementById('commInfoPanel');
        if (panel) {
            const isVisible = panel.classList.toggle('visible');
            panel.style.display = isVisible ? 'flex' : '';
            if (isVisible) renderInfoPanel();
        }
    }

    function setupInfoPanelToggle() {
        if (window.__BSQ_INFO_LISTENER_SET__) return;
        window.__BSQ_INFO_LISTENER_SET__ = true;

        const btn = document.getElementById('btnChatInfo');
        const panel = document.getElementById('commInfoPanel');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleInfoPanel();
            });
        }

        if (panel) {
            panel.addEventListener('click', (e) => e.stopPropagation());
            panel.addEventListener('pointerdown', (e) => e.stopPropagation());
        }

        document.addEventListener('click', (e) => {
            const activePanel = document.getElementById('commInfoPanel');
            if (activePanel && activePanel.classList.contains('visible')) {
                if (e.target.closest('#btnChatInfo') || activePanel.contains(e.target)) {
                    return;
                }
                if (!activePanel.contains(e.target) || e.target.closest('#btnClosePanel')) {
                    panel.classList.remove('visible');
                    activePanel.style.display = '';
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

        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = searchBar.style.display !== 'none';
                searchBar.style.display = isOpen ? 'none' : 'flex';
                if (!isOpen) searchInput?.focus();
                else clearSearchHighlights();
            });
        });

        document.getElementById('msgSearchClose')?.addEventListener('click', () => { searchBar.style.display = 'none'; clearSearchHighlights(); });

        searchInput?.addEventListener('input', () => {
            clearSearchHighlights();
            const query = searchInput.value.trim().toLowerCase();
            if (!query) { document.getElementById('msgSearchCount').textContent = ''; return; }
            matches = [];
            currentMatchIdx = -1;
            document.querySelectorAll('.msg-bubble').forEach(bubble => {
                if (bubble.textContent.toLowerCase().includes(query)) { matches.push(bubble); bubble.classList.add('search-highlight'); }
            });
            const count = document.getElementById('msgSearchCount');
            if (count) count.textContent = matches.length > 0 ? `${matches.length}개 발견` : '없음';
            if (matches.length > 0) navigateMatch(0);
        });

        function navigateMatch(idx) {
            if (idx < 0) idx = matches.length - 1;
            if (idx >= matches.length) idx = 0;
            currentMatchIdx = idx;
            matches[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            const c = document.getElementById('msgSearchCount');
            if (c) c.textContent = `${idx + 1} / ${matches.length}`;
        }
        function clearSearchHighlights() {
            document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
            matches = []; currentMatchIdx = -1;
        }
    }

    // ==== 스크롤 UX ====
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

            if (isNearBottom) {
                btnScroll.classList.remove('active'); unreadCount = 0;
                if (badge) badge.style.display = 'none';
            } else if (scrollTop < scrollHeight - clientHeight - 300) {
                btnScroll.classList.add('active');
            }

            if (inputArea) {
                const diff = scrollTop - lastScrollTop;
                if (isNearBottom || scrollTop < 50 || scrollHeight <= clientHeight) inputArea.classList.remove('hidden');
                else if (diff > 20) inputArea.classList.remove('hidden');
                else if (diff < -20) inputArea.classList.add('hidden');
            }
            lastScrollTop = scrollTop;
        });

        btnScroll.addEventListener('click', () => {
            scrollToBottom(true); unreadCount = 0;
            if (badge) badge.style.display = 'none';
            btnScroll.classList.remove('active');
        });
    }

    function scrollToBottom(smooth = false) {
        const container = document.getElementById('chatMessagesContainer');
        if (container) container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }

    // ==== 채팅방 열기 (D1 API 기반) ====
    function openRoom(roomId, roomType, roomInfo) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (messageStream) { messageStream.close(); messageStream = null; }
        currentRoomId = roomId;
        currentRoomType = roomType;
        currentRoomInfo = roomInfo || {};
        editingMsgKey = null;
        clearReplyPreview();
        lastMsgTimestamp = 0;

        const container = document.getElementById('chatMessagesContainer');
        if (container) container.innerHTML = '';

        const noChatSelected = document.getElementById('noChatSelected');
        if (noChatSelected) noChatSelected.style.display = 'none';
        const chatActiveArea = document.getElementById('chatActiveArea');
        if (chatActiveArea) chatActiveArea.style.display = 'flex';

        const msgInput = document.getElementById('msgInput');
        if (msgInput) msgInput.value = '';
        const searchBar = document.getElementById('chatSearchBar');
        if (searchBar) searchBar.style.display = 'none';
        const infoPanel = document.getElementById('commInfoPanel');
        if (infoPanel) {
            infoPanel.classList.remove('visible');
            infoPanel.style.display = '';
        }

        lastScrollTop = 0; unreadCount = 0;
        const inputArea = document.querySelector('.chat-input-area');
        if (inputArea) inputArea.classList.remove('hidden');

        // 헤더 업데이트
        const name = roomInfo?.target_name || roomInfo?.class_name || roomInfo?.group_name || '채팅방';
        document.getElementById('chatHeaderName').textContent = name;
        const statusEl = document.getElementById('chatHeaderStatus');
        const btnGathering = document.getElementById('btnGathering');
        const btnGoToClass = document.getElementById('btnGoToClass');

        if (roomType === 'class') {
            if (statusEl) { statusEl.textContent = '클래스 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) {
                btnGathering.style.display = (window.__BSQ_DEV_MODE__ || roomInfo?.is_instructor) ? 'inline-flex' : 'none';
            }
            if (btnGoToClass) {
                btnGoToClass.style.display = 'inline-flex';
                btnGoToClass.href = `../class_view/class_view.html?id=${encodeURIComponent(roomId)}`;
            }
        } else if (roomType === 'dm') {
            if (statusEl) { statusEl.textContent = '1:1 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) btnGathering.style.display = 'none';
            if (btnGoToClass) btnGoToClass.style.display = 'none';
        } else if (roomType === 'group') {
            if (statusEl) { statusEl.textContent = '그룹 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) btnGathering.style.display = 'none';
            if (btnGoToClass) btnGoToClass.style.display = 'none';
        }

        try {
            localStorage.setItem('bsq_comm_last_room', String(roomId));
            localStorage.setItem('bsq_comm_last_type', String(roomType));
        } catch {}

        loadMessages({ refreshAll: true });
        loadPinnedMessages();
        startMessageStream();
        pollTimer = setInterval(() => loadMessages({ refreshAll: true }), 3500);
    }

    function startMessageStream() {
        if (!currentRoomId || document.visibilityState !== 'visible') return;

        try {
            const baseUrl = window.BSQ?.apiBaseUrl || window.location.origin;
            const streamUrl = `${baseUrl}${getRoomMessagesUrl({ since: lastMsgTimestamp, stream: true })}`;
            messageStream = new EventSource(streamUrl, { withCredentials: true });
            messageStream.addEventListener('message', (event) => {
                const msg = normalizeIncomingMessage(JSON.parse(event.data));
                const ts = new Date(msg.created_at || msg.timestamp || Date.now()).getTime();
                if (ts > lastMsgTimestamp) lastMsgTimestamp = ts;
                renderMessage(msg.id || msg.key, msg, true);
            });
            messageStream.addEventListener('error', () => {
                if (messageStream) {
                    messageStream.close();
                    messageStream = null;
                }
            });
        } catch (error) {
            console.warn('SSE init failed:', error);
        }
    }

    // ==== D1 API 메시지 로드 ====
        async function loadMessages({ refreshAll = false } = {}) {
        if (!currentRoomId) return;
        try {
            const endpoint = getRoomMessagesUrl({
                since: refreshAll ? '' : lastMsgTimestamp,
                limit: refreshAll ? 250 : 100,
            });
            const res = await window.BSQ.api(endpoint);

            if (res?.success && res.data) {
                const messages = (Array.isArray(res.data) ? res.data : (res.data.messages || []))
                    .map(normalizeIncomingMessage)
                    .sort((a, b) => new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0));

                messages.forEach(msg => {
                    const msgId = msg.id || msg.key;
                    const ts = new Date(msg.updated_at || msg.created_at || msg.timestamp || Date.now()).getTime();
                    if (ts > lastMsgTimestamp) lastMsgTimestamp = ts;
                    renderMessage(msgId, msg, true);
                });
            }
        } catch (e) {
            console.warn('Message poll error:', e.message);
        }
    }

    async function loadPinnedMessages() {
        if (!currentRoomId) return;
        try {
            const endpoint = getRoomMessagesUrl({ pinnedOnly: true, limit: 50 });
            const res = await window.BSQ.api(endpoint);
            if (res?.success && res.data) {
                currentPins = (Array.isArray(res.data) ? res.data : (res.data.messages || []))
                    .map(normalizeIncomingMessage)
                    .filter(msg => msg.is_pinned)
                    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
                renderPinnedBar();

                if (document.getElementById('commInfoPanel')?.classList.contains('visible')) {
                    await renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo);
                }
            }
        } catch (error) {
            console.warn('Pinned load error:', error);
        }
    }

    function renderPinnedBar() {
        const bar = document.getElementById('pinnedMsgBar');
        const content = document.getElementById('pinnedMsgContent');
        if (!bar || !content) return;

        if (!currentPins.length) {
            bar.style.display = 'none';
            bar.onclick = null;
            return;
        }

        const top = currentPins[0];
        const text = normalizePreviewText(top.content || top.message || top.text || '', 70);
        content.textContent = `고정 메시지 ${currentPins.length}개 · ${text || '메시지 확인'}`;
        bar.style.display = 'flex';
        bar.onclick = () => {
            document.getElementById(`msg-${top.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    }

        function renderMessage(msgId, msgData, append = true) {
        if (!msgData) return;
        msgData = normalizeIncomingMessage(msgData);

        const container = getMessageContainer();
        if (!container) return;

        let currentUserId = bridge()?.getUserId?.() || '';
        if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';

        const normalizedId = String(msgId || msgData.id || msgData.key || '');
        if (!normalizedId) return;

        const senderId = msgData.sender_id || msgData.user_id || '';
        const isMine = senderId === currentUserId;
        const signature = buildMessageSignature(msgData);
        const row = document.getElementById(`msg-${normalizedId}`);
        const shouldStickToBottom = isMine || isNearBottom(container) || !container.children.length;

        let senderName = msgData.user_name || msgData.sender_name || '';
        let senderAvatar = msgData.user_avatar || msgData.sender_avatar || '';

        if (senderId === 'OPERATOR_GHOST') {
            senderName = '운영자';
            senderAvatar = '/assets/default-avatar.svg';
        }

        const timeStr = (msgData.timestamp || msgData.created_at)
            ? new Date(msgData.timestamp || msgData.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '';

        const instructorBadge = (currentRoomType === 'class' && msgData.is_instructor)
            ? '<span class="chat-instructor-badge">강사</span>'
            : '';

        const contentHtml = generateMessageContentHtml(normalizedId, msgData, currentUserId);
        const rowInnerHtml = `
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

        const applyRowState = (targetRow) => {
            targetRow.className = `msg-row ${isMine ? 'mine' : 'other'} ${(senderId === 'OPERATOR_GHOST') ? 'operator' : ''}${msgData.is_pinned ? ' pinned' : ''}`;
            targetRow.id = `msg-${normalizedId}`;
            targetRow.dataset.signature = signature;
            targetRow.innerHTML = rowInnerHtml;
            targetRow.querySelectorAll('.msg-image').forEach(img => {
                img.addEventListener('click', () => openLightbox(img.src));
            });
            if (!targetRow.dataset.ctxBound) {
                setupMsgContextMenu(targetRow, normalizedId, msgData, isMine);
                targetRow.dataset.ctxBound = '1';
            }
        };

        if (row) {
            if (row.dataset.signature === signature) {
                row.classList.toggle('pinned', !!msgData.is_pinned);
                return;
            }

            applyRowState(row);
            if (isMine || shouldStickToBottom) scrollToBottom();
            return;
        }

        const newRow = document.createElement('div');
        applyRowState(newRow);
        container.appendChild(newRow);

        if (isMine || shouldStickToBottom) scrollToBottom();
        else {
            unreadCount++;
            const badge = document.getElementById('scrollBadge');
            const btnScroll = document.getElementById('btnScrollBottom');
            if (badge) { badge.textContent = unreadCount; badge.style.display = 'block'; }
            if (btnScroll) btnScroll.classList.add('active');
        }
    }

    function generateMessageContentHtml(msgId, msgData, currentUserId) {
        let contentHtml = '';

        // 답장 인용구
        if (msgData.reply_to && msgData.reply_text) {
            contentHtml += `<div class="msg-reply-quote" onclick="document.getElementById('msg-${msgData.reply_to}')?.scrollIntoView({behavior:'smooth', block:'center'})">
                <span class="reply-quote-user">${msgData.reply_user || '이전 메시지'}</span>
                <span class="reply-quote-content">${escapeHtml(msgData.reply_text)}</span>
            </div>`;
        }

        // 메시지 유형별
        if (msgData.type === 'image' && msgData.file_data) {
            contentHtml += `<div class="msg-bubble image-only"><img class="msg-image" src="${msgData.file_data}" alt="이미지"></div>`;
        } else if (msgData.type === 'file' && msgData.file_name) {
            contentHtml += `<div class="msg-bubble"><div class="msg-file-attachment">
                <span class="file-icon">📄</span><div class="file-info"><span class="file-name">${msgData.file_name}</span><span class="file-size">${formatFileSize(msgData.file_size)}</span></div>
            </div></div>`;
        } else if (msgData.type === 'gathering_card') {
            contentHtml += renderGatheringCardHtml(msgId, msgData);
        } else {
            contentHtml += `<div class="msg-bubble">${escapeHtml(msgData.content || '')}</div>`;
        }

        // 리액션 (간소화)
        if (msgData.reactions && typeof msgData.reactions === 'object') {
            contentHtml += renderReactionsHtml(msgId, msgData.reactions, currentUserId);
        }

        return contentHtml;
    }

    function renderGatheringCardHtml(gatherId, msgData) {
        const title = msgData.gather_title || '클래스 모임';
        const timeInfo = msgData.gather_time || '-';
        const placeInfo = msgData.gather_place || '-';
        const minCap = msgData.capacity_min || msgData.min_capacity || 0;
        const maxCap = msgData.capacity_max || msgData.max_capacity || 0;
        const currentCount = msgData.current_count || 0;
        const status = msgData.status || 'open';
        const isFull = maxCap > 0 && currentCount >= maxCap;

        return `
        <div class="msg-bubble gathering-card">
            <div class="gathering-header"><h4>${title}</h4></div>
            <div class="gathering-content">
                <div class="gathering-detail-item"><i class="fas fa-clock"></i><span>${timeInfo}</span></div>
                <div class="gathering-detail-item"><i class="fas fa-map-marker-alt"></i><span>${placeInfo}</span></div>
                <div class="gathering-detail-item"><i class="fas fa-users"></i><span>${minCap} - ${maxCap}명</span></div>
                <div class="gathering-progress-container">
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:700;color:var(--comm-text2);margin-bottom:4px;">
                        <span>참여현황</span><span>${currentCount} / ${maxCap}명</span>
                    </div>
                    <div class="gathering-progress-bar"><div class="gathering-progress-fill" style="width:${Math.min((currentCount / (maxCap || 1)) * 100, 100)}%;"></div></div>
                </div>
            </div>
            <div class="gathering-footer">
                <div class="gathering-actions" style="flex-direction:column;">
                    <button class="btn-gathering-action" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--comm-accent);margin-bottom:8px;" onclick="window.open('https://map.naver.com/v5/search/${encodeURIComponent(placeInfo)}')">
                        <i class="fas fa-map-marked-alt"></i> 장소 정보 확인
                    </button>
                    ${status === 'closed' ? '<button disabled class="btn-gathering-action">마감됨</button>'
                    : isFull ? '<button disabled class="btn-gathering-action">정원 초과</button>'
                    : `<button class="btn-gathering-action" style="background:var(--comm-accent);color:#fff;" onclick="window.CommunityModules.ChatUI.joinGathering('${currentRoomId}', '${gatherId}')">모임 참여</button>`}
                </div>
            </div>
        </div>`;
    }

    function renderReactionsHtml(msgId, reactions, currentUserId) {
        if (!reactions || Object.keys(reactions).length === 0) return '';
        let html = '<div class="msg-reactions">';
        for (const [emoji, users] of Object.entries(reactions)) {
            const uids = Array.isArray(users)
                ? users.map(String)
                : (users && typeof users === 'object' ? Object.keys(users) : []);
            const count = uids.length;
            if (count === 0) continue;
            const isMine = Array.isArray(users)
                ? users.map(String).includes(String(currentUserId))
                : !!(users && typeof users === 'object' && (users[currentUserId] === true || users[currentUserId] === 1));
            html += `<div class="reaction-pill ${isMine ? 'mine' : ''}" onclick="window.CommunityModules.ChatUI.toggleEmojiReaction('${msgId}', '${emoji}')">
                <span class="reaction-emoji-sm">${emoji}</span><span class="reaction-count-sm">${count}</span>
            </div>`;
        }
        html += '</div>';
        return html;
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
            const isInstructor = currentRoomInfo?.is_instructor || window.__BSQ_DEV_MODE__;
            const isPinned = !!(msg && (msg.is_pinned === 1 || msg.is_pinned === true));

            const quickReactions = ['😀', '❤️', '👍', '🙏', '🔥', '✨'];
            let quickHtml = '<div class="msg-quick-react-bar">';
            quickReactions.forEach(e => {
                quickHtml += `<span class="quick-emoji" onclick="window.CommunityModules.ChatUI.toggleEmojiReaction('${key}', '${e}'); window.CommunityModules.ChatUI.closeAllMenus();">${e}</span>`;
            });
            quickHtml += `<span class="quick-emoji expand" onclick="window.CommunityModules.ChatUI.showEmojiPickerAt('${key}', this)"><i class="fas fa-chevron-down"></i></span>`;
            quickHtml += '</div><div class="ctx-divider"></div>';

            menu.innerHTML = `
                ${quickHtml}
                <div class="ctx-item" data-action="reply"><div class="ctx-item-label"><i class="fas fa-reply"></i> 답장</div></div>
                <div class="ctx-item" data-action="copy"><div class="ctx-item-label"><i class="fas fa-copy"></i> 텍스트 복사</div></div>
                <div class="ctx-divider"></div>
                ${isMine ? '<div class="ctx-item" data-action="edit"><div class="ctx-item-label"><i class="fas fa-pen"></i> 수정</div></div>' : ''}
                ${isMine ? '<div class="ctx-item danger" data-action="delete"><div class="ctx-item-label"><i class="fas fa-trash"></i> 삭제</div></div>' : ''}
            `;
            try {
                const replyItem = menu.querySelector('[data-action="reply"]');
                const pinItem = document.createElement('div');
                pinItem.className = 'ctx-item';
                pinItem.dataset.action = 'pin';
                pinItem.innerHTML = `<div class="ctx-item-label"><i class="fas fa-thumbtack"></i> ${isPinned ? '고정 해제' : '고정'}</div>`;
                if (replyItem) menu.insertBefore(pinItem, replyItem);
                else menu.prepend(pinItem);
            } catch {}

            menu.style.position = 'fixed';
            menu.style.left = x + 'px'; menu.style.top = y + 'px';
            document.body.appendChild(menu);

            const rect = menu.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
            if (y + rect.height > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

            menu.querySelectorAll('.ctx-item').forEach(item => {
                item.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const action = item.dataset.action;
                    if (action === 'pin') {
                        await setMessagePinned(key, !isPinned);
                        try { msg.is_pinned = !isPinned ? 1 : 0; } catch {}
                        menu.remove();
                        return;
                    }
                    const senderName = msg.user_name || msg.sender_name || '사용자';
                    if (action === 'reply') setReply(key, msg.content, senderName, msg);
                    else if (action === 'copy') { navigator.clipboard?.writeText((msg.content || '').replace(/<[^>]*>?/gm, '')); alert('복사했습니다.'); }
                    else if (action === 'edit') startEdit(key, msg.content);
                    else if (action === 'delete') deleteMsg(key);
                    menu.remove();
                });
            });
            setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
        };

        row.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY); });
        row.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { showMenu(e.touches[0].clientX, e.touches[0].clientY); }, 700); }, { passive: true });
        row.addEventListener('touchend', () => clearTimeout(pressTimer));
        row.addEventListener('touchmove', () => clearTimeout(pressTimer));
    }

    function setReply(messageId, text, senderName, messageData) {
        replyTarget = {
            id: String(messageId || messageData?.id || messageData?.key || ''),
            text: String(text || messageData?.content || messageData?.message || ''),
            senderName: senderName || messageData?.user_name || messageData?.sender_name || '',
            senderId: messageData?.sender_id || messageData?.user_id || '',
            message: messageData || null,
        };
        const preview = document.getElementById('replyPreview');
        const previewText = document.getElementById('replyText');
        if (preview && previewText) {
            preview.style.display = 'flex';
            renderReplyPreviewText(previewText, replyTarget);
        }
        document.getElementById('msgInput')?.focus();
    }

    function startEdit(key, content) {
        editingMsgKey = key;
        const msgInput = document.getElementById('msgInput');
        if (msgInput) {
            msgInput.value = content || '';
            msgInput.focus();
            msgInput.style.background = 'rgba(255, 77, 77, 0.05)';
            msgInput.dispatchEvent(new Event('input'));
        }
    }

    async function deleteMsg(key) {
        if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
        try {
            await window.BSQ.api(getRoomMessageItemUrl(key), { method: 'DELETE' });
            removeMessage(key);
        } catch (e) { console.error('Delete failed:', e); }
    }

    // ==== 메시지 전송 (D1 API) ====
    async function setMessagePinned(messageId, nextPinned) {
        if (!currentRoomId || !messageId) return;
        try {
            const endpoint = isClassRoom() ? '/api/chat' : getRoomMessageItemUrl(messageId);
            const payload = isClassRoom() ? { id: messageId, is_pinned: !!nextPinned } : { is_pinned: !!nextPinned };
            await window.BSQ.api(endpoint, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });

            const rowEl = document.getElementById(`msg-${messageId}`);
            if (rowEl) rowEl.classList.toggle('pinned', !!nextPinned);

            await loadPinnedMessages();
            await refreshVisibleMessages();
        } catch (e) {
            console.warn('setMessagePinned failed:', e);
            window.BSQCommunityShared?.toast?.('고정 처리에 실패했습니다.');
        }
    }

        async function sendCurrentMessage() {
        const msgInput = document.getElementById('msgInput');
        if (!msgInput) return;
        const content = msgInput.value.trim();
        if (!content || !currentRoomId || isSending) return;

        isSending = true;
        const btnSend = document.getElementById('btnSend');
        if (btnSend) btnSend.style.opacity = '0.5';

        try {
            let currentUserId = bridge()?.getUserId?.() || '';
            if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';

            if (editingMsgKey) {
                const editPayload = { content, message: content, edited: true };
                await window.BSQ.api(getRoomMessageItemUrl(editingMsgKey), {
                    method: isClassRoom() ? 'PUT' : 'PATCH',
                    body: JSON.stringify(editPayload)
                });
                editingMsgKey = null;
            } else {
                const profile = await bridge()?.getUserProfile?.(currentUserId) || { name: '사용자', profile_image_url: '' };
                const pushData = {
                    content,
                    message: content,
                    sender_id: currentUserId,
                    user_avatar: profile.profile_image_url || '',
                    user_name: profile.name || '사용자',
                    type: 'text',
                    room_type: currentRoomType,
                    class_id: isClassRoom() ? currentRoomId : null,
                    is_instructor: (currentRoomInfo?.is_instructor) || window.__BSQ_DEV_MODE__ || false
                };

                if (replyTarget) {
                    const replyData = typeof replyTarget === 'object' ? replyTarget : { id: replyTarget };
                    pushData.reply_to = replyData.id;
                    pushData.reply_text = replyData.text || '';
                    pushData.reply_user = replyData.senderName || '';
                    pushData.reply_data = {
                        id: replyData.id,
                        user_name: replyData.senderName || '',
                        message: replyData.text || '',
                        sender_id: replyData.senderId || '',
                    };
                }

                await window.BSQ.api(getRoomMessageCollectionUrl(), {
                    method: 'POST',
                    body: JSON.stringify(pushData)
                });
            }

            msgInput.value = '';
            msgInput.style.background = '';
            msgInput.dispatchEvent(new Event('input'));
            editingMsgKey = null;
            clearReplyPreview();

            await refreshVisibleMessages();

        } catch (e) {
            console.error('Send error:', e);
        } finally {
            isSending = false;
            if (btnSend) btnSend.style.opacity = '1';
        }
    }

    function setupEmojiPicker() {
        const btn = document.getElementById('btnEmoji');
        const picker = document.getElementById('emojiPicker');
        const grid = document.getElementById('emojiGrid');
        if (!btn || !picker || !grid) return;

        grid.innerHTML = EMOJIS.map(e => `<span>${e}</span>`).join('');
        btn.addEventListener('click', (ev) => { ev.stopPropagation(); picker.style.display = picker.style.display === 'none' ? 'block' : 'none'; });
        grid.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const input = document.getElementById('msgInput');
                input.value += e.target.textContent; input.focus();
                input.dispatchEvent(new Event('input'));
                picker.style.display = 'none';
            }
        });
        document.addEventListener('click', (e) => { if (!picker.contains(e.target) && e.target !== btn) picker.style.display = 'none'; });
    }

    // ==== 파일 업로드 (D1 API) ====
    function setupFileUpload() {
        const btn = document.getElementById('btnAttach');
        const fileInput = document.getElementById('fileInput');
        if (!btn || !fileInput) return;
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

        const main = document.getElementById('commMain');
        const overlay = document.getElementById('fileDropOverlay');
        if (!main || !overlay) return;
        main.addEventListener('dragover', (e) => { e.preventDefault(); overlay.classList.add('active'); });
        main.addEventListener('dragleave', (e) => { if (!main.contains(e.relatedTarget)) overlay.classList.remove('active'); });
        main.addEventListener('drop', (e) => { e.preventDefault(); overlay.classList.remove('active'); handleFileSelect(e.dataTransfer.files); });
    }

    function handleFileSelect(files) {
        if (!files || !currentRoomId) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const isImage = file.type.startsWith('image/');
                let currentUserId = bridge()?.getUserId?.() || '';
                if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';
                const profile = await bridge()?.getUserProfile?.(currentUserId) || { name: '사용자' };

                await window.BSQ.api(getRoomMessageCollectionUrl(), {
                    method: 'POST',
                    body: JSON.stringify({
                        content: file.name,
                        message: file.name,
                        sender_id: currentUserId,
                        user_avatar: profile.profile_image_url || '',
                        user_name: profile.name || '사용자',
                        type: isImage ? 'image' : 'file',
                        file_name: file.name,
                        file_size: file.size,
                        file_data: e.target.result,
                        room_type: currentRoomType,
                        class_id: isClassRoom() ? currentRoomId : null
                    })
                });
                await refreshVisibleMessages();
            };
            reader.readAsDataURL(file);
        });
    }

    function setupInputAutoResize() {
        const msgInput = document.getElementById('msgInput');
        if (!msgInput) return;
        msgInput.addEventListener('input', () => {
            msgInput.style.height = 'auto';
            msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
        });
    }

        function setupReply() {
        document.getElementById('btnReplyCancel')?.addEventListener('click', () => {
            clearReplyPreview();
        });
    }

    function closeAllMenus() {
        document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
    }

    // ==== 모집 카드 전송 (D1 API) ====
    async function sendGatheringCard(title, minCap, maxCap, time, place) {
        if (!currentRoomId) return;
        try {
            let currentUserId = bridge()?.getUserId?.() || '';
            if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';
            const profile = await bridge()?.getUserProfile?.(currentUserId) || { name: '강사' };

            await window.BSQ.api(getRoomMessageCollectionUrl(), {
                method: 'POST',
                body: JSON.stringify({
                    type: 'gathering_card',
                    gather_title: title,
                    gather_time: time,
                    gather_place: place,
                    capacity_min: parseInt(minCap, 10),
                    min_capacity: parseInt(minCap, 10),
                    capacity_max: parseInt(maxCap, 10),
                    max_capacity: parseInt(maxCap, 10),
                    current_count: 0,
                    status: 'open',
                    sender_id: currentUserId,
                    user_name: profile.name || '강사',
                    is_instructor: true,
                    room_type: currentRoomType,
                    class_id: isClassRoom() ? currentRoomId : null
                })
            });
            await refreshVisibleMessages();
        } catch (e) {
            console.error('Send Gathering error:', e);
            alert("모집 카드 전송에 실패했습니다.");
        }
    }

    async function joinGathering(roomId, gatherId) {
        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'join',
                    gathering_id: gatherId,
                    user_id: bridge()?.getUserId?.() || null
                })
            });
            if (res?.success) {
                alert("모임 참여가 완료되었습니다!");
                await refreshVisibleMessages();
            } else {
                alert(res?.error || "참여 처리에 실패했습니다.");
            }
        } catch (e) {
            console.error("Gathering join error:", e);
            alert("참여 처리 중 오류가 발생했습니다.");
        }
    }

    async function closeGathering(roomId, gatherId) {
        if (!confirm("모집을 마감하시겠습니까?")) return;
        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'close',
                    gathering_id: gatherId
                })
            });
            if (res?.success) {
                alert("모집이 마감되었습니다.");
                await refreshVisibleMessages();
            } else {
                alert(res?.error || "마감 처리에 실패했습니다.");
            }
        } catch (e) {
            console.error("Close gathering error:", e);
            alert("마감 처리 중 오류가 발생했습니다.");
        }
    }

        function toggleEmojiReaction(msgId, emoji) {
        const endpoint = isClassRoom()
            ? `/api/chat/${encodeURIComponent(msgId)}/reaction`
            : `/api/dm/${currentRoomId}/messages/${msgId}/reaction`;

        window.BSQ.api(endpoint, {
            method: 'POST',
            body: JSON.stringify({ emoji })
        }).then(() => refreshVisibleMessages()).catch(e => console.warn('Reaction error:', e));
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / 1048576).toFixed(1) + 'MB';
    }

    // ==== 정보 패널 렌더링 (D1 API) ====
        async function renderInfoPanel(roomId, roomType, roomInfo) {
        roomId = roomId || currentRoomId;
        roomType = roomType || currentRoomType;
        roomInfo = roomInfo || currentRoomInfo;

        const panel = document.getElementById('commInfoPanel');
        const title = document.getElementById('infoPanelTitle');
        const body = document.getElementById('infoPanelBody');
        if (!panel || !body) return;

        if (!panel.classList.contains('visible')) {
            panel.classList.add('visible');
            if (panel.style) { panel.style.display = 'flex'; panel.style.visibility = 'visible'; }
        }

        body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--comm-text2);"><i class="fas fa-circle-notch fa-spin"></i></div>';

        if (roomType === 'dm') {
            if (title) title.textContent = '상대 프로필';
            await renderDmProfile(body, roomInfo);
        } else if (roomType === 'class') {
            if (title) title.textContent = '클래스 정보';
            await renderClassInfoPanel(body, roomId, roomInfo);
        } else if (roomType === 'group') {
            if (title) title.textContent = '그룹 정보';
            body.innerHTML = `<div class="info-profile-section"><div class="info-avatar">👥</div><h4 class="info-name">${roomInfo?.group_name || '그룹'}</h4></div>`;
        }

        if (currentPins.length) {
            body.innerHTML += buildPinnedMessagesSectionHtml(roomType);
            bindPinnedMessageItems(body);
        }
    }

    function showEmojiPickerAt(msgId, targetEl) {
        closeAllMenus();
        const picker = document.createElement('div');
        picker.className = 'msg-context-menu emoji-picker-popup';
        picker.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:12px;min-width:240px;';
        EMOJIS.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'quick-emoji'; span.textContent = emoji;
            span.onclick = () => { toggleEmojiReaction(msgId, emoji); closeAllMenus(); };
            picker.appendChild(span);
        });
        const rect = targetEl.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
        picker.style.top = Math.max(10, rect.top - 200) + 'px';
        document.body.appendChild(picker);
        setTimeout(() => document.addEventListener('click', (e) => { if (!picker.contains(e.target)) closeAllMenus(); }, { once: true }), 100);
    }

    return {
        init, openRoom, sendCurrentMessage, renderInfoPanel, toggleInfoPanel,
        getCurrentRoomId: () => currentRoomId,
        getCurrentRoomType: () => currentRoomType,
        sendGatheringCard, joinGathering, closeGathering,
        toggleEmojiReaction, closeAllMenus, showEmojiPickerAt,
        v2ToggleContact: async (targetId) => { window.addFriend?.(targetId); }
    };
})();









