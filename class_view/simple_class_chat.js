// simple_class_chat.js - 클래스 전용 최소 채팅 컨트롤러
// CommunityModules.ChatUI 에 의존하지 않고, HTML 구조 그대로 사용해서
// 기본적인 "보내기 / 실시간 수신"만 구현합니다.

window.SimpleClassChat = (function () {
    const state = {
        db: null,
        classId: null,
        userId: null,
        isInstructor: false,
        pins: {}, // { pinId: { messageId, content, timestamp, senderName } }
        passInfo: null, // { monthly: boolean, count: number, ... }
    };

    function init(db, classId, userId, hasAccess, isInstructor) {
        console.log('🧩 SimpleClassChat init', { classId, userId, hasAccess, isInstructor });

        state.db = db;
        state.classId = classId;
        state.userId = userId;
        state.isInstructor = !!isInstructor;

        const lockedOverlay = document.getElementById('chatLockedOverlay');
        const unlockedArea = document.getElementById('chatUnlocked');

        if (!hasAccess || !userId) {
            if (lockedOverlay) lockedOverlay.style.display = 'flex';
            if (unlockedArea) unlockedArea.style.display = 'none';
            return;
        }

        if (lockedOverlay) lockedOverlay.style.display = 'none';
        if (unlockedArea) unlockedArea.style.display = 'flex';

        const msgInput = document.getElementById('msgInput');
        const btnSend = document.getElementById('btnSend');
        const messagesEl = document.getElementById('chatMessagesContainer');

        if (!msgInput || !btnSend || !messagesEl) {
            console.error('❌ SimpleClassChat: 필수 DOM 요소를 찾지 못했습니다.', {
                msgInput: !!msgInput,
                btnSend: !!btnSend,
                messagesEl: !!messagesEl
            });
            return;
        }

        const classRef = db.ref('chats/' + classId);

        // 내 패스 정보(월정액 여부 등) 조회
        db.ref(`user_passes/${userId}/${classId}`).once('value')
            .then((snap) => {
                state.passInfo = snap.val() || {};
                console.log('🎫 SimpleClassChat: passInfo', state.passInfo);
            })
            .catch((err) => {
                console.warn('SimpleClassChat: passInfo 로드 실패', err);
            });

        // 수신 리스너
        classRef.off();
        classRef.limitToLast(100).on('child_added', (snap) => {
            const msg = snap.val();
            if (!msg) return;
            appendMessage(messagesEl, snap.key, msg, userId);
            // 맨 아래로 스크롤
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });

        // 고정 메시지 UI/데이터 초기화
        setupPinnedMessages();

        // 전송 처리
        btnSend.onclick = () => sendMessage(classRef, msgInput, userId, isInstructor);
        msgInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(classRef, msgInput, userId, isInstructor);
            }
        });

        // 모임(캘린더) 버튼 - 강사 전용
        const btnGathering = document.getElementById('btnGathering');
        const gatheringModal = document.getElementById('gatheringModal');
        const btnCloseGathering = document.getElementById('btnCloseGatheringModal');
        const btnSendGathering = document.getElementById('btnSendGatheringSubmit');

        if (state.isInstructor && btnGathering && gatheringModal && btnSendGathering) {
            btnGathering.style.display = 'flex';
            btnGathering.onclick = () => {
                gatheringModal.style.display = 'flex';
                document.getElementById('gatherTitle').value = '';
                document.getElementById('gatherTime').value = '';
                document.getElementById('gatherPlace').value = '';
                document.getElementById('gatherMin').value = '';
                document.getElementById('gatherMax').value = '';
            };

            btnCloseGathering && (btnCloseGathering.onclick = () => {
                gatheringModal.style.display = 'none';
            });

            btnSendGathering.onclick = () => {
                const title = document.getElementById('gatherTitle').value.trim();
                const time = document.getElementById('gatherTime').value.trim();
                const place = document.getElementById('gatherPlace').value.trim();
                const min = parseInt(document.getElementById('gatherMin').value.trim(), 10);
                const max = parseInt(document.getElementById('gatherMax').value.trim(), 10);

                if (!title || !time || !place || isNaN(min) || isNaN(max)) {
                    alert('모든 항목을 올바르게 입력해 주세요.');
                    return;
                }
                if (min < 0 || max <= 0 || min > max) {
                    alert('최소/최대 인원 값을 다시 확인해 주세요.');
                    return;
                }

                sendGatheringMessage(classRef, {
                    title,
                    time,
                    place,
                    min,
                    max
                }, userId);

                gatheringModal.style.display = 'none';
            };
        }
    }

    function sendMessage(classRef, msgInput, userId, isInstructor) {
        const text = msgInput.value.trim();
        if (!text) return;

        const payload = {
            content: text,
            sender_id: userId,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            type: 'text',
            is_instructor: !!isInstructor
        };

        classRef.push(payload).catch((err) => {
            console.error('❌ SimpleClassChat: 메시지 전송 실패', err);
            alert('메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        });

        msgInput.value = '';
    }

    function sendGatheringMessage(classRef, payload, userId) {
        const data = {
            type: 'gathering',
            title: payload.title,
            time: payload.time,
            place: payload.place,
            min: payload.min,
            max: payload.max,
            sender_id: userId,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        classRef.push(data).catch((err) => {
            console.error('❌ SimpleClassChat: 모임 메시지 전송 실패', err);
            alert('모임 카드 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        });
    }

    function appendMessage(container, key, msg, currentUserId) {
        const isMine = msg.sender_id === currentUserId;

        if (msg.type === 'gathering') {
            appendGatheringCard(container, key, msg, currentUserId);
            return;
        }

        const row = document.createElement('div');
        row.className = 'chat-msg' + (isMine ? ' mine' : '');
        row.dataset.messageId = key;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = msg.content || '';

        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'msg-time-sm';
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            timeSpan.textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }
        meta.appendChild(timeSpan);

        row.appendChild(bubble);
        row.appendChild(meta);

        // 강사용: 우클릭 메뉴로 "메시지 고정/해제" 제공
        if (state.isInstructor) {
            console.log('🖱️ SimpleClassChat: contextmenu 리스너 등록', { messageId: key, isMine });
            row.addEventListener('contextmenu', (e) => {
                console.log('🖱️ SimpleClassChat: contextmenu 발생', { messageId: key });
                e.preventDefault();
                showMessageContextMenu(e.clientX, e.clientY, key, msg);
            });
        }

        container.appendChild(row);
    }

    function appendGatheringCard(container, key, msg, currentUserId) {
        const isMine = msg.sender_id === currentUserId;
        const row = document.createElement('div');
        row.className = 'chat-msg' + (isMine ? ' mine' : '');
        row.dataset.messageId = key;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble gathering-card';

        const title = msg.title || '모임';
        const time = msg.time || '';
        const place = msg.place || '';
        const min = msg.min ?? '';
        const max = msg.max ?? '';

        bubble.innerHTML = `
            <div style="font-weight: 800; margin-bottom: 6px; font-size: 0.95rem;">${title}</div>
            <div style="font-size: 0.85rem; color: var(--comm-text2); display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
                <span>📅 ${time}</span>
                <span>📍 ${place}</span>
                <span>👥 최소 ${min}명 / 최대 ${max}명</span>
            </div>
            <div class="gathering-actions" style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                ${renderGatheringButtons(msg)}
            </div>
        `;

        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'msg-time-sm';
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            timeSpan.textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }
        meta.appendChild(timeSpan);

        row.appendChild(bubble);
        row.appendChild(meta);

        container.appendChild(row);
    }

    function renderGatheringButtons(msg) {
        // 강사: 모집 마감 버튼
        if (state.isInstructor) {
            return `
                <button class="btn-info-action-lg primary" style="flex:1; min-width:120px;"
                    onclick="alert('모집 마감 로직은 나중에 구현 예정입니다.');">
                    모집 마감
                </button>
            `;
        }

        // 수강생: 월정액 여부에 따라 라벨만 다르게
        const monthly = !!(state.passInfo && state.passInfo.monthly);
        const joinLabel = monthly ? '모임 참여' : '모임 참여 (수강권 1회 사용)';

        return `
            <button class="btn-info-action-lg primary" style="flex:1; min-width:120px;"
                onclick="alert('참여 로직은 나중에 구현 예정입니다.');">
                ${joinLabel}
            </button>
            <button class="btn-info-action-lg danger" style="flex:1; min-width:120px;"
                onclick="alert('불참 처리 로직은 나중에 구현 예정입니다.');">
                모임 불참
            </button>
        `;
    }

    // === 고정 메시지 관련 ===
    function setupPinnedMessages() {
        const db = state.db;
        const classId = state.classId;
        if (!db || !classId) return;

        const pinnedBar = document.getElementById('pinnedMsgBar');
        const pinnedText = document.getElementById('pinnedMsgText');
        const pinnedContent = document.getElementById('pinnedMsgContent');
        const btnPinnedList = document.getElementById('btnPinnedList');
        const pinnedListOverlay = document.getElementById('pinnedListOverlay');
        const pinnedListBody = document.getElementById('pinnedListBody');
        const pinnedListTitle = document.getElementById('pinnedListTitle');
        const btnClosePinnedList = document.getElementById('btnClosePinnedList');

        const pinsRef = db.ref('pinned_messages/' + classId);

        // 실시간 핀 목록 동기화
        pinsRef.on('value', (snap) => {
            state.pins = snap.val() || {};
            const pinsArr = Object.entries(state.pins).map(([id, v]) => ({ id, ...v }));

            if (!pinnedBar || !pinnedText) return;

            if (pinsArr.length === 0) {
                pinnedBar.style.display = 'none';
                if (pinnedListBody) pinnedListBody.innerHTML = '';
                return;
            }

            // 최신 핀 1개를 상단 바에 표시
            pinsArr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const latest = pinsArr[pinsArr.length - 1];
            pinnedBar.style.display = 'flex';
            pinnedText.textContent = latest.content || '';

            // 상단 바 클릭 시 해당 메시지로 스크롤
            pinnedContent.onclick = () => scrollToMessage(latest.messageId);

            // 오버레이 리스트 갱신
            if (pinnedListBody && pinnedListTitle) {
                pinnedListTitle.textContent = `${pinsArr.length}개의 고정된 메시지`;
                pinnedListBody.innerHTML = '';

                // 날짜 헤더 + 채팅 버블 형태로 렌더링 (텔레그램 스타일 유사)
                let lastDateLabel = '';
                [...pinsArr].reverse().forEach((pin) => {
                    const ts = pin.timestamp ? new Date(pin.timestamp) : null;
                    const dateLabel = ts
                        ? `${ts.getMonth() + 1}월 ${ts.getDate()}일`
                        : '';
                    const timeStr = ts
                        ? ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                        : '';

                    // 날짜가 바뀌면 가운데 회색 배지 추가
                    if (dateLabel && dateLabel !== lastDateLabel) {
                        lastDateLabel = dateLabel;
                        const dateDiv = document.createElement('div');
                        dateDiv.className = 'pin-date-header';
                        dateDiv.textContent = dateLabel;
                        pinnedListBody.appendChild(dateDiv);
                    }

                    // 채팅 버블 한 줄
                    const row = document.createElement('div');
                    row.className = 'chat-msg';
                    row.dataset.messageId = pin.messageId;

                    const bubble = document.createElement('div');
                    bubble.className = 'msg-bubble';
                    bubble.textContent = pin.content || '';

                    const meta = document.createElement('div');
                    meta.className = 'msg-meta';
                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'msg-time-sm';
                    timeSpan.textContent = timeStr;
                    meta.appendChild(timeSpan);

                    row.appendChild(bubble);
                    row.appendChild(meta);

                    // 클릭 → 해당 원본 메시지로 이동
                    row.onclick = () => {
                        scrollToMessage(pin.messageId);
                        if (pinnedListOverlay) pinnedListOverlay.style.display = 'none';
                    };

                    // 우클릭 → 고정 해제 메뉴
                    if (state.isInstructor) {
                        row.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            showUnpinMenu(e.clientX, e.clientY, pin.id);
                        });
                    }

                    pinnedListBody.appendChild(row);
                });
            }
        });

        // 햄버거 버튼 → 고정 메시지 전용 화면으로 "전환"
        const chatMessages = document.getElementById('chatMessagesContainer');
        const chatInput = document.getElementById('chatInputArea');
        const pinnedBarTop = document.getElementById('pinnedMsgBar');

        function showPinnedScreen() {
            console.log('📂 SimpleClassChat: showPinnedScreen 호출');
            if (pinnedListOverlay) {
                // HTML에 style="display:none" 이 박혀 있어서 명시적으로 풀어줍니다.
                pinnedListOverlay.style.display = 'flex';
                pinnedListOverlay.classList.add('visible');
            }
            chatMessages && chatMessages.classList.add('chat-pane-hidden');
            chatInput && chatInput.classList.add('chat-pane-hidden');
            pinnedBarTop && pinnedBarTop.classList.add('chat-pane-hidden');
        }

        function hidePinnedScreen() {
            console.log('📂 SimpleClassChat: hidePinnedScreen 호출');
            if (pinnedListOverlay) {
                pinnedListOverlay.classList.remove('visible');
                // 다시 기본 상태로 돌려놓고 싶으면 display:none 처리
                pinnedListOverlay.style.display = 'none';
            }
            chatMessages && chatMessages.classList.remove('chat-pane-hidden');
            chatInput && chatInput.classList.remove('chat-pane-hidden');
            pinnedBarTop && pinnedBarTop.classList.remove('chat-pane-hidden');
        }

        if (btnPinnedList && pinnedListOverlay) {
            btnPinnedList.onclick = (e) => {
                console.log('📂 SimpleClassChat: 햄버거 버튼 클릭');
                e.stopPropagation();
                showPinnedScreen();
            };
        }
        if (btnClosePinnedList && pinnedListOverlay) {
            btnClosePinnedList.onclick = () => {
                hidePinnedScreen();
            };
        }
        if (pinnedListOverlay) {
            pinnedListOverlay.addEventListener('click', (e) => {
                if (e.target === pinnedListOverlay) hidePinnedScreen();
            });
        }
    }

    function scrollToMessage(messageId) {
        const container = document.getElementById('chatMessagesContainer');
        if (!container || !messageId) return;
        const el = container.querySelector(`[data-message-id="${messageId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlight-pin');
            setTimeout(() => el.classList.remove('highlight-pin'), 1500);
        }
    }

    // 강사용: 메시지 우클릭 메뉴
    function showMessageContextMenu(x, y, messageId, msg) {
        if (!state.isInstructor) return;

        closeAllContextMenus();

        const menu = document.createElement('div');
        menu.className = 'simple-msg-context-menu';

        const alreadyPinned = Object.values(state.pins || {}).some((p) => p.messageId === messageId);
        const label = alreadyPinned ? '고정 해제하기' : '메시지 고정하기';

        menu.innerHTML = `
            <div class="ctx-item" data-action="${alreadyPinned ? 'unpin' : 'pin'}">
                <div class="ctx-item-label">${label}</div>
            </div>
        `;

        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        console.log('📌 SimpleClassChat: 고정 메뉴 생성', { x, y, messageId });

        document.body.appendChild(menu);

        menu.querySelector('.ctx-item').addEventListener('click', () => {
            if (alreadyPinned) {
                unpinByMessageId(messageId);
            } else {
                pinMessage(messageId, msg.content || '');
            }
            closeAllContextMenus();
        });

        setTimeout(() => {
            document.addEventListener(
                'click',
                () => {
                    closeAllContextMenus();
                },
                { once: true }
            );
        }, 0);
    }

    function showUnpinMenu(x, y, pinId) {
        if (!state.isInstructor) return;
        closeAllContextMenus();

        const menu = document.createElement('div');
        menu.className = 'simple-msg-context-menu';
        menu.innerHTML = `
            <div class="ctx-item" data-action="unpin-list">
                <div class="ctx-item-label">고정 해제하기</div>
            </div>
        `;
        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        document.body.appendChild(menu);

        menu.querySelector('.ctx-item').addEventListener('click', () => {
            unpinById(pinId);
            closeAllContextMenus();
        });

        setTimeout(() => {
            document.addEventListener(
                'click',
                () => {
                    closeAllContextMenus();
                },
                { once: true }
            );
        }, 0);
    }

    function closeAllContextMenus() {
        document.querySelectorAll('.simple-msg-context-menu').forEach((el) => el.remove());
    }

    function pinMessage(messageId, content) {
        const db = state.db;
        const classId = state.classId;
        if (!db || !classId || !messageId) return;
        const ref = db.ref('pinned_messages/' + classId);
        ref
            .push({
                messageId,
                content,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
            })
            .catch((err) => {
                console.error('❌ SimpleClassChat: 고정 실패', err);
                alert('메시지 고정에 실패했습니다.');
            });
    }

    function unpinByMessageId(messageId) {
        const db = state.db;
        const classId = state.classId;
        if (!db || !classId || !messageId) return;
        const pins = state.pins || {};
        const updates = {};
        Object.entries(pins).forEach(([id, v]) => {
            if (v.messageId === messageId) {
                updates[id] = null;
            }
        });
        if (Object.keys(updates).length === 0) return;
        db.ref('pinned_messages/' + classId)
            .update(updates)
            .catch((err) => {
                console.error('❌ SimpleClassChat: 고정 해제 실패', err);
                alert('고정 해제에 실패했습니다.');
            });
    }

    function unpinById(pinId) {
        const db = state.db;
        const classId = state.classId;
        if (!db || !classId || !pinId) return;
        db.ref('pinned_messages/' + classId + '/' + pinId)
            .remove()
            .catch((err) => {
                console.error('❌ SimpleClassChat: 고정 해제 실패', err);
                alert('고정 해제에 실패했습니다.');
            });
    }

    return { init };
})();