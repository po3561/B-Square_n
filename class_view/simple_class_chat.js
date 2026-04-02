window.SimpleClassChat = (function () {
    const state = {
        classId: null,
        userId: null,
        userProfile: null,
        isInstructor: false,
        hasAccess: false,
        feed: null,
        pollTimer: null,
        lastCursor: 0,
        pinnedMessages: [],
        messageCache: new Map(),
        replyTarget: null,
        editTargetId: null,
        isSending: false,
        deletePrompt: { id: null, at: 0 },
    };

    const EMOJIS = ['😀', '😂', '🥰', '😍', '🤔', '😅', '😎', '🥳', '😢', '😡', '👍', '👎', '❤️', '🔥', '⭐', '🎉', '💯', '🙌', '👏', '🤝', '💪', '🙏', '✨', '💬'];
    const MESSAGE_CURSOR_OVERLAP_MS = 1000;

    function bridge() { return window.CommunityModules?.SyncBridge || null; }
    function q(id) { return document.getElementById(id); }
    function escapeHtml(v) { const d = document.createElement('div'); d.textContent = String(v ?? ''); return d.innerHTML; }
    function escapeAttr(v) { return escapeHtml(v).replace(/"/g, '&quot;'); }
    function parseJson(v, fallback) { try { return typeof v === 'string' ? JSON.parse(v) : (v || fallback); } catch { return fallback; } }
    function getDocumentTheme() {
        return document.documentElement.getAttribute('data-theme')
            || document.body?.getAttribute('data-theme')
            || localStorage.getItem('bsq_theme')
            || 'dark';
    }
    function syncChatTheme(theme = getDocumentTheme()) {
        const next = theme === 'light' ? 'light' : 'dark';
        const wrapper = q('tabChat') || document.querySelector('.chat-tab-wrapper');
        if (wrapper) wrapper.setAttribute('data-theme', next);
        return next;
    }
    function observeThemeChanges() {
        if (window.__BSQ_CLASS_CHAT_THEME_OBSERVER__) return;
        const syncFromRoot = () => syncChatTheme();
        const observer = new MutationObserver(syncFromRoot);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
        }
        window.addEventListener('storage', (event) => {
            if (event.key === 'bsq_theme') syncFromRoot();
        });
        window.__BSQ_CLASS_CHAT_THEME_OBSERVER__ = observer;
    }
    function notify(type, title, message) {
        if (typeof window.BSQClassViewToast === 'function') {
            window.BSQClassViewToast(type, title, message);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](`[${title}] ${message}`);
    }

    function normalizeMessage(row) {
        if (!row) return row;
        const msg = { ...row };
        const content = msg.content || msg.message || msg.text || '';
        msg.content = content;
        msg.message = msg.message || content;
        msg.text = msg.text || content;
        msg.file_data = msg.file_data || msg.image_url || '';
        msg.reactions = parseJson(msg.reactions, {}) || {};
        msg.reply_data = parseJson(msg.reply_data, null);
        msg.edited = !!(msg.edited || msg.is_edited);
        return msg;
    }

    function messageId(msg) { return String(msg?.id || msg?.key || msg?.client_id || msg?.temp_id || ''); }
    function messageCursor(msg) { return new Date(msg?.updated_at || msg?.created_at || msg?.timestamp || Date.now()).getTime() || 0; }

    function messageSignature(msg) {
        const reactions = msg?.reactions && typeof msg.reactions === 'object'
            ? Object.keys(msg.reactions).sort().map((k) => `${k}:${JSON.stringify(msg.reactions[k])}`).join('|')
            : '';
        return [
            msg?.type || '', msg?.content || '', msg?.message || '', msg?.text || '',
            msg?.file_name || '', msg?.file_size || '', msg?.file_data ? 'file' : '',
            msg?.gather_title || '', msg?.gather_place || '', msg?.gather_time || '',
            msg?.reply_to || '', msg?.reply_text || '', msg?.reply_user || '',
            msg?.is_pinned ? '1' : '0', msg?.edited ? '1' : '0', msg?.updated_at || '', reactions,
        ].join('||');
    }

    function replaySince(cursor) {
        const numeric = Number(cursor) || 0;
        return numeric > 0 ? Math.max(0, numeric - MESSAGE_CURSOR_OVERLAP_MS) : 0;
    }

    function getContainer() { return q('chatMessagesContainer'); }
    function isNearBottom(container, threshold = 120) { return !container || (container.scrollHeight - container.scrollTop - container.clientHeight < threshold); }
    function scrollToBottom(smooth = false) { const c = getContainer(); if (c) c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

    function setPendingState(pending) {
        const btn = q('btnSend');
        if (btn) { btn.disabled = !!pending; btn.style.opacity = pending ? '0.5' : '1'; }
        state.isSending = !!pending;
    }

    function cacheMessage(row) {
        const msg = normalizeMessage(row);
        const id = messageId(msg);
        if (!id) return msg;
        const rec = { ...msg, id };
        state.messageCache.set(id, rec);
        if (rec.client_id) state.messageCache.set(String(rec.client_id), rec);
        return rec;
    }

    function getCachedMessage(id) { return id ? state.messageCache.get(String(id)) || null : null; }

    function removeCachedMessage(id) {
        const cached = getCachedMessage(id);
        if (cached?.client_id) state.messageCache.delete(String(cached.client_id));
        state.messageCache.delete(String(id));
        q(`msg-${id}`)?.remove();
        if (cached?.client_id) document.querySelector(`[data-client-id="${cached.client_id}"]`)?.remove();
        state.pinnedMessages = state.pinnedMessages.filter((m) => String(m.id) !== String(id));
        updatePinnedBar();
    }

    function syncPinnedState(msg, pinned) {
        const id = messageId(msg);
        if (!id) return;
        if (pinned) {
            state.pinnedMessages = [{ ...msg, is_pinned: true }, ...state.pinnedMessages.filter((m) => String(m.id) !== id)];
        } else {
            state.pinnedMessages = state.pinnedMessages.filter((m) => String(m.id) !== id);
        }
        state.pinnedMessages.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
        updatePinnedBar();
    }

    function updatePinnedBar() {
        const bar = q('pinnedMsgBar');
        const text = q('pinnedMsgText');
        if (!bar || !text) return;
        if (!state.pinnedMessages.length) { bar.style.display = 'none'; return; }
        const top = state.pinnedMessages[0];
        const snippet = String(top.content || top.message || top.text || '').replace(/\s+/g, ' ').trim();
        text.textContent = snippet ? `${snippet.slice(0, 70)}${snippet.length > 70 ? '…' : ''}` : 'Pinned message';
        bar.style.display = 'flex';
        bar.onclick = () => q(`msg-${top.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderReactions(reactions, currentUserId, msgId) {
        if (!reactions || typeof reactions !== 'object') return '';
        const chips = Object.entries(reactions)
            .filter(([, users]) => Array.isArray(users) ? users.length > 0 : Object.keys(users || {}).length > 0)
            .map(([emoji, users]) => {
                const ids = Array.isArray(users) ? users.map(String) : Object.keys(users || {});
                const mine = ids.includes(String(currentUserId));
                return `<button type="button" class="reaction-pill ${mine ? 'mine' : ''}" data-action="react" data-emoji="${escapeAttr(emoji)}" data-msg-id="${escapeAttr(msgId)}"><span class="reaction-emoji-sm">${emoji}</span><span class="reaction-count-sm">${ids.length}</span></button>`;
            }).join('');
        return chips ? `<div class="msg-reactions">${chips}</div>` : '';
    }

    function renderGatheringCard(msg) {
        const title = msg.gather_title || 'Meeting';
        const place = msg.gather_place || 'Unknown location';
        const time = msg.gather_time || 'Date unknown';
        return `
            <div class="msg-bubble gathering-card">
                <div class="gathering-title-row">
                    <div class="gathering-main-icon"><i class="fas fa-users"></i></div>
                    <div class="gathering-title-text">${escapeHtml(title)}</div>
                </div>
                <div class="gathering-info-box">
                    <div class="gathering-info-line"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(place)}</span></div>
                    <div class="gathering-info-line"><i class="fas fa-calendar-alt"></i><span>${escapeHtml(time)}</span></div>
                </div>
            </div>`;
    }

    function clearReplyPreview() {
        state.replyTarget = null;
        const preview = q('replyPreview');
        const replyText = q('replyText');
        if (preview) preview.style.display = 'none';
        if (replyText) replyText.innerHTML = '';
    }

    function setReply(messageId, text, senderName, messageData) {
        state.replyTarget = {
            id: String(messageId || messageData?.id || messageData?.key || ''),
            text: String(text || messageData?.content || messageData?.message || ''),
            senderName: senderName || messageData?.user_name || 'User',
            senderId: messageData?.sender_id || messageData?.user_id || '',
            message: messageData || null,
        };
        const preview = q('replyPreview');
        const replyText = q('replyText');
        if (preview && replyText) {
            preview.style.display = 'flex';
            replyText.innerHTML = `<span class="reply-preview-name">${escapeHtml(state.replyTarget.senderName)}</span> <span class="reply-preview-snippet">${escapeHtml(state.replyTarget.text.slice(0, 80))}</span>`;
        }
    }

    function startEdit(msg) {
        state.editTargetId = String(msg.id);
        const input = q('msgInput');
        if (input) { input.value = msg.content || ''; input.focus(); }
    }
    async function deleteMessage(id) {
        const now = Date.now();
        const targetId = String(id);
        if (state.deletePrompt.id !== targetId || now - state.deletePrompt.at > 5000) {
            state.deletePrompt = { id: targetId, at: now };
            notify('info', '메시지 삭제 확인', '5초 안에 다시 누르면 메시지가 삭제됩니다.');
            return;
        }
        state.deletePrompt = { id: null, at: 0 };
        try {
            await window.BSQ.api(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE' });
            removeCachedMessage(id);
            if (state.replyTarget?.id === String(id)) clearReplyPreview();
        } catch (error) {
            console.warn('deleteMessage failed:', error);
        }
    }

    async function togglePin(msg) {
        const next = !msg.is_pinned;
        try {
            const res = await window.BSQ.api('/api/chat', {
                method: 'PATCH',
                body: JSON.stringify({ id: msg.id, is_pinned: next }),
            });
            const updated = normalizeMessage({ ...(getCachedMessage(msg.id) || msg), ...(res?.data || {}), is_pinned: next });
            renderMessage(updated, { optimistic: true });
            syncPinnedState(updated, next);
        } catch (error) {
            console.warn('togglePin failed:', error);
        }
    }

    async function addReaction(messageId, emoji) {
        try {
            const res = await window.BSQ.api(`/api/chat/${encodeURIComponent(messageId)}/reaction`, {
                method: 'POST',
                body: JSON.stringify({ emoji }),
            });
            const cached = getCachedMessage(messageId) || { id: messageId };
            const updated = normalizeMessage({ ...cached, reactions: res?.data?.reactions || cached.reactions || {}, updated_at: res?.data?.updated_at || new Date().toISOString() });
            renderMessage(updated, { optimistic: true });
            syncPinnedState(updated, !!updated.is_pinned);
        } catch (error) {
            console.warn('addReaction failed:', error);
        }
    }

    async function fetchMessages({ since = '', limit = 100, pinnedOnly = false } = {}) {
        const params = new URLSearchParams();
        params.set('class_id', state.classId);
        params.set('limit', String(limit));
        if (since !== '' && since != null) params.set('since', String(replaySince(since)));
        if (pinnedOnly) params.set('pinned_only', '1');
        const res = await window.BSQ.api(`/api/chat?${params.toString()}`);
        if (!res?.success) return [];
        const rows = Array.isArray(res.data) ? res.data : (res.data?.messages || []);
        return rows.map(normalizeMessage);
    }

    async function loadInitialMessages() {
        const rows = await fetchMessages({ limit: 120 });
        rows.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        rows.forEach((msg) => {
            const cursor = messageCursor(msg);
            if (cursor > state.lastCursor) state.lastCursor = cursor;
            renderMessage(msg, { optimistic: false });
        });
        scrollToBottom();
        return rows;
    }

    async function loadPinnedMessages() {
        const rows = await fetchMessages({ pinnedOnly: true, limit: 50 });
        state.pinnedMessages = rows.filter((msg) => msg.is_pinned).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
        updatePinnedBar();
        return state.pinnedMessages;
    }

    function stopFeed() {
        if (state.feed?.stop) state.feed.stop();
        else if (state.feed?.close) {
            try { state.feed.close(); } catch {}
        }
        state.feed = null;
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function startFeed(seedMessages = []) {
        stopFeed();
        const sync = bridge();
        if (!sync?.listenMessages) {
            state.pollTimer = setInterval(() => {
                fetchMessages({ since: state.lastCursor, limit: 100 }).then((rows) => {
                    rows.forEach((msg) => {
                        const cursor = messageCursor(msg);
                        if (cursor > state.lastCursor) state.lastCursor = cursor;
                        renderMessage(msg, { optimistic: false });
                    });
                }).catch(() => {});
            }, 4000);
            return;
        }

        state.feed = sync.listenMessages(state.classId, 'class', (msg) => {
            const normalized = normalizeMessage(msg);
            const cursor = messageCursor(normalized);
            if (cursor > state.lastCursor) state.lastCursor = cursor;
            renderMessage(normalized, { optimistic: false });
        }, {
            since: state.lastCursor,
            seedMessages,
            limit: 120,
            cursorOverlapMs: MESSAGE_CURSOR_OVERLAP_MS,
        });
    }

    function renderMessage(raw, { optimistic = false } = {}) {
        const msg = normalizeMessage(raw);
        const id = messageId(msg);
        if (!id) return null;

        const container = getContainer();
        if (!container) return null;

        const clientId = String(msg.client_id || msg.temp_id || '');
        const existing = document.getElementById(`msg-${id}`) || (clientId ? document.querySelector(`[data-client-id="${clientId}"]`) : null);
        const currentUserId = state.userId;
        const senderId = msg.sender_id || msg.user_id || '';
        const isMine = String(senderId) === String(currentUserId);
        const signature = messageSignature(msg);
        const shouldStick = optimistic || isNearBottom(container) || !container.children.length;

        const senderName = msg.user_name || msg.sender_name || 'User';
        const avatar = msg.user_avatar || msg.sender_avatar || '/assets/default-avatar.svg';
        const time = msg.timestamp || msg.created_at ? new Date(msg.timestamp || msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

        let contentHtml = '';
        if (msg.type === 'gathering' || msg.type === 'gathering_card') contentHtml = renderGatheringCard(msg);
        else if (msg.type === 'image' && msg.file_data) contentHtml = `<div class="msg-bubble image-only"><img class="msg-image" src="${escapeAttr(msg.file_data)}" alt="image"></div>`;
        else if (msg.type === 'file' && msg.file_name) contentHtml = `<div class="msg-bubble file-only"><div class="file-icon">📄</div><div class="file-info"><div class="file-name">${escapeHtml(msg.file_name)}</div><div class="file-size">${escapeHtml(String(msg.file_size || ''))}</div></div></div>`;
        else contentHtml = `<div class="msg-bubble">${escapeHtml(msg.content || '')}</div>`;

        const replyHtml = msg.reply_data ? `
            <div class="msg-reply-ref" data-reply-id="${escapeAttr(msg.reply_to || msg.reply_data.id || '')}">
                <div class="reply-ref-content">
                    <div class="reply-ref-name">${escapeHtml(msg.reply_data.user_name || 'User')}</div>
                    <div class="reply-ref-text">${escapeHtml(msg.reply_data.message || msg.reply_data.content || '')}</div>
                </div>
            </div>` : '';

        const actionsHtml = `
            <div class="msg-actions">
                <button type="button" data-action="reply">Reply</button>
                <button type="button" data-action="react" data-emoji="😀">😀</button>
                <button type="button" data-action="react" data-emoji="👍">👍</button>
                <button type="button" data-action="react" data-emoji="❤️">❤️</button>
                ${(isMine || state.isInstructor) ? `<button type="button" data-action="pin">${msg.is_pinned ? 'Unpin' : 'Pin'}</button>` : ''}
                ${isMine ? `<button type="button" data-action="edit">Edit</button>` : ''}
                ${(isMine || state.isInstructor) ? `<button type="button" data-action="delete">Delete</button>` : ''}
            </div>`;

        const html = `
            ${!isMine ? `<div class="msg-avatar" style="background-image:url(${escapeAttr(avatar)})"></div>` : ''}
            <div class="msg-wrapper">
                ${!isMine ? `<div class="msg-sender-row">${escapeHtml(senderName)}</div>` : ''}
                ${replyHtml}
                ${contentHtml}
                ${renderReactions(msg.reactions, currentUserId, id)}
                <div class="msg-meta">
                    ${msg.edited ? '<span class="msg-edited">Edited</span>' : ''}
                    <span class="msg-time-sm">${escapeHtml(time)}</span>
                    ${isMine ? '<span class="msg-read-check">✓</span>' : ''}
                </div>
                ${actionsHtml}
            </div>`;

        const row = existing || document.createElement('div');
        row.className = `msg-row ${isMine ? 'mine' : 'other'} ${msg.is_pinned ? 'pinned' : ''}${msg.__pending ? ' pending' : ''}`;
        row.id = `msg-${id}`;
        row.dataset.messageId = id;
        row.dataset.signature = signature;
        if (clientId) row.dataset.clientId = clientId;
        row.innerHTML = html;

        row.querySelectorAll('.msg-image').forEach((img) => {
            img.addEventListener('click', () => window.open(img.src, '_blank', 'noopener'));
        });

        row.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const action = btn.dataset.action;
                const emoji = btn.dataset.emoji;
                if (action === 'reply') setReply(id, msg.content, senderName, msg);
                else if (action === 'edit') startEdit(msg);
                else if (action === 'delete') await deleteMessage(id);
                else if (action === 'pin') await togglePin(msg);
                else if (action === 'react' && emoji) await addReaction(id, emoji);
            });
        });

        cacheMessage(msg);
        syncPinnedState(msg, !!msg.is_pinned);
        if (!existing) container.appendChild(row);
        else if (existing.dataset.signature !== signature) existing.replaceWith(row);
        if (shouldStick) scrollToBottom();
        return row;
    }

    async function sendMessage() {
        const input = q('msgInput');
        const text = input?.value?.trim();
        if (!text || state.isSending || !state.classId) return;

        setPendingState(true);
        const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const profile = state.userProfile || { name: 'User', profile_image_url: '' };
        const nowIso = new Date().toISOString();
        const reply = state.replyTarget ? {
            id: state.replyTarget.id,
            user_name: state.replyTarget.senderName || 'User',
            message: state.replyTarget.text || '',
            sender_id: state.replyTarget.senderId || '',
        } : null;

        const optimistic = {
            id: clientId,
            client_id: clientId,
            user_id: state.userId,
            user_name: profile.name || 'User',
            user_avatar: profile.profile_image_url || '',
            message: text,
            content: text,
            type: 'text',
            class_id: state.classId,
            sender_id: state.userId,
            reply_to: reply?.id || null,
            reply_data: reply,
            reply_text: reply?.message || '',
            reply_user: reply?.user_name || '',
            created_at: nowIso,
            updated_at: nowIso,
            is_pinned: false,
            reactions: {},
            __pending: true,
        };

        renderMessage(optimistic, { optimistic: true });

        try {
            const res = await window.BSQ.api('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    class_id: state.classId,
                    user_id: state.userId,
                    user_name: profile.name || 'User',
                    user_avatar: profile.profile_image_url || '',
                    message: text,
                    type: 'text',
                    reply_to: reply?.id || null,
                    reply_data: reply,
                    client_id: clientId,
                }),
            });
            if (!res?.success || !res.data) {
                throw new Error(res?.error || '메시지 전송에 실패했습니다.');
            }

            renderMessage(normalizeMessage({ ...res.data, client_id: res.data.client_id || clientId }), { optimistic: true });
            input.value = '';
            clearReplyPreview();
        } catch (error) {
            console.warn('sendMessage failed:', error);
            removeCachedMessage(clientId);
        } finally {
            setPendingState(false);
            if (input) input.style.height = 'auto';
        }
    }

    function handleFileSelect(files) {
        if (!files || !files.length) return;
        Array.from(files).forEach((file) => {
            const tempId = `tmp_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const isImage = file.type.startsWith('image/');
            const previewUrl = isImage ? URL.createObjectURL(file) : '';
            const profile = state.userProfile || { name: 'User', profile_image_url: '' };

            renderMessage({
                id: tempId,
                client_id: tempId,
                user_id: state.userId,
                user_name: profile.name || 'User',
                user_avatar: profile.profile_image_url || '',
                message: file.name,
                content: file.name,
                type: isImage ? 'image' : 'file',
                file_name: file.name,
                file_size: file.size,
                file_data: previewUrl,
                class_id: state.classId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                __pending: true,
            }, { optimistic: true });

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const res = await window.BSQ.api('/api/chat', {
                        method: 'POST',
                        body: JSON.stringify({
                            class_id: state.classId,
                            user_id: state.userId,
                            user_name: profile.name || 'User',
                            user_avatar: profile.profile_image_url || '',
                            message: file.name,
                            content: file.name,
                            type: isImage ? 'image' : 'file',
                            file_name: file.name,
                            file_size: file.size,
                            image_url: event.target.result,
                            client_id: tempId,
                        }),
                    });
                    if (!res?.success || !res.data) {
                        throw new Error(res?.error || '파일 전송에 실패했습니다.');
                    }

                    renderMessage(normalizeMessage({ ...res.data, client_id: res.data.client_id || tempId }), { optimistic: true });
                } catch (error) {
                    console.warn('file upload failed:', error);
                    removeCachedMessage(tempId);
                } finally {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    async function sendGatheringCard(title, minCap, maxCap, time, place) {
        const profile = state.userProfile || { name: 'User', profile_image_url: '' };
        const clientId = `tmp_gather_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const optimistic = {
            id: clientId,
            client_id: clientId,
            user_id: state.userId,
            user_name: profile.name || 'User',
            user_avatar: profile.profile_image_url || '',
            type: 'gathering',
            gather_title: title,
            gather_time: time,
            gather_place: place,
            capacity_min: Number(minCap) || 0,
            capacity_max: Number(maxCap) || 0,
            message: JSON.stringify({ title, gather_title: title, gathering_at: time, location: place }),
            content: JSON.stringify({ title, gather_title: title, gathering_at: time, location: place }),
            class_id: state.classId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            __pending: true,
        };
        renderMessage(optimistic, { optimistic: true });

        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'create',
                    class_id: state.classId,
                    instructor_id: state.userId,
                    title,
                    description: '',
                    location: place,
                    gathering_at: time,
                    capacity_max: Number(maxCap) || 0,
                }),
            });
            if (!res?.success || !res.data) {
                throw new Error(res?.error || '모집 카드 생성에 실패했습니다.');
            }

            const gatheringId = res.data.id;
            const chatRes = await window.BSQ.api('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    class_id: state.classId,
                    user_id: state.userId,
                    user_name: profile.name || 'User',
                    user_avatar: profile.profile_image_url || '',
                    type: 'gathering',
                    message: JSON.stringify({ gathering_id: gatheringId, title, location: place, gathering_at: time, capacity_max: Number(maxCap) || 0 }),
                    client_id: clientId,
                }),
            });
            if (!chatRes?.success || !chatRes.data) {
                throw new Error(chatRes?.error || '모집 카드 전송에 실패했습니다.');
            }
            renderMessage(normalizeMessage({ ...chatRes.data, client_id: chatRes.data.client_id || clientId }), { optimistic: true });
        } catch (error) {
            console.warn('sendGatheringCard failed:', error);
            removeCachedMessage(clientId);
        }
    }

    async function joinGathering(roomId, gatherId) {
        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({ action: 'join', gathering_id: gatherId, user_id: state.userId }),
            });
            if (res?.success) {
                await loadPinnedMessages();
            }
        } catch (error) {
            console.warn('joinGathering failed:', error);
        }
    }

    async function closeGathering(roomId, gatherId) {
        try {
            const res = await window.BSQ.api('/api/gatherings', {
                method: 'POST',
                body: JSON.stringify({ action: 'close', gathering_id: gatherId }),
            });
            if (res?.success) {
                await loadPinnedMessages();
            }
        } catch (error) {
            console.warn('closeGathering failed:', error);
        }
    }

    function renderPinnedList(container) {
        if (!container) return;
        container.innerHTML = state.pinnedMessages.map((msg) => `
            <button type="button" class="pinned-item" data-msg-id="${escapeAttr(msg.id)}">
                <span class="pinned-item-title">${escapeHtml(msg.user_name || 'User')}</span>
                <span class="pinned-item-snippet">${escapeHtml((msg.content || msg.message || '').slice(0, 80))}</span>
            </button>
        `).join('');
        container.querySelectorAll('[data-msg-id]').forEach((btn) => {
            btn.addEventListener('click', () => q(`msg-${btn.dataset.msgId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        });
    }

    async function renderInfoPanel(roomId = state.classId, roomType = 'class') {
        const panel = q('commInfoPanel');
        const title = q('infoPanelTitle');
        const body = q('infoPanelBody');
        if (!panel || !body) return;
        if (title) title.textContent = roomType === 'class' ? 'Class Info' : 'Room Info';
        body.innerHTML = `
            <div class="info-profile-section">
                <div class="info-name">${escapeHtml(state.userProfile?.name || 'User')}</div>
                <div class="info-meta">Class ID: ${escapeHtml(roomId || '')}</div>
                <div class="info-meta">Pinned: ${state.pinnedMessages.length}</div>
            </div>
            <div class="info-pinned-list" id="classPinnedList"></div>
        `;
        renderPinnedList(body.querySelector('#classPinnedList'));
    }

    function toggleInfoPanel() {
        const panel = q('commInfoPanel');
        if (!panel) return;
        const visible = panel.classList.toggle('visible');
        panel.style.display = visible ? 'flex' : 'none';
        if (visible) renderInfoPanel();
    }

    function closeAllMenus() { document.querySelectorAll('.simple-chat-popup').forEach((el) => el.remove()); }
    function showEmojiPickerAt(messageId, anchorEl) {
        closeAllMenus();
        const picker = document.createElement('div');
        picker.className = 'simple-chat-popup';
        picker.style.position = 'fixed';
        picker.style.left = `${Math.min(anchorEl.getBoundingClientRect().left, window.innerWidth - 220)}px`;
        picker.style.top = `${Math.max(10, anchorEl.getBoundingClientRect().top - 160)}px`;
        picker.style.display = 'grid';
        picker.style.gridTemplateColumns = 'repeat(6, 1fr)';
        picker.style.gap = '6px';
        picker.style.padding = '10px';
        EMOJIS.forEach((emoji) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-emoji';
            btn.textContent = emoji;
            btn.addEventListener('click', async () => { await addReaction(messageId, emoji); closeAllMenus(); });
            picker.appendChild(btn);
        });
        document.body.appendChild(picker);
        setTimeout(() => document.addEventListener('click', function close(ev) {
            if (!picker.contains(ev.target)) {
                picker.remove();
                document.removeEventListener('click', close);
            }
        }, { once: true }), 0);
    }

    function setupControls() {
        q('btnSend')?.addEventListener('click', () => sendMessage());
        q('msgInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        q('msgInput')?.addEventListener('input', () => {
            const input = q('msgInput');
            if (!input) return;
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        });

        q('btnReplyCancel')?.addEventListener('click', () => clearReplyPreview());
        q('btnChatInfo')?.addEventListener('click', () => toggleInfoPanel());
        q('btnClosePanel')?.addEventListener('click', () => { const panel = q('commInfoPanel'); if (panel) { panel.classList.remove('visible'); panel.style.display = 'none'; } });
        q('btnScrollBottom')?.addEventListener('click', () => { scrollToBottom(true); const badge = q('scrollBadge'); if (badge) badge.style.display = 'none'; });

        const btnEmoji = q('btnEmoji');
        const picker = q('emojiPicker');
        const grid = q('emojiGrid');
        if (grid) {
            grid.innerHTML = EMOJIS.map((e) => `<span class="emoji-item">${e}</span>`).join('');
            grid.querySelectorAll('.emoji-item').forEach((item) => {
                item.addEventListener('click', () => {
                    const input = q('msgInput');
                    if (input) {
                        input.value += item.textContent;
                        input.dispatchEvent(new Event('input'));
                        input.focus();
                    }
                    if (picker) picker.style.display = 'none';
                });
            });
        }
        btnEmoji?.addEventListener('click', (e) => { e.stopPropagation(); if (picker) picker.style.display = picker.style.display === 'none' ? 'block' : 'none'; });
        document.addEventListener('click', (e) => { if (picker && picker.style.display === 'block' && !picker.contains(e.target) && e.target !== btnEmoji) picker.style.display = 'none'; });

        q('btnAttach')?.addEventListener('click', () => q('fileInput')?.click());
        q('fileInput')?.addEventListener('change', (e) => handleFileSelect(e.target.files));

        const commMain = q('commMain');
        const overlay = q('fileDropOverlay');
        if (commMain && overlay) {
            commMain.addEventListener('dragover', (e) => { e.preventDefault(); overlay.classList.add('active'); });
            commMain.addEventListener('dragleave', (e) => { if (!commMain.contains(e.relatedTarget)) overlay.classList.remove('active'); });
            commMain.addEventListener('drop', (e) => { e.preventDefault(); overlay.classList.remove('active'); handleFileSelect(e.dataTransfer.files); });
        }

        q('btnPinnedList')?.addEventListener('click', () => { const overlay = q('pinnedListOverlay'); if (overlay) { overlay.style.display = 'block'; renderPinnedList(q('pinnedListBody')); } });
        q('btnClosePinnedList')?.addEventListener('click', () => { const overlay = q('pinnedListOverlay'); if (overlay) overlay.style.display = 'none'; });
        q('pinnedMsgBar')?.addEventListener('click', () => { const overlay = q('pinnedListOverlay'); if (overlay) { overlay.style.display = 'block'; renderPinnedList(q('pinnedListBody')); } });

        const resizer = q('chatResizer');
        const wrapper = document.querySelector('.chat-tab-wrapper');
        if (resizer && wrapper) {
            let resizing = false;
            let lastY = 0;
            resizer.addEventListener('mousedown', (e) => { resizing = true; lastY = e.clientY; e.preventDefault(); });
            window.addEventListener('mousemove', (e) => {
                if (!resizing) return;
                const delta = e.clientY - lastY;
                const next = Math.max(600, Math.min(1100, wrapper.offsetHeight + delta));
                wrapper.style.setProperty('height', `${next}px`, 'important');
                lastY = e.clientY;
            });
            window.addEventListener('mouseup', () => { resizing = false; });
        }

        const searchBtn = q('btnChatSearch');
        const searchBar = q('chatSearchBar');
        const searchInput = q('msgSearchInput');
        const searchClose = q('msgSearchClose');
        searchBtn?.addEventListener('click', () => { if (searchBar) searchBar.style.display = searchBar.style.display === 'none' ? 'flex' : 'none'; searchInput?.focus(); });
        searchInput?.addEventListener('input', () => {
            const query = String(searchInput.value || '').trim().toLowerCase();
            let matched = 0;
            document.querySelectorAll('#chatMessagesContainer .msg-row').forEach((row) => {
                const show = !query || row.textContent.toLowerCase().includes(query);
                row.style.display = show ? '' : 'none';
                if (show) matched += 1;
            });
            if (q('msgSearchCount')) q('msgSearchCount').textContent = query ? String(matched) : '';
        });
        searchClose?.addEventListener('click', () => {
            if (searchBar) searchBar.style.display = 'none';
            if (searchInput) searchInput.value = '';
            document.querySelectorAll('#chatMessagesContainer .msg-row').forEach((row) => { row.style.display = ''; });
            if (q('msgSearchCount')) q('msgSearchCount').textContent = '';
        });

        const btnGathering = q('btnGathering');
        const gatheringModal = q('gatheringModal');
        const btnGatheringClose = q('btnGatheringClose');
        const btnGatheringCancel = q('btnGatheringCancel');
        const btnGatheringSubmit = q('btnGatheringSubmit');
        const gatheringAt = q('gatheringAt');
        const gatheringDeadline = q('gatheringDeadline');
        const closeGatheringModal = () => { if (gatheringModal) gatheringModal.style.display = 'none'; };
        btnGathering?.addEventListener('click', () => {
            if (!gatheringModal) return;
            gatheringModal.style.display = 'flex';
            const d = new Date();
            d.setDate(d.getDate() + 3);
            d.setHours(14, 0, 0, 0);
            const tz = new Date().getTimezoneOffset() * 60000;
            if (gatheringAt) gatheringAt.value = new Date(d - tz).toISOString().slice(0, 16);
            const d2 = new Date(d); d2.setDate(d2.getDate() - 1);
            if (gatheringDeadline) gatheringDeadline.value = new Date(d2 - tz).toISOString().slice(0, 16);
        });
        btnGatheringClose?.addEventListener('click', closeGatheringModal);
        btnGatheringCancel?.addEventListener('click', closeGatheringModal);
        btnGatheringSubmit?.addEventListener('click', async () => {
            const titleEl = q('gatheringTitle');
            const atEl = q('gatheringAt');
            const locEl = q('gatheringLocation');
            const capEl = q('gatheringCapacity');
            const descEl = q('gatheringDesc');
            if (!titleEl || !atEl || !locEl || !capEl) return;
            const title = titleEl.value.trim();
            const at = atEl.value;
            const location = locEl.value.trim();
            const capacity = parseInt(capEl.value, 10);
            const desc = descEl ? descEl.value.trim() : '';
            if (!title || !at || !capacity || !location) { notify('error', '입력값 확인', '제목, 시간, 장소, 참석자 수를 모두 입력해 주세요.'); return; }
            const gAt = new Date(at);
            const gDeadline = new Date(gAt.getTime() - (24 * 60 * 60 * 1000));
            try {
                const res = await window.BSQ.api('/api/gatherings', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'create', class_id: state.classId, instructor_id: state.userId, title, description: desc, location, gathering_at: gAt.toISOString(), deadline_at: gDeadline.toISOString(), capacity_max: capacity })
                });
                if (res?.success) {
                    await sendGatheringCard(title, 0, capacity, gAt.toISOString(), location);
                    titleEl.value = '';
                    locEl.value = '';
                    if (descEl) descEl.value = '';
                    closeGatheringModal();
                }
            } catch (error) {
                console.warn('gathering submit failed:', error);
            }
        });

    }

    function init(_, classId, userId, hasAccess, isInstructor) {
        stopFeed();
        state.lastCursor = 0;
        state.pinnedMessages = [];
        state.messageCache = new Map();
        state.replyTarget = null;
        state.editTargetId = null;
        state.deletePrompt = { id: null, at: 0 };
        setPendingState(false);

        state.classId = classId;
        state.userId = userId;
        state.userProfile = window.BSQ?.session?.user || { name: 'User', profile_image_url: '' };
        state.isInstructor = !!isInstructor;
        state.hasAccess = !!hasAccess;
        syncChatTheme();
        observeThemeChanges();

        const unlocked = q('chatUnlocked');
        const locked = q('chatLockedOverlay');
        const activeArea = q('chatActiveArea');

        if (!hasAccess || !userId) {
            if (unlocked) unlocked.style.display = 'none';
            if (locked) locked.style.display = 'flex';
            if (activeArea) activeArea.style.display = 'none';
            return;
        }

        if (unlocked) unlocked.style.display = 'flex';
        if (locked) locked.style.display = 'none';
        if (activeArea) activeArea.style.display = 'flex';

        setupControls();
        loadInitialMessages().then((rows) => startFeed(rows)).catch((error) => console.warn('loadInitialMessages failed:', error));
        loadPinnedMessages().catch(() => {});
        window.__BSQ_CLASS_CHAT_INITIALIZED__ = true;
    }

    return {
        init,
        sendMessage,
        renderInfoPanel,
        toggleInfoPanel,
        sendGatheringCard,
        joinGathering,
        closeGathering,
        addReaction,
        closeAllMenus,
        showEmojiPickerAt,
        getCurrentRoomId: () => state.classId,
        getCurrentRoomType: () => 'class',
    };
})();
