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
    let isSending = false;
    let currentPins = [];
    let currentInfoPanelMode = 'default';
    let messageCache = new Map();
    let senderProfileCache = new Map();
    let senderProfileRequests = new Map();
    let pollTimer = null;
    let lastMsgTimestamp = 0;
    let messageFeed = null;
    let roomOpenSeq = 0;
    const MESSAGE_CURSOR_OVERLAP_MS = 1000;
    let deletePrompt = { id: null, at: 0 };
    let gatherClosePrompt = { id: null, at: 0 };

    function isClassRoom(roomType = currentRoomType) {
        return roomType === 'class';
    }

    function toast(message) {
        if (!message) return;
        window.BSQCommunityShared?.toast?.(message);
    }

    function requireSecondTap(store, key, message) {
        const now = Date.now();
        if (store.id !== key || now - store.at > 5000) {
            store.id = key;
            store.at = now;
            toast(message);
            return false;
        }
        store.id = null;
        store.at = 0;
        return true;
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

    function normalizeProfileData(profile) {
        if (!profile || typeof profile !== 'object') return null;
        const name = String(profile.name || profile.username || profile.display_name || '사용자').trim() || '사용자';
        const avatar = String(profile.profile_image_url || profile.avatar_url || profile.profile_image || '').trim();
        return {
            ...profile,
            name,
            profile_image_url: avatar,
            avatar_url: avatar,
        };
    }

    function hasMessageAvatar(msgData) {
        return !!String(
            msgData?.user_avatar
            || msgData?.sender_avatar
            || msgData?.avatar_url
            || msgData?.profile_image_url
            || ''
        ).trim();
    }

    function mergeMessageProfile(msgData, profile) {
        const normalizedProfile = normalizeProfileData(profile);
        if (!msgData || !normalizedProfile) return msgData;

        const avatar = normalizedProfile.profile_image_url || normalizedProfile.avatar_url || '';
        if (!avatar && !normalizedProfile.name) return msgData;

        return {
            ...msgData,
            user_avatar: msgData.user_avatar || avatar,
            sender_avatar: msgData.sender_avatar || avatar,
            avatar_url: msgData.avatar_url || avatar,
            profile_image_url: msgData.profile_image_url || avatar,
            user_name: msgData.user_name || normalizedProfile.name || '',
            sender_name: msgData.sender_name || normalizedProfile.name || '',
        };
    }

    async function resolveSenderProfile(senderId) {
        const key = String(senderId || '').trim();
        if (!key) return null;

        if (key === 'OPERATOR_GHOST') {
            const operatorProfile = normalizeProfileData({
                name: '운영자',
                profile_image_url: '/assets/default-avatar.svg',
            });
            if (operatorProfile) senderProfileCache.set(key, operatorProfile);
            return operatorProfile;
        }

        if (senderProfileCache.has(key)) {
            return senderProfileCache.get(key);
        }

        if (senderProfileRequests.has(key)) {
            return senderProfileRequests.get(key);
        }

        const pending = Promise.resolve(bridge()?.getUserProfile?.(key))
            .then((profile) => {
                const normalized = normalizeProfileData(profile);
                if (normalized) senderProfileCache.set(key, normalized);
                return normalized;
            })
            .catch((error) => {
                console.warn('[chat_ui] sender profile load failed:', error);
                return null;
            })
            .finally(() => {
                senderProfileRequests.delete(key);
            });

        senderProfileRequests.set(key, pending);
        return pending;
    }

    function normalizeIncomingMessage(row) {
        if (!row) return row;

        const normalized = { ...row };
        const content = normalized.content || normalized.message || normalized.text || '';
        normalized.content = content;
        normalized.message = normalized.message || content;
        normalized.text = normalized.text || content;
        normalized.file_data = normalized.file_data || normalized.image_url || null;
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

    function messageIdOf(msg) {
        return String(msg?.id || msg?.key || msg?.client_id || msg?.temp_id || '');
    }

    function messageCursor(msg) {
        const ts = new Date(msg?.updated_at || msg?.created_at || msg?.timestamp || Date.now()).getTime();
        if (Number.isFinite(ts) && ts > 0) return ts;
        const numericId = Number(msg?.id || msg?.key);
        return Number.isFinite(numericId) ? numericId : 0;
    }

    function messageSignature(msgData) {
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
            msgData?.user_avatar || '',
            msgData?.sender_avatar || '',
            msgData?.avatar_url || '',
            msgData?.profile_image_url || '',
            msgData?.updated_at || '',
            msgData?.timestamp || msgData?.created_at || '',
            reactionEntries,
        ].join('||');
    }

    function cacheMessage(msg) {
        const normalized = normalizeIncomingMessage(msg);
        const id = messageIdOf(normalized);
        if (!id) return normalized;
        const record = { ...normalized, id };
        messageCache.set(id, record);
        if (record.client_id) messageCache.set(String(record.client_id), record);
        return record;
    }

    function getCachedMessage(messageId) {
        if (!messageId) return null;
        return messageCache.get(String(messageId)) || null;
    }

    function stopMessageFeed() {
        if (messageFeed?.stop) {
            messageFeed.stop();
        } else if (messageFeed?.close) {
            try { messageFeed.close(); } catch {}
        }
        messageFeed = null;
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
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
        return Promise.all([
            loadMessages({ refreshAll: true }),
            loadPinnedMessages(),
        ]);
    }

    function getReplaySince(timestamp = lastMsgTimestamp) {
        const numeric = Number(timestamp) || 0;
        return numeric > 0 ? Math.max(0, numeric - MESSAGE_CURSOR_OVERLAP_MS) : 0;
    }

    function syncPinnedMessageState(msgData) {
        const normalized = normalizeIncomingMessage(msgData);
        const messageKey = String(normalized?.id || normalized?.key || '');
        if (!messageKey) return false;

        const wasPinned = currentPins.some(pin => String(pin?.id || pin?.key || '') === messageKey);
        const isPinned = !!normalized.is_pinned;
        if (!isPinned && !wasPinned) return false;

        currentPins = currentPins.filter(pin => String(pin?.id || pin?.key || '') !== messageKey);
        if (isPinned) {
            currentPins.unshift({ ...normalized, is_pinned: 1 });
        }
        currentPins.sort((a, b) => messageCursor(b) - messageCursor(a));

        renderPinnedBar();
        if (document.getElementById('commInfoPanel')?.classList.contains('visible')) {
            renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode }).catch(() => {});
        }
        return true;
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
        setupInputUI();
        setupEmojiPicker();
        setupFileUpload();
        setupInputAutoResize();
        setupReply();
        setupMessageSearch();
        setupInfoPanelToggle();
        window.BSQCommunityShared?.setupGatheringPreviewShell?.();
        setupGatheringUI();
        setupScrollUX();
        setupLightbox();
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

                if (!title || !at || !location) { toast("모임명, 일시, 장소를 모두 입력해 주세요."); return; }

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
                        toast(res?.error || '모임 생성에 실패했습니다.');
                    }
                } catch (e) {
                    console.error('Gathering create error:', e);
                    toast('모임 생성 중 오류가 발생했습니다.');
                }
            });
        }
    }

    function openGatheringPreview(msgData) {
        const shared = window.BSQCommunityShared || {};
        const normalized = normalizeIncomingMessage(msgData);
        const roomType = String(currentRoomType || normalized.room_type || normalized.type || '').trim();
        const canManage = !!(currentRoomInfo?.is_instructor || window.__BSQ_DEV_MODE__);
        const canJoin = roomType === 'class' && !canManage;
        const payload = {
            ...normalized,
            room_id: currentRoomId,
            title: normalized.gather_title || normalized.title || '모집 카드',
            description: normalized.description || '',
        };

        shared.openGatheringPreview?.(payload, {
            onJoin: canJoin ? async (data) => {
                const targetId = data?.gathering_id || data?.id || msgData?.gathering_id || msgData?.id;
                if (!targetId) return;
                await joinGathering(currentRoomId, targetId);
            } : null,
            onClose: canManage ? async (data) => {
                const targetId = data?.gathering_id || data?.id || msgData?.gathering_id || msgData?.id;
                if (!targetId) return;
                await closeGathering(currentRoomId, targetId);
            } : null,
            onMap: async (data) => {
                const place = String(data?.location || data?.gather_place || '').trim();
                if (!place) return;
                window.open(`https://map.naver.com/v5/search/${encodeURIComponent(place)}`, '_blank', 'noopener');
            },
        });
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

    function syncInfoPanelShellState(visible) {
        const shell = document.querySelector('.community-shell');
        if (!shell) return;
        shell.classList.toggle('info-panel-open', !!visible);
    }

    function setInfoPanelVisibility(visible) {
        const panel = document.getElementById('commInfoPanel');
        if (!panel) return null;

        panel.classList.toggle('visible', !!visible);
        if (panel.style) {
            panel.style.display = visible ? 'flex' : '';
            panel.style.visibility = visible ? 'visible' : '';
            panel.style.pointerEvents = visible ? 'auto' : '';
        }

        syncInfoPanelShellState(visible);
        return panel;
    }

    function setMobileViewMode(mode = '') {
        const shell = document.querySelector('.community-shell');
        const sidebar = document.getElementById('commSidebar');
        const isMobile = window.innerWidth <= 1024;

        if (shell) {
            shell.dataset.mobileView = isMobile ? String(mode || '') : '';
            shell.classList.toggle('mobile-chat-open', isMobile && mode === 'chat');
            shell.classList.toggle('mobile-list-open', isMobile && mode === 'list');
        }

        if (sidebar && isMobile) {
            sidebar.classList.toggle('hidden', mode === 'chat');
        } else if (sidebar && !isMobile) {
            sidebar.classList.remove('hidden');
        }

        return mode;
    }

    function toggleInfoPanel() {
        const panel = document.getElementById('commInfoPanel');
        if (!panel) return;

        const isVisible = !panel.classList.contains('visible');
        setInfoPanelVisibility(isVisible);

        if (isVisible) {
            currentInfoPanelMode = 'default';
            renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: 'default' }).catch(() => {});
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
                if (e.target.closest('#btnClosePanel')) {
                    setInfoPanelVisibility(false);
                    return;
                }
                if (e.target.closest('#btnChatInfo') || activePanel.contains(e.target)) {
                    return;
                }
                setInfoPanelVisibility(false);
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

    function applyRoomHeader(roomId, roomType, roomInfo) {
        const name = roomInfo?.target_name || roomInfo?.class_name || roomInfo?.group_name || '채팅방';
        const headerName = document.getElementById('chatHeaderName');
        if (headerName) headerName.textContent = name;

        const statusEl = document.getElementById('chatHeaderStatus');
        const btnGathering = document.getElementById('btnGathering');
        const btnGoToClass = document.getElementById('btnGoToClass');

        if (roomType === 'class') {
            if (statusEl) { statusEl.textContent = '클래스 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) {
                btnGathering.hidden = !(window.__BSQ_DEV_MODE__ || roomInfo?.is_instructor);
            }
            if (btnGoToClass) {
                btnGoToClass.style.display = 'inline-flex';
                btnGoToClass.href = `../class_view/class_view.html?id=${encodeURIComponent(roomId)}`;
            }
        } else if (roomType === 'dm') {
            if (statusEl) { statusEl.textContent = '1:1 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) btnGathering.hidden = true;
            if (btnGoToClass) btnGoToClass.style.display = 'none';
        } else if (roomType === 'group') {
            if (statusEl) { statusEl.textContent = '그룹 채팅'; statusEl.className = 'chat-header-status'; }
            if (btnGathering) btnGathering.hidden = true;
            if (btnGoToClass) btnGoToClass.style.display = 'none';
        }
    }

    // ==== 채팅방 열기 (D1 API 기반) ====
    function openRoom(roomId, roomType, roomInfo) {
        const normalizedRoomId = String(roomId || '');
        const normalizedRoomType = String(roomType || '');
        if (!normalizedRoomId) return;

        const isSameRoom =
            normalizedRoomId === String(currentRoomId || '')
            && normalizedRoomType === String(currentRoomType || '');

        if (isSameRoom && !roomInfo?.forceReload) {
            currentRoomInfo = { ...(currentRoomInfo || {}), ...(roomInfo || {}) };
            applyRoomHeader(normalizedRoomId, normalizedRoomType, currentRoomInfo);
            if (document.getElementById('commInfoPanel')?.classList.contains('visible')) {
                setTimeout(() => renderInfoPanel(normalizedRoomId, normalizedRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode }), 0);
            }
            return;
        }

        const roomToken = ++roomOpenSeq;
        stopMessageFeed();
        closeAllMenus();
        currentRoomId = normalizedRoomId;
        currentRoomType = normalizedRoomType;
        currentRoomInfo = roomInfo || {};
        currentInfoPanelMode = 'default';
        editingMsgKey = null;
        clearReplyPreview();
        lastMsgTimestamp = 0;
        messageCache = new Map();
        currentPins = [];
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
            setInfoPanelVisibility(false);
            const infoPanelBody = document.getElementById('infoPanelBody');
            if (infoPanelBody) infoPanelBody.innerHTML = '';
        }

        setMobileViewMode('chat');

        lastScrollTop = 0; unreadCount = 0;
        const inputArea = document.querySelector('.chat-input-area');
        if (inputArea) inputArea.classList.remove('hidden');
        const badge = document.getElementById('scrollBadge');
        const btnScroll = document.getElementById('btnScrollBottom');
        if (badge) badge.style.display = 'none';
        if (btnScroll) btnScroll.classList.remove('active');
        const pinnedBar = document.getElementById('pinnedMsgBar');
        const pinnedContent = document.getElementById('pinnedMsgContent');
        if (pinnedBar) {
            pinnedBar.style.display = 'none';
            pinnedBar.onclick = null;
        }
        if (pinnedContent) pinnedContent.textContent = '';

        // 헤더 업데이트
        applyRoomHeader(normalizedRoomId, normalizedRoomType, currentRoomInfo);

        try {
            localStorage.setItem('bsq_comm_last_room', normalizedRoomId);
            localStorage.setItem('bsq_comm_last_type', normalizedRoomType);
        } catch {}

        loadMessages({ refreshAll: true, roomToken }).then((messages) => {
            if (roomToken !== roomOpenSeq || roomId !== currentRoomId || roomType !== currentRoomType) return;
            startMessageStream(messages || []);
        });
        loadPinnedMessages(roomToken);
        setTimeout(() => renderInfoPanel(roomId, roomType, roomInfo, { open: true, mode: currentInfoPanelMode }), 0);
    }

    function startMessageStream(seedMessages = []) {
        if (!currentRoomId) return;

        stopMessageFeed();
        const bridgeApi = bridge();
        if (!bridgeApi?.listenMessages) {
            pollTimer = setInterval(() => loadMessages({ refreshAll: false }), 3500);
            return;
        }

        messageFeed = bridgeApi.listenMessages(currentRoomId, currentRoomType || 'dm', (msg) => {
            const normalized = normalizeIncomingMessage(msg);
            const ts = messageCursor(normalized);
            if (ts > lastMsgTimestamp) lastMsgTimestamp = ts;
            cacheMessage(normalized);
            renderMessage(normalized.id || normalized.key, normalized, true);

            const currentUserId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : (bridge()?.getUserId?.() || '');
            const senderId = String(normalized.sender_id || normalized.user_id || '').trim();
            if (senderId && senderId !== currentUserId && senderId !== 'OPERATOR_GHOST' && !hasMessageAvatar(normalized)) {
                resolveSenderProfile(senderId).then((profile) => {
                    if (!profile) return;
                    const hydrated = mergeMessageProfile(normalized, profile);
                    cacheMessage(hydrated);
                    renderMessage(hydrated.id || hydrated.key, hydrated, true);
                }).catch(() => {});
            }
        }, {
            since: lastMsgTimestamp,
            seedMessages,
            limit: 120,
            cursorOverlapMs: MESSAGE_CURSOR_OVERLAP_MS,
            onStatus: (status) => {
                const badge = document.getElementById('scrollBadge');
                if (badge && status === 'polling') {
                    badge.style.display = 'block';
                }
            },
        });
    }

    // ==== D1 API 메시지 로드 ====
        async function loadMessages({ refreshAll = false, roomToken = roomOpenSeq } = {}) {
        if (!currentRoomId) return;
        try {
            const roomId = currentRoomId;
            const roomType = currentRoomType;
            const endpoint = getRoomMessagesUrl({
                since: refreshAll ? '' : getReplaySince(lastMsgTimestamp),
                limit: refreshAll ? 120 : 100,
            });
            const res = await window.BSQ.api(endpoint);
            if (roomToken !== roomOpenSeq || roomId !== currentRoomId || roomType !== currentRoomType) return [];

            if (res?.success && res.data) {
                const currentUserId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : (bridge()?.getUserId?.() || '');
                let messages = (Array.isArray(res.data) ? res.data : (res.data.messages || []))
                    .map(normalizeIncomingMessage)
                    .sort((a, b) => new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0));

                const avatarBySender = new Map();
                messages.forEach((msg) => {
                    const senderId = String(msg.sender_id || msg.user_id || '').trim();
                    if (!senderId) return;
                    if (hasMessageAvatar(msg)) {
                        avatarBySender.set(senderId, true);
                    }
                });

                const avatarTargets = Array.from(new Set(messages
                    .map((msg) => String(msg.sender_id || msg.user_id || '').trim())
                    .filter((senderId) => senderId
                        && senderId !== currentUserId
                        && senderId !== 'OPERATOR_GHOST'
                        && !avatarBySender.get(senderId))));

                if (avatarTargets.length) {
                    await Promise.all(avatarTargets.map((senderId) => resolveSenderProfile(senderId)));
                }

                messages = messages.map((msg) => {
                    const senderId = String(msg.sender_id || msg.user_id || '').trim();
                    const profile = senderProfileCache.get(senderId);
                    return profile ? mergeMessageProfile(msg, profile) : msg;
                });

                messages.forEach(msg => {
                    const msgId = msg.id || msg.key;
                    const ts = new Date(msg.updated_at || msg.created_at || msg.timestamp || Date.now()).getTime();
                    if (ts > lastMsgTimestamp) lastMsgTimestamp = ts;
                    cacheMessage(msg);
                    renderMessage(msgId, msg, true);
                });

                return messages;
            }
        } catch (e) {
            console.warn('Message poll error:', e.message);
        }

        return [];
    }

    async function loadPinnedMessages(roomToken = roomOpenSeq) {
        if (!currentRoomId) return;
        try {
            const roomId = currentRoomId;
            const roomType = currentRoomType;
            const endpoint = getRoomMessagesUrl({ pinnedOnly: true, limit: 50 });
            const res = await window.BSQ.api(endpoint);
            if (roomToken !== roomOpenSeq || roomId !== currentRoomId || roomType !== currentRoomType) return;
            if (res?.success && res.data) {
                currentPins = (Array.isArray(res.data) ? res.data : (res.data.messages || []))
                    .map(normalizeIncomingMessage)
                    .filter(msg => msg.is_pinned)
                    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
                renderPinnedBar();

                if (document.getElementById('commInfoPanel')?.classList.contains('visible')) {
                    await renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode });
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
            currentInfoPanelMode = 'pins';
            renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: 'pins' }).catch(() => {});
        };
    }

        function renderMessage(msgId, msgData, append = true) {
        if (!msgData) return;
        msgData = normalizeIncomingMessage(msgData);

        const container = getMessageContainer();
        if (!container) return;

        let currentUserId = bridge()?.getUserId?.() || '';
        if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';

        const normalizedId = String(msgId || msgData.id || msgData.key || msgData.client_id || msgData.temp_id || '');
        if (!normalizedId) return;
        const clientId = String(msgData.client_id || msgData.temp_id || '');

        const senderId = msgData.sender_id || msgData.user_id || '';
        const isMine = senderId === currentUserId;
        const signature = buildMessageSignature(msgData);
        const row = document.getElementById(`msg-${normalizedId}`) || (clientId ? document.querySelector(`[data-client-id="${clientId}"]`) : null);
        const shouldStickToBottom = isMine || isNearBottom(container) || !container.children.length;

        let senderName = msgData.user_name || msgData.sender_name || '';
        let senderAvatar = msgData.user_avatar || msgData.sender_avatar || msgData.avatar_url || msgData.profile_image_url || '';

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
            ${!isMine ? `<div class="msg-avatar"${senderAvatar ? ` style="background-image:url('${escapeHtml(senderAvatar)}')"` : ''}>${!senderAvatar ? '👤' : ''}</div>` : ''}
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
            targetRow.dataset.messageId = normalizedId;
            if (clientId) targetRow.dataset.clientId = clientId;
            targetRow.dataset.signature = signature;
            targetRow.innerHTML = rowInnerHtml;
            targetRow.querySelectorAll('.msg-image').forEach(img => {
                img.addEventListener('click', () => openLightbox(img.src));
            });
            const gatheringCard = targetRow.querySelector('[data-gathering-card="1"]');
            if (gatheringCard) {
                const openCard = () => openGatheringPreview(msgData);
                gatheringCard.addEventListener('click', (event) => {
                    if (event.target.closest('button, a')) return;
                    openCard();
                });
                gatheringCard.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCard();
                    }
                });
                gatheringCard.querySelectorAll('[data-gathering-preview]').forEach((btn) => {
                    btn.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (btn.dataset.gatheringPreview === 'map') {
                            const place = String(msgData.gather_place || msgData.location || '').trim();
                            if (place) {
                                window.open(`https://map.naver.com/v5/search/${encodeURIComponent(place)}`, '_blank', 'noopener');
                                return;
                            }
                        }
                        openCard();
                    });
                });
            }
            if (!targetRow.dataset.ctxBound) {
                setupMsgContextMenu(targetRow, normalizedId, msgData, isMine);
                targetRow.dataset.ctxBound = '1';
            }
        };

        const cachedRecord = { ...msgData, id: normalizedId, client_id: clientId || msgData.client_id || '' };
        cacheMessage(cachedRecord);
        syncPinnedMessageState(cachedRecord);

        if (row) {
            if (row.dataset.signature === signature) {
                row.classList.toggle('pinned', !!msgData.is_pinned);
                row.dataset.messageId = normalizedId;
                if (clientId) row.dataset.clientId = clientId;
                return;
            }

            applyRowState(row);
            if (isMine || shouldStickToBottom) {
                scrollToBottom();
                unreadCount = 0;
                const badge = document.getElementById('scrollBadge');
                const btnScroll = document.getElementById('btnScrollBottom');
                if (badge) badge.style.display = 'none';
                if (btnScroll) btnScroll.classList.remove('active');
            }
            return;
        }

        const newRow = document.createElement('div');
        applyRowState(newRow);
        container.appendChild(newRow);

        if (isMine || shouldStickToBottom) {
            scrollToBottom();
            unreadCount = 0;
            const badge = document.getElementById('scrollBadge');
            const btnScroll = document.getElementById('btnScrollBottom');
            if (badge) badge.style.display = 'none';
            if (btnScroll) btnScroll.classList.remove('active');
        }
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
        if (msgData.type === 'deleted') {
            const deletedText = msgData.content || msgData.message || '메시지가 삭제되었습니다.';
            contentHtml += `<div class="msg-bubble msg-deleted">${escapeHtml(deletedText)}</div>`;
        } else if (msgData.reply_to && msgData.reply_text) {
            contentHtml += `<div class="msg-reply-quote" onclick="document.getElementById('msg-${msgData.reply_to}')?.scrollIntoView({behavior:'smooth', block:'center'})">
                <span class="reply-quote-user">${msgData.reply_user || '이전 메시지'}</span>
                <span class="reply-quote-content">${escapeHtml(msgData.reply_text)}</span>
            </div>`;
        }

        // 메시지 유형별
        if (msgData.type === 'deleted') {
            // tombstone already rendered above
        } else if (msgData.type === 'image' && (msgData.file_data || msgData.image_url)) {
            const imageSrc = msgData.file_data || msgData.image_url;
            contentHtml += `<div class="msg-bubble image-only"><img class="msg-image" src="${imageSrc}" alt="이미지"></div>`;
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
        const title = msgData.gather_title || msgData.title || '클래스 모임';
        const timeInfo = msgData.gather_time || msgData.gathering_at || '-';
        const placeInfo = msgData.gather_place || msgData.location || '-';
        const minCap = msgData.capacity_min || msgData.min_capacity || 0;
        const maxCap = msgData.capacity_max || msgData.max_capacity || 0;
        const currentCount = msgData.current_count || 0;
        const status = msgData.status || 'open';
        const isFull = maxCap > 0 && currentCount >= maxCap;
        const progress = Math.min((currentCount / (maxCap || 1)) * 100, 100);
        const statusLabel = status === 'closed' ? '마감' : isFull ? '정원 마감' : '진행중';

        return `
        <div class="msg-bubble gathering-card" data-gathering-card="1" role="button" tabindex="0" aria-label="모집 카드 자세히 보기">
            <div class="gathering-header gathering-header-row">
                <div class="gathering-main-icon"><i class="fas fa-users"></i></div>
                <div class="gathering-title-stack">
                    <h4>${escapeHtml(title)}</h4>
                    <span class="gathering-subtitle">${escapeHtml(timeInfo || '일정 미정')}</span>
                </div>
                <span class="gathering-status-pill">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="gathering-content">
                <div class="gathering-detail-item"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(placeInfo)}</span></div>
                <div class="gathering-detail-item"><i class="fas fa-users"></i><span>${escapeHtml(maxCap > 0 ? `${minCap || 0} - ${maxCap}명` : `${currentCount}명`)}</span></div>
                <div class="gathering-progress-container">
                    <div class="gathering-progress-meta">
                        <span>참여현황</span><span>${escapeHtml(maxCap > 0 ? `${currentCount} / ${maxCap}명` : `${currentCount}명`)}</span>
                    </div>
                    <div class="gathering-progress-bar"><div class="gathering-progress-fill" style="width:${progress}%;"></div></div>
                </div>
                ${msgData.description ? `<div class="gathering-snippet">${escapeHtml(String(msgData.description).slice(0, 80))}</div>` : ''}
            </div>
            <div class="gathering-footer">
                <div class="gathering-actions">
                    <button type="button" class="btn-gathering-action secondary" data-gathering-preview="map" ${placeInfo ? '' : 'disabled'}>
                        <i class="fas fa-map-marked-alt"></i> 장소 보기
                    </button>
                    <button type="button" class="btn-gathering-action primary" data-gathering-preview="open">
                        <i class="fas fa-up-right-from-square"></i> 자세히 보기
                    </button>
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
            html += `<button type="button" class="reaction-pill ${isMine ? 'mine' : ''}" aria-label="${escapeAttr(`${emoji} ${count}개 반응`) }" onclick="window.CommunityModules.ChatUI.toggleEmojiReaction('${msgId}', '${emoji}')">
                <span class="reaction-emoji-sm">${emoji}</span><span class="reaction-count-sm">${count}</span>
            </button>`;
        }
        html += '</div>';
        return html;
    }

    function removeMessage(key) {
        const cached = getCachedMessage(key);
        document.getElementById(`msg-${key}`)?.remove();
        if (cached?.client_id) {
            document.querySelector(`[data-client-id="${cached.client_id}"]`)?.remove();
            messageCache.delete(String(cached.client_id));
        }
        messageCache.delete(String(key));
        const removedId = String(cached?.id || key || '');
        if (removedId) {
            currentPins = currentPins.filter(pin => String(pin.id || pin.key || '') !== removedId);
            renderPinnedBar();
            if (document.getElementById('commInfoPanel')?.classList.contains('visible')) {
                renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode }).catch(() => {});
            }
        }
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
                    else if (action === 'copy') { navigator.clipboard?.writeText((msg.content || '').replace(/<[^>]*>?/gm, '')); toast('텍스트를 복사했습니다.'); }
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
        if (!requireSecondTap(deletePrompt, key, '메시지를 삭제하려면 5초 안에 다시 눌러 주세요.')) return;
        try {
            const res = await window.BSQ.api(getRoomMessageItemUrl(key), { method: 'DELETE' });
            if (res?.data) {
                renderMessage(res.data.id || key, normalizeIncomingMessage({ ...res.data, client_id: res.data.client_id || key }), true);
            } else {
                removeMessage(key);
            }
        } catch (e) { console.error('Delete failed:', e); }
    }

    // ==== 메시지 전송 (D1 API) ====
    async function setMessagePinned(messageId, nextPinned) {
        if (!currentRoomId || !messageId) return;
        try {
            const endpoint = isClassRoom() ? '/api/chat' : getRoomMessageItemUrl(messageId);
            const payload = isClassRoom() ? { id: messageId, is_pinned: !!nextPinned } : { is_pinned: !!nextPinned };
            const res = await window.BSQ.api(endpoint, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });

            const cached = getCachedMessage(messageId);
            const updated = normalizeIncomingMessage({
                ...(cached || { id: messageId }),
                id: res?.data?.id || cached?.id || messageId,
                is_pinned: !!nextPinned,
                updated_at: res?.data?.updated_at || new Date().toISOString(),
                reactions: res?.data?.reactions || cached?.reactions || {},
            });

            renderMessage(updated.id || messageId, updated, true);
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
        let pendingClientId = null;
        let previousEditingMessage = null;
        let shouldClearInput = false;

        try {
            let currentUserId = bridge()?.getUserId?.() || '';
            if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';

            if (editingMsgKey) {
                const previous = getCachedMessage(editingMsgKey) || { id: editingMsgKey, sender_id: currentUserId };
                previousEditingMessage = previous;
                const optimistic = {
                    ...previous,
                    content,
                    message: content,
                    text: content,
                    edited: true,
                    updated_at: new Date().toISOString(),
                };
                renderMessage(editingMsgKey, optimistic, true);

                const editPayload = { content, message: content, edited: true };
                const res = await window.BSQ.api(getRoomMessageItemUrl(editingMsgKey), {
                    method: isClassRoom() ? 'PUT' : 'PATCH',
                    body: JSON.stringify(editPayload)
                });
                if (!res?.success || !res.data) {
                    throw new Error(res?.error || '메시지 수정에 실패했습니다.');
                }

                renderMessage(res.data.id || editingMsgKey, normalizeIncomingMessage({ ...previous, ...res.data }), true);
                editingMsgKey = null;
                shouldClearInput = true;
            } else {
                const profile = await bridge()?.getUserProfile?.(currentUserId) || { name: '사용자', profile_image_url: '' };
                const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                pendingClientId = clientId;
                const replyData = replyTarget ? (typeof replyTarget === 'object' ? replyTarget : { id: replyTarget }) : null;
                const optimisticMessage = {
                    id: clientId,
                    client_id: clientId,
                    content,
                    message: content,
                    text: content,
                    sender_id: currentUserId,
                    user_avatar: profile.profile_image_url || '',
                    user_name: profile.name || '사용자',
                    type: 'text',
                    room_type: currentRoomType,
                    class_id: isClassRoom() ? currentRoomId : null,
                    is_instructor: (currentRoomInfo?.is_instructor) || window.__BSQ_DEV_MODE__ || false,
                    reply_to: replyData?.id || null,
                    reply_text: replyData?.text || '',
                    reply_user: replyData?.senderName || '',
                    reply_data: replyData ? {
                        id: replyData.id,
                        user_name: replyData.senderName || '',
                        message: replyData.text || '',
                        sender_id: replyData.senderId || '',
                    } : null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    __pending: true,
                };

                renderMessage(clientId, optimisticMessage, true);

                const pushData = {
                    content,
                    message: content,
                    sender_id: currentUserId,
                    user_avatar: profile.profile_image_url || '',
                    user_name: profile.name || '사용자',
                    type: 'text',
                    room_type: currentRoomType,
                    class_id: isClassRoom() ? currentRoomId : null,
                    is_instructor: (currentRoomInfo?.is_instructor) || window.__BSQ_DEV_MODE__ || false,
                    client_id: clientId,
                };

                if (replyData) {
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

                const res = await window.BSQ.api(getRoomMessageCollectionUrl(), {
                    method: 'POST',
                    body: JSON.stringify(pushData)
                });

                if (!res?.success || !res.data) {
                    throw new Error(res?.error || '메시지 전송에 실패했습니다.');
                }

                const serverMsg = normalizeIncomingMessage({ ...res.data, client_id: res.data.client_id || clientId });
                renderMessage(serverMsg.id || clientId, serverMsg, true);
                shouldClearInput = true;
            }
        } catch (e) {
            console.error('Send error:', e);
            if (previousEditingMessage && editingMsgKey) {
                renderMessage(editingMsgKey, normalizeIncomingMessage(previousEditingMessage), true);
            }
            if (pendingClientId) {
                removeMessage(pendingClientId);
            }
            window.BSQCommunityShared?.toast?.(e?.message || '메시지 전송에 실패했습니다.');
        } finally {
            if (shouldClearInput) {
                msgInput.value = '';
                msgInput.style.background = '';
                msgInput.dispatchEvent(new Event('input'));
                clearReplyPreview();
            }
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
            const isImage = file.type.startsWith('image/');
            const tempId = `tmp_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const previewUrl = isImage ? URL.createObjectURL(file) : '';

            let currentUserId = bridge()?.getUserId?.() || '';
            if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';

            Promise.resolve(bridge()?.getUserProfile?.(currentUserId) || { name: '사용자', profile_image_url: '' }).then((profile) => {
                renderMessage(tempId, {
                    id: tempId,
                    client_id: tempId,
                    content: file.name,
                    message: file.name,
                    sender_id: currentUserId,
                    user_avatar: profile.profile_image_url || '',
                    user_name: profile.name || '사용자',
                    type: isImage ? 'image' : 'file',
                    file_name: file.name,
                    file_size: file.size,
                    file_data: previewUrl || '',
                    room_type: currentRoomType,
                    class_id: isClassRoom() ? currentRoomId : null,
                    __pending: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }, true);

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const res = await window.BSQ.api(getRoomMessageCollectionUrl(), {
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
                                image_url: e.target.result,
                                room_type: currentRoomType,
                                class_id: isClassRoom() ? currentRoomId : null,
                                client_id: tempId,
                            })
                        });

                        if (!res?.success || !res.data) {
                            throw new Error(res?.error || '파일 전송에 실패했습니다.');
                        }

                        renderMessage(res.data.id || tempId, normalizeIncomingMessage({ ...res.data, client_id: res.data.client_id || tempId }), true);
                    } catch (error) {
                        removeMessage(tempId);
                        console.warn('File upload failed:', error);
                    } finally {
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                    }
                };
                reader.onerror = () => {
                    removeMessage(tempId);
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                };
                reader.readAsDataURL(file);
            });
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
        let clientId = null;
        try {
            let currentUserId = bridge()?.getUserId?.() || '';
            if (window.__BSQ_DEV_MODE__) currentUserId = 'OPERATOR_GHOST';
            const profile = await bridge()?.getUserProfile?.(currentUserId) || { name: '강사' };

            clientId = `tmp_gather_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            renderMessage(clientId, {
                id: clientId,
                client_id: clientId,
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
                class_id: isClassRoom() ? currentRoomId : null,
                __pending: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, true);

            const res = await window.BSQ.api(getRoomMessageCollectionUrl(), {
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
                    class_id: isClassRoom() ? currentRoomId : null,
                    client_id: clientId,
                })
            });
            if (!res?.success || !res.data) {
                throw new Error(res?.error || '모집 카드 전송에 실패했습니다.');
            }

            renderMessage(res.data.id || clientId, normalizeIncomingMessage({ ...res.data, client_id: res.data.client_id || clientId }), true);
        } catch (e) {
            console.error('Send Gathering error:', e);
            removeMessage(clientId);
            toast("모집 카드 전송에 실패했습니다.");
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
                toast("모임 참여가 완료되었습니다!");
                await loadPinnedMessages();
            } else {
                toast(res?.error || "참여 처리에 실패했습니다.");
            }
        } catch (e) {
            console.error("Gathering join error:", e);
            toast("참여 처리 중 오류가 발생했습니다.");
        }
    }

    async function closeGathering(roomId, gatherId) {
        if (!requireSecondTap(gatherClosePrompt, gatherId, '모집을 마감하려면 5초 안에 다시 눌러 주세요.')) return;
        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'close',
                    gathering_id: gatherId
                })
            });
            if (res?.success) {
                toast("모집이 마감되었습니다.");
                await loadPinnedMessages();
            } else {
                toast(res?.error || "마감 처리에 실패했습니다.");
            }
        } catch (e) {
            console.error("Close gathering error:", e);
            toast("마감 처리 중 오류가 발생했습니다.");
        }
    }

        function toggleEmojiReaction(msgId, emoji) {
        const endpoint = isClassRoom()
            ? `/api/chat/${encodeURIComponent(msgId)}/reaction`
            : `/api/dm/${currentRoomId}/messages/${msgId}/reaction`;

        window.BSQ.api(endpoint, {
            method: 'POST',
            body: JSON.stringify({ emoji })
        }).then((res) => {
            const current = getCachedMessage(msgId) || {};
            const updated = normalizeIncomingMessage({
                ...current,
                id: res?.data?.id || current.id || msgId,
                reactions: res?.data?.reactions || current.reactions || {},
                updated_at: res?.data?.updated_at || new Date().toISOString(),
            });
            renderMessage(updated.id || msgId, updated, true);
        }).catch(e => console.warn('Reaction error:', e));
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function escapeAttr(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / 1048576).toFixed(1) + 'MB';
    }

    function renderInfoSectionHTML(items = []) {
        return items
            .filter((item) => item && item.label)
            .map((item) => `
                <div class="info-detail-item">
                    <span class="detail-label">${escapeHtml(item.label)}</span>
                    <span class="detail-value">${escapeHtml(item.value === 0 ? '0' : (item.value ?? '정보 없음'))}</span>
                </div>
            `)
            .join('');
    }

    async function renderDmProfile(body, roomInfo = {}) {
        const shared = window.BSQCommunityShared || {};
        const targetId = String(roomInfo?.target_id || roomInfo?.target_user_id || '').trim();
        const name = roomInfo?.target_name || roomInfo?.dm_name || '상대 프로필';
        const avatar = roomInfo?.target_avatar || roomInfo?.avatar_url || roomInfo?.profile_image || '';
        const lastMessage = roomInfo?.last_message || '최근 대화를 선택하면 요약을 확인할 수 있습니다.';
        const relation = targetId && shared.getFriendRelation
            ? await shared.getFriendRelation(targetId).catch(() => null)
            : null;
        const isBlocked = !!relation?.blocked;
        const isFriend = !!relation?.friend;
        const isPending = !!relation?.pending;
        const isPopupLayout = document.body?.dataset?.layout === 'popup';
        const relationLabel = isBlocked
            ? '차단됨'
            : isFriend
                ? '친구'
                : isPending
                    ? '요청 보류'
                    : '친구 아님';
        const statusLabel = isBlocked ? '차단 상태' : isFriend ? '친구 상태' : '관계 상태';
        const detailItems = [
            { label: '대화 유형', value: '1:1 채팅' },
            { label: '읽지 않음', value: Number(roomInfo?.unread_count || 0) },
            { label: statusLabel, value: relationLabel },
            { label: '최근 메시지', value: lastMessage },
        ];

        const primaryLabel = isBlocked
            ? '차단 해제'
            : isFriend
                ? (isPopupLayout ? '프로필 표시 중' : '친구 프로필')
                : isPending
                    ? '요청 보류'
                    : '친구 추가';
        const primaryDisabled = isPending || (isPopupLayout && isFriend);
        const showBlockAction = !isBlocked;

        body.innerHTML = `
            <div class="info-profile-section">
                <div class="info-avatar"${avatar ? ` style="background-image:url(${escapeHtml(avatar)})"` : ''}>${avatar ? '' : '👤'}</div>
                <h4 class="info-name">${escapeHtml(name)}</h4>
                <div class="info-id">${escapeHtml(roomInfo?.target_email || roomInfo?.room_id || 'DM')}</div>
                <div class="info-description">${escapeHtml(lastMessage)}</div>
            </div>
            <div class="info-detail-grid">
                ${renderInfoSectionHTML(detailItems)}
            </div>
            <div class="info-actions">
                <button type="button" class="btn-info-action primary" id="btnInfoPrimary" ${primaryDisabled ? 'disabled' : ''}>${escapeHtml(primaryLabel)}</button>
                ${showBlockAction ? '<button type="button" class="btn-info-action secondary" id="btnInfoBlock">차단</button>' : ''}
            </div>
        `;

        body.querySelector('#btnInfoPrimary')?.addEventListener('click', async () => {
            if (!targetId || primaryDisabled) return;

            if (isBlocked) {
                const res = await shared.unblockUser?.(targetId);
                if (res?.success) {
                    shared.toast?.(res.message || '차단을 해제했습니다.');
                    await renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode });
                } else {
                    shared.toast?.(res?.error || '차단 해제에 실패했습니다.');
                }
                return;
            }

            await window.addFriend?.(targetId);
            await renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode }).catch(() => {});
        });

        body.querySelector('#btnInfoBlock')?.addEventListener('click', async () => {
            if (!targetId) return;
            const res = await shared.blockUser?.(targetId);
            if (res?.success) {
                shared.toast?.(res.message || '차단했습니다.');
                await renderInfoPanel(currentRoomId, currentRoomType, currentRoomInfo, { open: true, mode: currentInfoPanelMode });
                await window.__BSQ_FRIENDS_REFRESH__?.();
            } else {
                shared.toast?.(res?.error || '차단에 실패했습니다.');
            }
        });
    }

    async function renderClassInfoPanel(body, roomId, roomInfo = {}) {
        const shared = window.BSQCommunityShared || {};
        const classId = roomInfo?.class_id || roomId;
        const view = (roomInfo?.is_instructor || roomInfo?.view === 'instructor' || window.__BSQ_DEV_MODE__) ? 'instructor' : 'student';

        body.innerHTML = '<div class="class-info-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> 데이터 로딩 중...</div>';

        try {
            const [memberRes, gatherRes] = await Promise.all([
                window.BSQ.api(`/api/classes/members?class_id=${encodeURIComponent(classId)}&view=${encodeURIComponent(view)}`),
                window.BSQ.api(`/api/gatherings?class_id=${encodeURIComponent(classId)}`).catch(() => null),
            ]);

            if (!memberRes?.success) {
                body.innerHTML = '<div class="class-info-empty">멤버 정보를 불러올 수 없습니다.</div>';
                return;
            }

            const members = Array.isArray(memberRes.data?.members) ? memberRes.data.members : [];
            const totalMembers = Number(memberRes.data?.total_members || 0) || 0;
            const passStats = memberRes.data?.pass_stats || {};
            const classInfo = memberRes.data?.class_info || roomInfo || {};
            const gatherings = gatherRes?.success && Array.isArray(gatherRes.data) ? gatherRes.data : [];

            body.innerHTML = shared.renderClassInfoPanelHtml?.({
                classInfo,
                members,
                totalMembers,
                passStats,
                view,
                roomInfo,
                gatherings,
                currentChatCount: totalMembers,
            }) || '<div class="class-info-empty">정보를 표시할 수 없습니다.</div>';

            body.querySelectorAll('[data-friend-add]').forEach((btn) => {
                btn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const targetId = String(btn.dataset.friendAdd || '').trim();
                    if (!targetId) return;
                    await window.addFriend?.(targetId);
                });
            });

            body.querySelectorAll('[data-gathering-preview="1"]').forEach((card) => {
                const openCard = () => {
                    const payload = {
                        gathering_id: card.dataset.gatheringId || '',
                        title: card.dataset.title || '모집 카드',
                        gathering_at: card.dataset.time || '',
                        location: card.dataset.place || '',
                        current_count: Number(card.dataset.count || 0),
                        min_capacity: Number(card.dataset.min || 0),
                        max_capacity: Number(card.dataset.max || 0),
                        status: card.dataset.status || 'open',
                        description: card.dataset.desc || '',
                        created_by: card.dataset.createdBy || '',
                    };

                    shared.openGatheringPreview?.(payload, {
                        onJoin: view !== 'instructor' ? async (data) => {
                            const targetId = data?.gathering_id || data?.id || card.dataset.gatheringId || '';
                            if (!targetId) return;
                            await joinGathering(classId, targetId);
                        } : null,
                        onClose: view === 'instructor' ? async (data) => {
                            const targetId = data?.gathering_id || data?.id || card.dataset.gatheringId || '';
                            if (!targetId) return;
                            await closeGathering(classId, targetId);
                        } : null,
                        onMap: async (data) => {
                            const place = String(data?.location || '').trim();
                            if (!place) return;
                            window.open(`https://map.naver.com/v5/search/${encodeURIComponent(place)}`, '_blank', 'noopener');
                        },
                    });
                };

                card.addEventListener('click', (event) => {
                    if (event.target.closest('button, a')) return;
                    openCard();
                });
                card.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCard();
                    }
                });
            });
        } catch (err) {
            body.innerHTML = `<div class="class-info-empty">오류 발생: ${escapeHtml(err.message || '알 수 없는 오류')}</div>`;
        }
    }

    // ==== 정보 패널 렌더링 (D1 API) ====
    async function renderInfoPanel(roomId, roomType, roomInfo, options = {}) {
        const hasExplicitTarget = arguments.length > 0;
        roomId = roomId || currentRoomId;
        roomType = roomType || currentRoomType;
        roomInfo = roomInfo || currentRoomInfo;

        const panel = document.getElementById('commInfoPanel');
        const title = document.getElementById('infoPanelTitle');
        const body = document.getElementById('infoPanelBody');
        if (!panel || !body) return;

        currentInfoPanelMode = String(options.mode || currentInfoPanelMode || 'default');

        const shouldOpenPanel = !!options.open || panel.classList.contains('visible') || !hasExplicitTarget;
        if (shouldOpenPanel) {
            setInfoPanelVisibility(true);
        }

        body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--comm-text2);"><i class="fas fa-circle-notch fa-spin"></i></div>';

        if (currentInfoPanelMode === 'pins') {
            if (title) title.textContent = '고정 메시지';
            body.innerHTML = currentPins.length
                ? buildPinnedMessagesSectionHtml(roomType)
                : '<div class="empty-inline">고정 메시지가 없습니다.</div>';
            bindPinnedMessageItems(body);
            return;
        }

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
        init, openRoom, sendCurrentMessage, renderInfoPanel, toggleInfoPanel, setMobileViewMode,
        getCurrentRoomId: () => currentRoomId,
        getCurrentRoomType: () => currentRoomType,
        sendGatheringCard, joinGathering, closeGathering,
        toggleEmojiReaction, closeAllMenus, showEmojiPickerAt,
        v2ToggleContact: async (targetId) => window.addFriend?.(targetId)
    };
})();
