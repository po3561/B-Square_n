// simple_class_chat.js - 클래스 전용 고도화 채팅 컨트롤러 (순수 D1 API 버전 - Restored & Completed)
window.SimpleClassChat = (function () {
    const state = {
        classId: null,
        userId: null,
        userProfile: null,
        isInstructor: false,
        lastMessageId: null,
        pollTimer: null,
        activeReplyTarget: null,
        editTargetId: null,
        pinnedMessages: []
    };

    function init(_, classId, userId, hasAccess, isInstructor) {
        state.classId = classId;
        state.userId = userId;
        state.isInstructor = !!isInstructor;
        state.userProfile = window.BSQ?.session?.user || { name: '익명', profile_image_url: '' };

        const unlockedArea = document.getElementById('chatUnlocked');
        const lockedOverlay = document.getElementById('chatLockedOverlay');

        if (!hasAccess || !userId) {
            if (unlockedArea) unlockedArea.style.display = 'none';
            if (lockedOverlay) {
                lockedOverlay.classList.remove('hidden');
                lockedOverlay.style.setProperty('display', 'flex', 'important');
            }
            return;
        }
        
        if (unlockedArea) unlockedArea.style.display = 'flex';
        if (lockedOverlay) {
            lockedOverlay.classList.add('hidden');
            lockedOverlay.style.setProperty('display', 'none', 'important');
        }

        // 기본 DOM 바인딩
        const msgInput = document.getElementById('msgInput');
        const btnSend = document.getElementById('btnSend');
        const messagesEl = document.getElementById('chatMessagesContainer');

        if (btnSend) btnSend.onclick = () => sendMessage();
        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            // 높이 자동 조절
            msgInput.oninput = () => {
                msgInput.style.height = 'auto';
                msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
            };
        }

        setupHeaderActions();
        setupInputActions();
        setupSearchActions();
        setupPinnedActions();
        setupGatheringActions();

        if (state.isInstructor) {
            const btnGathering = document.getElementById('btnGathering');
            if (btnGathering) btnGathering.style.display = 'flex';
        }

        if (messagesEl) {
            messagesEl.innerHTML = '';
            // 고정 메시지 초기 로드 및 폴링 시작
            fetchPinnedMessages();
            startPolling(messagesEl);
        }

        initResizer();
    }

    function setupHeaderActions() {
        // 테마 토글
        const btnThemeToggle = document.getElementById('btnThemeToggle');
        const themeIcon = document.getElementById('themeIcon');

        // 초기 테마 설정 반영 (채팅창에만 국소 적용)
        const chatWrapper = document.querySelector('.chat-tab-wrapper');
        const savedTheme = localStorage.getItem('bsq_theme_class') || 'light';

        if (chatWrapper) {
            chatWrapper.setAttribute('data-theme', savedTheme);
        }
        if (themeIcon) themeIcon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';

        if (btnThemeToggle) {
            btnThemeToggle.onclick = () => {
                const currentTheme = chatWrapper ? chatWrapper.getAttribute('data-theme') : (localStorage.getItem('bsq_theme_class') || 'light');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                if (chatWrapper) {
                    chatWrapper.setAttribute('data-theme', newTheme);
                }
                localStorage.setItem('bsq_theme_class', newTheme);
                if (themeIcon) themeIcon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
            };
        }

        // 정보 패널 (Layout Push 연동)
        const btnChatInfo = document.getElementById('btnChatInfo');
        const infoPanel = document.getElementById('commInfoPanel');
        const btnClosePanel = document.getElementById('btnClosePanel');
        if (btnChatInfo && infoPanel) {
            btnChatInfo.onclick = () => {
                infoPanel.classList.toggle('visible');
                // 푸시 모션 시 스크롤 하단 유지 보정
                setTimeout(() => {
                    const container = document.getElementById('chatMessagesContainer');
                    if (container) container.scrollTop = container.scrollHeight;
                }, 310);
            };
        }
        if (btnClosePanel && infoPanel) {
            btnClosePanel.onclick = () => infoPanel.classList.remove('visible');
        }
    }

    function setupInputActions() {
        // 이모지 피커
        const btnEmoji = document.getElementById('btnEmoji');
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiGrid = document.getElementById('emojiGrid');
        if (btnEmoji && emojiPicker && emojiGrid) {
            const emojis = ['😀', '😂', '🥰', '😍', '🤔', '😅', '😎', '🥳', '😢', '😡', '👍', '👎', '❤️', '🔥', '⭐', '🎉', '💯', '🙌', '👏', '🤝', '💪', '🙏', '✨', '💬', '📌', '📎'];
            emojiGrid.innerHTML = emojis.map(e => `<span class="emoji-item">${e}</span>`).join('');
            emojiGrid.querySelectorAll('.emoji-item').forEach(item => {
                item.onclick = () => {
                    const input = document.getElementById('msgInput');
                    input.value += item.textContent;
                    input.focus();
                    emojiPicker.style.display = 'none';
                };
            });
            btnEmoji.onclick = (e) => {
                e.stopPropagation();
                emojiPicker.style.display = emojiPicker.style.display === 'grid' ? 'none' : 'grid';
            };
            document.addEventListener('click', () => emojiPicker.style.display = 'none');
        }

        // 파일 첨부
        const btnAttach = document.getElementById('btnAttach');
        const fileInput = document.getElementById('fileInput');
        if (btnAttach && fileInput) {
            btnAttach.onclick = () => fileInput.click();
            fileInput.onchange = () => {
                if (fileInput.files.length > 0) {
                    alert(`${fileInput.files.length}개의 파일이 선택되었습니다. (업로드 기능 개발 중)`);
                }
            };
        }

        // 답장 취소
        const btnReplyCancel = document.getElementById('btnReplyCancel');
        if (btnReplyCancel) {
            btnReplyCancel.onclick = () => {
                state.activeReplyTarget = null;
                document.getElementById('replyPreview').style.display = 'none';
            };
        }
    }

    function setupSearchActions() {
        const btnSearch = document.getElementById('btnChatSearch');
        const searchBar = document.getElementById('chatSearchBar');
        const searchInput = document.getElementById('msgSearchInput');
        const searchClose = document.getElementById('msgSearchClose');

        if (!btnSearch || !searchBar) return;

        btnSearch.onclick = () => {
            searchBar.style.display = 'flex';
            searchInput.focus();
        };

        searchClose.onclick = () => {
            searchBar.style.display = 'none';
            searchInput.value = '';
            clearHighlights();
        };

        searchInput.oninput = () => {
            const query = searchInput.value.trim();
            if (query.length < 2) {
                clearHighlights();
                return;
            }
            highlightMessages(query);
        };
    }

    function setupPinnedActions() {
        const btnPinnedList = document.getElementById('btnPinnedList');
        const pinnedOverlay = document.getElementById('pinnedListOverlay');
        const btnClosePinned = document.getElementById('btnClosePinnedList');

        if (btnPinnedList && pinnedOverlay) {
            btnPinnedList.onclick = () => {
                pinnedOverlay.style.display = 'flex';
                renderPinnedList();
            };
        }
        if (btnClosePinned && pinnedOverlay) {
            btnClosePinned.onclick = () => pinnedOverlay.style.display = 'none';
        }
    }

    function clearHighlights() {
        document.querySelectorAll('.msg-bubble .highlight').forEach(el => {
            el.replaceWith(el.textContent);
        });
    }

    function highlightMessages(query) {
        clearHighlights();
        const bubbles = document.querySelectorAll('.msg-bubble');
        bubbles.forEach(bubble => {
            const text = bubble.textContent;
            if (text.includes(query)) {
                bubble.innerHTML = text.split(query).join(`<span class="highlight" style="background:rgba(255,255,0,0.3); color:inherit;">${query}</span>`);
            }
        });
    }

    function setupGatheringActions() {
        const btnGathering = document.getElementById('btnGathering');
        const modal = document.getElementById('gatheringModal');
        const btnClose = document.getElementById('btnGatheringClose');
        const btnCancel = document.getElementById('btnGatheringCancel');
        const btnSubmit = document.getElementById('btnGatheringSubmit');

        if (!modal) return;

        if (btnGathering) {
            btnGathering.onclick = () => {
                modal.style.display = 'flex';
                // 기본값: 지금부터 3일 후 오후 2시
                const d = new Date();
                d.setDate(d.getDate() + 3);
                d.setHours(14, 0, 0, 0);
                const tzoffset = (new Date()).getTimezoneOffset() * 60000;
                const localISOTime = (new Date(d - tzoffset)).toISOString().slice(0, 16);
                document.getElementById('gatheringAt').value = localISOTime;

                // 마감일: 모임 1일 전 (UI에서는 숨김 처리됨)
                const d2 = new Date(d);
                d2.setDate(d2.getDate() - 1);
                const localISOTime2 = (new Date(d2 - tzoffset)).toISOString().slice(0, 16);
                const deadlineInput = document.getElementById('gatheringDeadline');
                if (deadlineInput) deadlineInput.value = localISOTime2;
            };
        }

        const closeModal = () => modal.style.display = 'none';
        if (btnClose) btnClose.onclick = closeModal;
        if (btnCancel) btnCancel.onclick = closeModal;

        const btnInfo = document.getElementById('btnChatInfo');
        if (btnInfo) {
            btnInfo.onclick = () => {
                const panel = document.getElementById('commInfoPanel');
                if (panel) {
                    const isVisible = panel.classList.toggle('visible');
                    if (isVisible) {
                        renderInfoPanel();
                    }
                }
            };
        }
        
        const btnClosePanel = document.getElementById('btnClosePanel');
        if (btnClosePanel) {
            btnClosePanel.onclick = () => {
                document.getElementById('commInfoPanel')?.classList.remove('visible');
            };
        }

        if (btnSubmit) {
            btnSubmit.onclick = async () => {
                const titleEl = document.getElementById('gatheringTitle');
                const atEl = document.getElementById('gatheringAt');
                const locEl = document.getElementById('gatheringLocation');
                const capEl = document.getElementById('gatheringCapacity');
                const descEl = document.getElementById('gatheringDesc');

                if (!titleEl || !atEl || !locEl || !capEl) return;

                const title = titleEl.value.trim();
                const at = atEl.value;
                const location = locEl.value.trim();
                const capacity = parseInt(capEl.value, 10);
                const desc = descEl ? descEl.value.trim() : '';

                if (!title || !at || !capacity || !location) {
                    alert('필수 항목(제목, 일시, 장소, 정원)을 모두 입력해주세요.');
                    return;
                }

                // 모임 일시 객체화
                const gAt = new Date(at);
                const now = new Date();

                // 3일 전 생성 제한 제거 (사용자 요청)
                // const diffDays = (gAt - now) / (1000 * 60 * 60 * 24);
                // if (diffDays < 3) {
                //     alert('모임 생성은 모임일 최소 3일 전까지 가능합니다.');
                //     return;
                // }

                // 마감일 자동 계산: 모임 일시 1일(24시간) 전
                const gDeadline = new Date(gAt.getTime() - (24 * 60 * 60 * 1000));
                const deadlineISO = gDeadline.toISOString();

                btnSubmit.disabled = true;
                btnSubmit.textContent = '생성 중...';

                try {
                    // API 호출
                    const res = await window.BSQ.api('/api/gatherings', {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'create',
                            class_id: state.classId,
                            instructor_id: state.userId,
                            title: title,
                            description: desc,
                            location: location,
                            gathering_at: gAt.toISOString(),
                            deadline_at: deadlineISO,
                            capacity_max: capacity
                        })
                    });

                    if (res.success && res.data) {
                        const gatheringId = res.data.id;

                        // 채팅 전송 데이터 구성
                        const msgData = {
                            gathering_id: gatheringId,
                            title: title,
                            location: location,
                            gathering_at: gAt.toISOString(),
                            deadline_at: deadlineISO,
                            capacity_max: capacity
                        };

                        await window.BSQ.api('/api/chat', {
                            method: 'POST',
                            body: JSON.stringify({
                                class_id: state.classId,
                                user_id: state.userId,
                                user_name: state.userProfile?.name,
                                user_avatar: state.userProfile?.profile_image_url,
                                message: JSON.stringify(msgData),
                                type: 'gathering'
                            })
                        });

                        // 입력 필드 초기화
                        document.getElementById('gatheringTitle').value = '';
                        document.getElementById('gatheringLocation').value = '';
                        document.getElementById('gatheringDesc').value = '';
                        
                        // 즉시 채팅 갱신 및 정보 패널 업데이트
                        const messagesEl = document.getElementById('chatMessagesContainer');
                        if (messagesEl) fetchChats(messagesEl, false);
                        
                        const panel = document.getElementById('commInfoPanel');
                        if (panel && panel.classList.contains('visible')) {
                            renderInfoPanel();
                        }

                        if (typeof showToast === 'function') {
                            showToast('success', '모임 생성 완료', '모임 카드가 채팅창에 전송되었습니다.');
                        } else {
                            alert('모임 카드가 채팅창에 전송되었습니다.');
                        }
                        closeModal();
                    } else {
                        alert('생성 실패: ' + (res.error || '알 수 없는 오류'));
                    }
                } catch (e) {
                    alert('모임 생성 중 오류가 발생했습니다.');
                } finally {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = '모임 생성 및 전송';
                }
            };
        }
    }

    async function fetchChats(container, isInit = false) {
        let url = `/api/chat?class_id=${state.classId}&limit=${isInit ? 50 : 20}`;
        if (state.lastMessageId && !isInit) url += `&after=${state.lastMessageId}`;

        try {
            const res = await window.BSQ.api(url);
            if (res.success && res.data && res.data.length > 0) {
                res.data.forEach(msg => {
                    appendMessage(container, msg);
                    state.lastMessageId = msg.id;
                });
                if (isInit) container.scrollTop = container.scrollHeight;
            }
        } catch (e) { }
    }

    function startPolling(container) {
        if (state.pollTimer) clearInterval(state.pollTimer);
        fetchChats(container, true).then(() => {
            state.pollTimer = setInterval(() => fetchChats(container, false), 2000);
        });
    }

    async function sendMessage() {
        const input = document.getElementById('msgInput');
        const text = input.value.trim();
        if (!text) return;

        const btnSend = document.getElementById('btnSend');
        btnSend.disabled = true;

        const replyToData = state.activeReplyTarget ? {
            id: state.activeReplyTarget.id,
            user_name: state.activeReplyTarget.user_name || '익명',
            message: state.activeReplyTarget.message
        } : null;

        if (state.editTargetId) {
            try {
                await window.BSQ.api(`/api/chat/${state.editTargetId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ message: text })
                });
                state.editTargetId = null;
                input.value = '';
                input.style.border = '';
            } catch (e) { }
        } else {
            try {
                await window.BSQ.api('/api/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        class_id: state.classId,
                        user_id: state.userId,
                        user_name: state.userProfile.name,
                        message: text,
                        reply_to: state.activeReplyTarget?.id || null,
                        reply_data: replyToData // 답장 메타데이터 함께 전송
                    })
                });
                input.value = '';
                if (state.activeReplyTarget) {
                    state.activeReplyTarget = null;
                    document.getElementById('replyPreview').style.display = 'none';
                }
            } catch (e) { }
        }
        btnSend.disabled = false;
        input.style.height = 'auto';
    }

    function appendMessage(container, msg) {
        if (container.querySelector(`[data-message-id="${msg.id}"]`)) return;

        const isMine = String(msg.user_id).trim() === String(state.userId).trim();

        const row = document.createElement('div');
        row.className = 'chat-msg' + (isMine ? ' mine' : '');
        row.dataset.messageId = msg.id;

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.user_name || 'U')}&background=random&color=fff`;
        avatar.style.backgroundImage = `url(${msg.user_avatar || defaultAvatar})`;

        const wrapper = document.createElement('div');
        wrapper.className = 'msg-wrapper';

        if (!isMine) {
            const sender = document.createElement('div');
            sender.className = 'msg-sender-row';
            sender.style = "font-size:0.75rem; color:var(--text-secondary); margin-bottom:2px; font-weight:700;";
            sender.textContent = msg.user_name || '익명';
            wrapper.appendChild(sender);
        }

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';

        // [답장 참조 블록 추가]
        if (msg.reply_data) {
            const replyRef = document.createElement('div');
            replyRef.className = 'msg-reply-ref';

            const refContent = document.createElement('div');
            refContent.className = 'reply-ref-content';

            const refName = document.createElement('div');
            refName.className = 'reply-ref-name';
            refName.textContent = msg.reply_data.user_name || '익명';

            const refText = document.createElement('div');
            refText.className = 'reply-ref-text';
            refText.textContent = msg.reply_data.message;

            refContent.appendChild(refName);
            refContent.appendChild(refText);
            replyRef.appendChild(refContent);

            // 클릭 시 해당 메시지로 스크롤 이동
            replyRef.onclick = () => {
                const target = container.querySelector(`[data-message-id="${msg.reply_data.id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.style.transition = 'background 0.5s';
                    const originalBg = target.style.background;
                    target.style.background = 'rgba(0, 122, 255, 0.2)';
                    setTimeout(() => target.style.background = originalBg, 1500);
                }
            };

            bubble.appendChild(replyRef);
        }

        if (msg.type === 'gathering') {
            try {
                const gData = JSON.parse(msg.message);
                const gCard = document.createElement('div');
                gCard.className = 'msg-gathering-card';
                gCard.dataset.gatheringId = gData.gathering_id;
                
                // 프리미엄 디자인 골격 주입
                gCard.innerHTML = `
                    <div class="gathering-title-row">
                        <div class="gathering-main-icon"><i class="fas fa-users"></i></div>
                        <div class="gathering-title-text">${gData.title || '새로운 모임'}</div>
                    </div>

                    <div class="gathering-info-box">
                        <div class="gathering-info-line">
                            <i class="fas fa-map-marker-alt"></i>
                            <span class="gathering-location">${gData.location || '장소 미지정'}</span>
                        </div>
                        <div class="gathering-info-line">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${new Date(gData.gathering_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>

                    <div class="gathering-timer-v2" data-deadline="${gData.deadline_at}">
                        <div class="timer-label">모집 마감 카운트다운</div>
                        <div class="timer-value">계산 중...</div>
                    </div>

                    <div class="gathering-stats-v2">
                        <div class="stats-label">
                            <span>신청 현황</span>
                            <span class="stats-count"><b class="g-current-participants">0</b> / ${gData.capacity_max}명</span>
                        </div>
                        <div class="stats-progress-v2">
                            <div class="progress-bar-v2" style="width: 0%"></div>
                        </div>
                    </div>

                    <div class="gathering-actions-v2">
                        <!-- 동적 바인딩 (참여/취소/마감) -->
                    </div>
                `;
                bubble.appendChild(gCard);
                initGatheringCard(gCard, gData.gathering_id);
            } catch (e) {
                bubble.appendChild(document.createTextNode('[잘못된 모임 데이터]'));
            }
        } else {
            bubble.appendChild(document.createTextNode(msg.message));
        }

        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.textContent = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        row.appendChild(avatar);
        row.appendChild(wrapper);

        row.oncontextmenu = (e) => {
            e.preventDefault();
            showContextMenu(e, msg, row);
        };

        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
    }

    function initGatheringCard(cardEl, gatheringId) {
        const updateUI = async () => {
            try {
                const res = await window.BSQ.api(`/api/gatherings?action=detail&gathering_id=${gatheringId}`);
                if (res.success && res.data) {
                    const gather = res.data;
                    const participantsSpan = cardEl.querySelector('.g-current-participants');
                    if (participantsSpan) participantsSpan.textContent = gather.current_participants || 0;

                    const bar = cardEl.querySelector('.progress-bar-v2');
                    if (bar && gather.capacity_max > 0) {
                        const pct = Math.min(((gather.current_participants || 0) / gather.capacity_max) * 100, 100);
                        bar.style.width = pct + '%';
                    }

                    const actionsBox = cardEl.querySelector('.gathering-actions-v2');
                    if (!actionsBox) return;

                    const now = new Date();
                    const deadlineAtStr = cardEl.querySelector('.gathering-timer-v2')?.dataset.deadline;
                    const deadlineAt = deadlineAtStr ? new Date(deadlineAtStr) : null;
                    const isPassed = deadlineAt && now.getTime() >= deadlineAt.getTime();

                    if (gather.status === 'closed' || isPassed) {
                        actionsBox.innerHTML = '<button class="btn-gathering-action-premium" style="background:#888; color:#fff;" disabled>모집이 마감된 모임입니다</button>';
                        return;
                    }

                    if (state.isInstructor) {
                        actionsBox.innerHTML = '<button class="btn-gathering-action-premium btn-close-v2"><i class="fas fa-lock"></i> 모집 조기 마감하기</button>';
                        actionsBox.querySelector('.btn-close-v2').onclick = async () => {
                            if (confirm('이 모임의 모집을 조기 마감하시겠습니까?')) {
                                await window.BSQ.api('/api/gatherings', { method: 'POST', body: JSON.stringify({ action: 'close', gathering_id: gatheringId }) });
                                updateUI();
                            }
                        };
                        return;
                    }

                    const partRes = await window.BSQ.api(`/api/gatherings?action=participants&gathering_id=${gatheringId}`);
                    const isParticipant = partRes.success && partRes.data.some(p => String(p.user_id) === String(state.userId));

                    if (isParticipant) {
                        actionsBox.innerHTML = '<button class="btn-gathering-action-premium btn-leave-v2"><i class="fas fa-user-minus"></i> 모임 불참하기 (취소)</button>';
                        actionsBox.querySelector('.btn-leave-v2').onclick = async () => {
                            if (confirm('모임 참여를 취소하시겠습니까? (수강권이 반환될 수 있습니다)')) {
                                await window.BSQ.api('/api/gatherings', { method: 'POST', body: JSON.stringify({ action: 'leave', gathering_id: gatheringId, user_id: state.userId }) });
                                updateUI();
                            }
                        };
                    } else {
                        if (gather.current_participants >= gather.capacity_max) {
                            actionsBox.innerHTML = '<button class="btn-gathering-action-premium" style="background:#555;" disabled>정원이 가득 찼습니다</button>';
                        } else {
                            actionsBox.innerHTML = '<button class="btn-gathering-action-premium btn-join-v2"><i class="fas fa-check-circle"></i> 클래스 모임 참여하기</button>';
                            actionsBox.querySelector('.btn-join-v2').onclick = async () => {
                                if (confirm('모임에 참여하시겠습니까? 횟수권인 경우 수강권이 1회 차감됩니다.')) {
                                    const joinRes = await window.BSQ.api('/api/gatherings', { method: 'POST', body: JSON.stringify({ action: 'join', gathering_id: gatheringId, user_id: state.userId }) });
                                    if (joinRes.success) {
                                        updateUI();
                                    } else {
                                        alert('참여 실패: ' + (joinRes.error || '알 수 없는 오류'));
                                    }
                                }
                            };
                        }
                    }
                }
            } catch (e) { }
        };
        updateUI();
    }

    function updateCountdowns() {
        const timers = document.querySelectorAll('.gathering-timer-v2');
        timers.forEach(timer => {
            const deadlineAt = timer.dataset.deadline;
            if (!deadlineAt) return;

            const deadline = new Date(deadlineAt);
            const now = new Date();
            const diff = deadline - now;

            const timerValueEl = timer.querySelector('.timer-value');
            if (!timerValueEl) return;

            if (diff <= 0) {
                timerValueEl.textContent = '모집 마감';
                timer.style.opacity = '0.7';
                return;
            }

            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            const s = Math.floor((diff / 1000) % 60);

            const timeStr = d > 0 ? `${d}일 ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                : `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

            timerValueEl.textContent = timeStr;

            if (diff < (1000 * 60 * 60 * 2)) { // 2시간 미만 시 강조
                timerValueEl.style.color = '#FF3B30';
            }
        });
    }

    // 1초마다 카운트다운 갱신
    setInterval(updateCountdowns, 1000);

    function showContextMenu(e, msg, row) {
        const existing = document.getElementById('chatContextMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'chatContextMenu';
        menu.className = 'msg-context-menu';

        // 현재 테마 동적 적용
        const currentTheme = document.querySelector('.chat-tab-wrapper')?.getAttribute('data-theme') || localStorage.getItem('bsq_theme_class') || 'light';
        menu.setAttribute('data-theme', currentTheme);

        // 위치 설정은 JS로 유지 (fixed placement)
        menu.style.position = 'fixed';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        // 리액션 바
        const emojiBar = document.createElement('div');
        emojiBar.className = 'msg-emoji-reactions-bar';
        const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
        emojiBar.innerHTML = reactionEmojis.map(e => `<span class="reaction-item">${e}</span>`).join('');
        emojiBar.querySelectorAll('.reaction-item').forEach(item => {
            item.onclick = () => {
                addReaction(msg.id, item.textContent);
                menu.remove();
            };
        });
        menu.appendChild(emojiBar);

        const items = [
            { icon: 'fa-solid fa-reply', text: '답장', action: () => setReply(msg) },
            {
                icon: 'fa-regular fa-copy', text: '복사', action: () => {
                    navigator.clipboard.writeText(msg.message);
                    if (typeof showToast === 'function') showToast('success', '복사 완료', '메시지가 클립보드에 복사되었습니다.');
                }
            },
            { 
                icon: 'fa-solid fa-thumbtack', 
                text: msg.is_pinned ? '고정 해제' : '고정', 
                action: () => msg.is_pinned ? unpinMessage(msg.id) : pinMessage(msg), 
                condition: () => state.isInstructor 
            },
            { icon: 'fa-regular fa-pen-to-square', text: '수정', action: () => setEdit(msg), condition: () => String(msg.user_id) === String(state.userId) || state.isInstructor },
            { icon: 'fa-regular fa-trash-can', text: '삭제', action: () => deleteMessage(msg.id), danger: true, condition: () => String(msg.user_id) === String(state.userId) || state.isInstructor }
        ];

        items.forEach(item => {
            if (item.condition && !item.condition()) return;

            const div = document.createElement('div');
            div.className = `ctx-item${item.danger ? ' danger' : ''}`;
            div.innerHTML = `<i class="${item.icon}"></i><span>${item.text}</span>`;
            div.onclick = () => { item.action(); menu.remove(); };
            menu.appendChild(div);
        });

        document.body.appendChild(menu);

        // 화면 경계 밖으로 나가는지 체크 및 보정
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
        }

        setTimeout(() => {
            const closeMenu = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    function setReply(msg) {
        state.activeReplyTarget = msg;
        const preview = document.getElementById('replyPreview');
        const targetName = document.getElementById('replyTargetName');
        const targetText = document.getElementById('replyTargetText');

        if (preview && targetName && targetText) {
            targetName.textContent = `${msg.user_name || '익명'}님에게 답장`;
            targetText.textContent = msg.message;
            preview.style.display = 'flex';
            document.getElementById('msgInput').focus();
        }
    }

    function setEdit(msg) {
        state.editTargetId = msg.id;
        const input = document.getElementById('msgInput');
        input.value = msg.message;
        input.style.border = '1px solid var(--accent-color)';
        input.focus();
    }

    async function deleteMessage(id) {
        if (!confirm('삭제하시겠습니까?')) return;
        try {
            await window.BSQ.api(`/api/chat/${id}`, { method: 'DELETE' });
            document.querySelector(`[data-message-id="${id}"]`)?.remove();
        } catch (e) { }
    }

    async function pinMessage(msg) {
        if (state.pinnedMessages.find(p => p.id === msg.id)) return;
        
        try {
            const res = await window.BSQ.api('/api/chat', {
                method: 'PATCH',
                body: JSON.stringify({ id: msg.id, is_pinned: true })
            });
            if (res.success) {
                state.pinnedMessages.push(msg);
                updatePinnedBar();
                if (typeof showToast === 'function') showToast('info', '메시지 고정', '메시지가 데이터베이스에 고정되었습니다.');
            }
        } catch (e) {
            console.error('Pin failed:', e);
        }
    }

    async function unpinMessage(msgId) {
        try {
            const res = await window.BSQ.api('/api/chat', {
                method: 'PATCH',
                body: JSON.stringify({ id: msgId, is_pinned: false })
            });
            if (res.success) {
                state.pinnedMessages = state.pinnedMessages.filter(p => p.id !== msgId);
                updatePinnedBar();
                if (typeof showToast === 'function') showToast('info', '고정 해제', '메시지 고정이 해제되었습니다.');
            }
        } catch (e) { }
    }

    async function fetchPinnedMessages() {
        try {
            const res = await window.BSQ.api(`/api/chat?class_id=${state.classId}&pinned_only=true`);
            if (res.success && res.data) {
                state.pinnedMessages = res.data;
                updatePinnedBar();
            }
        } catch (e) { }
    }

    function updatePinnedBar() {
        const bar = document.getElementById('pinnedMsgBar');
        const text = document.getElementById('pinnedMsgText');
        if (!bar || !text) return;

        if (state.pinnedMessages.length > 0) {
            bar.style.display = 'flex';
            // 가장 최신 고정 메시지 표시
            const last = state.pinnedMessages[0]; 
            text.textContent = last.message;
            
            // 클릭 시 해당 메시지로 스크롤
            bar.onclick = () => {
                const target = document.querySelector(`[data-message-id="${last.id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('highlight-pin');
                    setTimeout(() => target.classList.remove('highlight-pin'), 2000);
                } else {
                    // DOM에 없는 경우 (과거 메시지)
                    if (typeof showToast === 'function') showToast('info', '안내', '해당 메시지는 이전 대화 내용에 있습니다.');
                }
            };

            // 강사인 경우 우클릭으로 고정 해제 가능 안내 (또는 작은 X 버튼 추가 가능)
            // 여기서는 단순함을 위해 기존 로직 유지
        } else {
            bar.style.display = 'none';
        }
    }

    function renderPinnedList() {
        const body = document.getElementById('pinnedListBody');
        const countText = document.getElementById('pinnedListTitle');
        if (!body) return;

        countText.textContent = `${state.pinnedMessages.length}개의 고정된 메시지`;
        body.innerHTML = state.pinnedMessages.map(msg => `
            <div class="pinned-item" style="padding:15px; border-bottom:1px solid var(--border-color); cursor:pointer;">
                <div style="font-size:0.75rem; color:var(--accent-color); font-weight:700;">${msg.user_name}</div>
                <div style="font-size:0.9rem; color:var(--text-primary); margin-top:4px;">${msg.message}</div>
            </div>
        `).join('');
    }

    function addReaction(msgId, emoji) {
        // DB 연동은 추후 확장, 현재는 UI 피드백만
        if (typeof showToast === 'function') showToast('success', '리액션', `${emoji} 반응을 남겼습니다.`);
    }

    function initResizer() {
        const resizer = document.getElementById('chatResizer');
        const wrapper = document.querySelector('.chat-tab-wrapper');
        if (!resizer || !wrapper) return;

        // 저장된 높이값 불러오기
        const savedHeight = localStorage.getItem('bsq_chat_height');
        if (savedHeight) {
            wrapper.style.setProperty('height', `${savedHeight}px`, 'important');
        }

        let isResizing = false;
        let lastY = 0;

        resizer.onmousedown = (e) => {
            isResizing = true;
            lastY = e.clientY;
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        };

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - lastY;
            const currentHeight = wrapper.offsetHeight;
            let newHeight = currentHeight + deltaY;

            // 최소/최대 제약 (600px ~ 5000px)
            if (newHeight < 600) newHeight = 600;
            if (newHeight > 11000) newHeight = 11000;

            wrapper.style.setProperty('height', `${newHeight}px`, 'important');
            lastY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                // 높이 저장
                localStorage.setItem('bsq_chat_height', wrapper.offsetHeight);
            }
        });
    }

    async function renderInfoPanel() {
        const panelBody = document.getElementById('infoPanelBody');
        const panelTitle = document.getElementById('infoPanelTitle');
        if (!panelBody) return;

        panelBody.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">데이터 로딩 중...</div>';

        try {
            // 1. 모임 현황 가져오기
            const gatherRes = await window.BSQ.api(`/api/gatherings?class_id=${state.classId}`);
            let gatheringsHtml = '';
            
            if (gatherRes.success && gatherRes.data && gatherRes.data.length > 0) {
                gatheringsHtml = `
                    <div class="info-section">
                        <h4 style="color:var(--accent-color); font-size:1rem; margin-bottom:12px;">🗓️ 진행 예정 모임</h4>
                        ${gatherRes.data.map(g => `
                            <div class="gathering-mini-item" style="background:rgba(255,255,255,0.05); border-radius:12px; padding:12px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.05);">
                                <div style="font-weight:700; color:#fff; margin-bottom:4px;">${g.title}</div>
                                <div style="font-size:0.85rem; color:#aaa;"><i class="fas fa-map-marker-alt" style="width:14px;"></i> ${g.location || '장소 미정'}</div>
                                <div style="font-size:0.85rem; color:#aaa;"><i class="fas fa-clock" style="width:14px;"></i> ${new Date(g.gathering_at).toLocaleString('ko-KR')}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                gatheringsHtml = `
                    <div class="info-section" style="padding:20px; text-align:center; color:#666;">
                        진행 중인 모임이 없습니다.
                    </div>
                `;
            }

            panelBody.innerHTML = `
                ${gatheringsHtml}
                <div class="info-section">
                    <h4 style="color:#fff; font-size:1rem; margin-bottom:12px; margin-top:20px;">👥 클래스 멤버</h4>
                    <div id="panelMemberList" style="display:flex; flex-direction:column; gap:8px;">
                        <p style="color:#666; font-size:0.9rem;">멤버 정보를 불러오고 있습니다...</p>
                    </div>
                </div>
            `;
            
            // 추가 정보(멤버 등) 비동기 로드
            updatePanelMemberList();

        } catch (err) {
            panelBody.innerHTML = `<div style="padding:20px; color:#ff4d4d;">오류 발생: ${err.message}</div>`;
        }
    }

    async function updatePanelMemberList() {
        const listEl = document.getElementById('panelMemberList');
        if (!listEl) return;

        try {
            const res = await window.BSQ.api(`/api/enrollments?class_id=${state.classId}`);
            if (res.success && res.data) {
                listEl.innerHTML = res.data.map(m => `
                    <div style="display:flex; align-items:center; gap:10px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px;">
                        <img src="${m.profile_image_url || '/api/placeholder/40/40'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1;">
                            <div style="font-size:0.9rem; color:#fff; font-weight:600;">${m.nickname || m.name} ${m.role === 'instructor' ? '👑' : ''}</div>
                            ${state.isInstructor && m.phone ? `<div style="font-size:0.75rem; color:#888;">${m.phone}</div>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            listEl.innerHTML = '<p style="color:#666; font-size:0.8rem;">멤버 정보를 가져올 수 없습니다.</p>';
        }
    }

    return { init };
})();
