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

    function isChatTabVisible() {
        const chatTabBtn = document.querySelector('[data-target="tabChat"]');
        const chatTab = document.getElementById('tabChat');
        return !!(chatTabBtn?.classList.contains('active') && chatTab?.classList.contains('active') && document.visibilityState === 'visible');
    }

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

        // 달력(모집카드 생성) 아이콘: 강사만 보이게
        const btnGathering = document.getElementById('btnGathering');
        if (btnGathering) {
            btnGathering.style.display = state.isInstructor ? 'flex' : 'none';
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
            btnChatInfo.onclick = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                infoPanel.classList.toggle('visible');
                infoPanel.style.display = infoPanel.classList.contains('visible') ? 'flex' : '';
                // 푸시 모션 시 스크롤 하단 유지 보정
                setTimeout(() => {
                    const container = document.getElementById('chatMessagesContainer');
                    if (container) container.scrollTop = container.scrollHeight;
                }, 310);
            };
        }
        if (btnClosePanel && infoPanel) {
            btnClosePanel.onclick = () => {
                infoPanel.classList.remove('visible');
                infoPanel.style.display = '';
            };
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
            btnInfo.onclick = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                const panel = document.getElementById('commInfoPanel');
                if (panel) {
                    const isVisible = panel.classList.toggle('visible');
                    panel.style.display = isVisible ? 'flex' : '';
                    if (isVisible) {
                        renderInfoPanel();
                    }
                }
            };
        }
        
        const btnClosePanel = document.getElementById('btnClosePanel');
        if (btnClosePanel) {
            btnClosePanel.onclick = () => {
                const panel = document.getElementById('commInfoPanel');
                if (panel) {
                    panel.classList.remove('visible');
                    panel.style.display = '';
                }
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
        if (!isInit && !isChatTabVisible()) return;

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
        const defaultAvatar = '/assets/default-avatar.svg';
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

                    <a href="https://map.naver.com/v5/search/${encodeURIComponent(gData.location || '')}" target="_blank" class="gathering-map-btn" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px;border-radius:8px;background:rgba(0,122,255,0.1);color:#007AFF;text-decoration:none;font-weight:700;font-size:0.85rem;border:1px solid rgba(0,122,255,0.15);margin-bottom:8px;transition:all 0.2s;">
                        <i class="fas fa-map-location-dot"></i> 지도 바로가기
                    </a>

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
                        <!-- 동적 바인딩 (참여/취소/마감/불참) -->
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
                        actionsBox.innerHTML = `
                            <button class="btn-gathering-action-premium btn-close-v2" style="margin-bottom:6px;"><i class="fas fa-lock"></i> 모집 조기 마감하기</button>
                            <button class="btn-gathering-action-premium btn-absence-v2" style="background:rgba(255,149,0,0.15);color:#FF9500;border:1px solid rgba(255,149,0,0.25);"><i class="fas fa-user-slash"></i> 불참</button>
                        `;
                        actionsBox.querySelector('.btn-close-v2').onclick = async () => {
                            if (confirm('이 모임의 모집을 조기 마감하시겠습니까?')) {
                                await window.BSQ.api('/api/gatherings', { method: 'POST', body: JSON.stringify({ action: 'close', gathering_id: gatheringId }) });
                                updateUI();
                            }
                        };
                        actionsBox.querySelector('.btn-absence-v2').onclick = async () => {
                            if (confirm('이 모임에 불참하시겠습니까?')) {
                                await window.BSQ.api('/api/gatherings', { method: 'POST', body: JSON.stringify({ action: 'leave', gathering_id: gatheringId, user_id: state.userId }) });
                                if (typeof showToast === 'function') showToast('info', '모임 불참', '불참 처리되었습니다.');
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

    async function addReaction(msgId, emoji) {
        try {
            const res = await window.BSQ.api(`/api/chat/${encodeURIComponent(msgId)}/reaction`, {
                method: 'POST',
                body: JSON.stringify({ emoji })
            });

            if (res?.success) {
                const messagesEl = document.getElementById('chatMessagesContainer');
                if (messagesEl) {
                    messagesEl.innerHTML = '';
                    state.lastMessageId = null;
                    fetchChats(messagesEl, true);
                }
                if (typeof showToast === 'function') showToast('success', '리액션', `${emoji} 반응이 적용되었습니다.`);
            } else if (typeof showToast === 'function') {
                showToast('error', '리액션 실패', res?.error || '반응 처리에 실패했습니다.');
            }
        } catch (error) {
            console.error('addReaction failed:', error);
            if (typeof showToast === 'function') showToast('error', '리액션 실패', '반응 처리 중 오류가 발생했습니다.');
        }
    }

    function initResizer() {
        const resizer = document.getElementById('chatResizer');
        const wrapper = document.querySelector('.chat-tab-wrapper');
        if (!resizer || !wrapper) return;

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
            if (newHeight < 600) newHeight = 600;
            if (newHeight > 11000) newHeight = 11000;
            wrapper.style.setProperty('height', `${newHeight}px`, 'important');
            lastY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                localStorage.setItem('bsq_chat_height', wrapper.offsetHeight);
            }
        });
    }

    async function renderInfoPanel() {
        const panelBody = document.getElementById('infoPanelBody');
        const panelTitle = document.getElementById('infoPanelTitle');
        if (!panelBody) return;
        if (panelTitle) panelTitle.textContent = '채널 정보';

        panelBody.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:10px;display:block;"></i> 로딩 중...</div>';

        try {
            const viewMode = state.isInstructor ? 'instructor' : 'student';
            let members = [], total_members = 0, pass_stats = {}, class_info = {};
            let gatherings = [];

            try {
                const memberRes = await window.BSQ.api(`/api/classes/members?class_id=${state.classId}&view=${viewMode}`);
                if (memberRes?.success && memberRes.data) {
                    members = memberRes.data.members || [];
                    total_members = memberRes.data.total_members || 0;
                    pass_stats = memberRes.data.pass_stats || {};
                    class_info = memberRes.data.class_info || {};
                }
            } catch (e) { console.warn('[InfoPanel] Members API failed:', e); }

            try {
                const gatherRes = await window.BSQ.api(`/api/gatherings?class_id=${state.classId}`);
                if (gatherRes?.success && gatherRes.data) gatherings = gatherRes.data;
            } catch (e) { console.warn('[InfoPanel] Gatherings API failed:', e); }

            const category = class_info.category || '카테고리';

            // ===== 1. 헤더 =====
            const headerHtml = `
                <div class="ip-section ip-header-section">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="width:10px;height:10px;border-radius:50%;background:#34C759;display:inline-block;box-shadow:0 0 6px rgba(52,199,89,0.5);"></span>
                        <span style="font-weight:800; font-size:0.95rem;">클래스 참여자 / 총 ${total_members}명</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding-left:18px;">
                        <span class="ip-sub-text">${category}</span>
                        <span class="ip-sub-text"><i class="fa-solid fa-circle" style="color:#34C759;font-size:0.4rem;vertical-align:middle;margin-right:3px;"></i>현재 ${total_members}명</span>
                    </div>
                </div>
            `;

            // ===== 2. 멤버 리스트 =====
            const dotColors = ['#34C759','#5AC8FA','#AF52DE','#FF9500','#FF2D55','#5856D6','#FF3B30','#007AFF'];
            let memberListHtml = '';
            if (members.length > 0) {
                memberListHtml = '<div class="ip-section" style="padding:0;">';
                memberListHtml += members.map((m, idx) => {
                    const dc = dotColors[idx % dotColors.length];
                    const nickname = m.nickname || '사용자';
                    const isInstr = m.role === 'instructor';
                    const isSub = m.role === 'sub_instructor';
                    const roleBadge = isInstr ? '<span class="ip-role-badge ip-role-instructor"><i class="fa-solid fa-crown"></i> 강사</span>'
                                   : isSub   ? '<span class="ip-role-badge ip-role-sub"><i class="fa-solid fa-chalkboard-user"></i> 서브강사</span>'
                                   :           '<span class="ip-role-badge ip-role-student"><i class="fa-solid fa-user"></i> 수강생</span>';

                    const avatarUrl = m.profile_image_url || '/assets/default-avatar.svg';

                    let detailHtml = '';
                    if (state.isInstructor && (m.name || m.phone)) {
                        detailHtml = `<div class="ip-member-detail">${m.name || ''} ${m.phone ? '· ' + m.phone : ''}</div>`;
                    }

                    const passHtml = (state.isInstructor && m.remaining_passes !== undefined) ? `
                        <div class="ip-pass-badge">
                            <i class="fa-solid fa-ticket"></i> ${m.remaining_passes ?? 0}
                        </div>
                    ` : '';

                    const isSelf = String(m.user_id) === String(state.userId);
                    const friendBtnHtml = isSelf ? '' : `
                        <button class="ip-btn-friend" data-target-uid="${m.user_id}" data-target-name="${nickname}" title="친구 추가">
                            <i class="fa-solid fa-user-plus"></i>
                        </button>
                    `;

                    return `
                        <div class="ip-member-card">
                            <div class="ip-member-avatar" style="background-image:url('${avatarUrl}');">
                                <span class="ip-online-dot" style="background:${dc};"></span>
                            </div>
                            <div class="ip-member-info">
                                <div class="ip-member-name">${nickname} ${roleBadge}</div>
                                ${detailHtml}
                            </div>
                            ${passHtml}
                            ${friendBtnHtml}
                        </div>
                    `;
                }).join('');
                memberListHtml += '</div>';
            } else {
                memberListHtml = '<div class="ip-section" style="text-align:center; padding:20px;"><span class="ip-sub-text">등록된 수강생이 없습니다.</span></div>';
            }

            // ===== 3. 모임 정보 =====
            let gatheringHtml = '';
            if (gatherings.length > 0) {
                gatheringHtml = gatherings.map(g => {
                    const gDate = new Date(g.gathering_at);
                    const dateStr = `${gDate.getFullYear()}년 ${gDate.getMonth()+1}월 ${gDate.getDate()}일 / ${String(gDate.getHours()).padStart(2,'0')}:${String(gDate.getMinutes()).padStart(2,'0')}`;
                    const location = g.location || '장소 미정';
                    const mapUrl = `https://map.kakao.com/?q=${encodeURIComponent(location)}`;
                    const now = new Date();
                    const isClosed = g.status === 'closed' || (g.deadline_at && now >= new Date(g.deadline_at));
                    const currentP = g.current_participants || 0;
                    const maxP = g.capacity_max || 10;
                    const pct = maxP > 0 ? Math.min((currentP / maxP) * 100, 100) : 0;

                    return `
                        <div class="ip-section ip-gathering-card">
                            <div class="ip-gathering-row"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
                            <div class="ip-gathering-row"><i class="fa-solid fa-location-dot"></i> ${location}</div>
                            <a href="${mapUrl}" target="_blank" class="ip-btn-map">
                                <i class="fa-solid fa-map-location-dot"></i> 지도 바로가기
                            </a>
                            ${state.isInstructor ? `
                            <div class="ip-pass-stats">
                                <div><i class="fa-solid fa-ticket"></i> 발행 <b>${pass_stats.total_issued || 0}</b>개</div>
                                <div><i class="fa-solid fa-check-circle"></i> 사용 <b>${pass_stats.total_used || 0}</b>개</div>
                            </div>
                            ` : ''}
                            <div class="ip-recruit-badge ${isClosed ? 'closed' : 'open'}">${isClosed ? '모집 마감' : '모집 진행중'}</div>
                            <div class="ip-progress-section">
                                <div class="ip-progress-label">
                                    <span>참여</span>
                                    <span>${currentP} / ${maxP}명</span>
                                </div>
                                <div class="ip-progress-bar"><div class="ip-progress-fill" style="width:${pct}%"></div></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // ===== 4. 채팅 설정 =====
            const savedHeight = localStorage.getItem('bsq_chat_height') || '800';
            const savedRatio = localStorage.getItem('bsq_chat_ratio') || '50';
            const chatSettingsHtml = `
                <div class="ip-section ip-settings-section">
                    <h4 class="ip-settings-title"><i class="fa-solid fa-sliders"></i> 채팅 인터페이스 설정</h4>
                    <div class="ip-slider-group">
                        <div class="ip-slider-label"><span>채팅창 높이</span><span id="chatHeightVal" class="ip-slider-value">${savedHeight}px</span></div>
                        <input type="range" id="chatHeightSlider" min="400" max="2000" step="50" value="${savedHeight}" class="ip-slider"
                            oninput="document.getElementById('chatHeightVal').textContent=this.value+'px'; const w=document.querySelector('.chat-tab-wrapper'); if(w)w.style.setProperty('height',this.value+'px','important'); localStorage.setItem('bsq_chat_height',this.value);">
                    </div>
                    <div class="ip-slider-group">
                        <div class="ip-slider-label"><span>메시지 비율</span><span id="chatRatioVal" class="ip-slider-value">${savedRatio}%</span></div>
                        <input type="range" id="chatRatioSlider" min="30" max="90" step="5" value="${savedRatio}" class="ip-slider"
                            oninput="document.getElementById('chatRatioVal').textContent=this.value+'%'; const c=document.getElementById('chatMessagesContainer'); if(c)c.style.setProperty('flex','0 0 '+this.value+'%','important'); localStorage.setItem('bsq_chat_ratio',this.value);">
                    </div>
                    <button class="ip-btn-reset" onclick="document.getElementById('chatHeightSlider').value=800;document.getElementById('chatHeightVal').textContent='800px';document.getElementById('chatRatioSlider').value=50;document.getElementById('chatRatioVal').textContent='50%';const w=document.querySelector('.chat-tab-wrapper');if(w)w.style.setProperty('height','800px','important');localStorage.setItem('bsq_chat_height','800');localStorage.removeItem('bsq_chat_ratio');">
                        <i class="fa-solid fa-rotate-left"></i> 초기화
                    </button>
                </div>
            `;

            // ===== 최종 조합 =====
            panelBody.innerHTML = `
                <style>
                    .ip-section { background: var(--border-color); border-radius:12px; padding:14px; margin-bottom:10px; }
                    .ip-header-section { background: rgba(52,199,89,0.08); border:1px solid rgba(52,199,89,0.15); }
                    .ip-sub-text { font-size:0.75rem; color:var(--text-secondary); }
                    .ip-member-card { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--border-color); }
                    .ip-member-card:last-child { border-bottom:none; }
                    .ip-member-avatar { width:36px; height:36px; border-radius:50%; background-size:cover; background-position:center; flex-shrink:0; position:relative; }
                    .ip-online-dot { position:absolute; bottom:0; right:0; width:10px; height:10px; border-radius:50%; border:2px solid var(--chat-bg); }
                    .ip-member-info { flex:1; min-width:0; }
                    .ip-member-name { font-size:0.88rem; font-weight:700; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
                    .ip-member-detail { font-size:0.72rem; color:var(--text-secondary); margin-top:2px; }
                    .ip-role-badge { font-size:0.6rem; padding:2px 6px; border-radius:4px; font-weight:700; white-space:nowrap; }
                    .ip-role-instructor { background:rgba(255,214,10,0.15); color:#FFD60A; }
                    .ip-role-sub { background:rgba(175,82,222,0.15); color:#AF52DE; }
                    .ip-role-student { background:rgba(142,142,147,0.1); color:var(--text-secondary); }
                    .ip-pass-badge { font-size:0.75rem; font-weight:700; padding:4px 8px; border-radius:6px; background:rgba(76,201,240,0.1); color:#4cc9f0; white-space:nowrap; display:flex; align-items:center; gap:4px; }
                    .ip-btn-friend { width:30px; height:30px; border-radius:8px; background:rgba(0,122,255,0.1); color:var(--accent-color); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.75rem; transition:all 0.2s; flex-shrink:0; }
                    .ip-btn-friend:hover { background:rgba(0,122,255,0.25); transform:scale(1.1); }
                    .ip-gathering-card { background:rgba(0,122,255,0.05); border:1px solid rgba(0,122,255,0.1); }
                    .ip-gathering-row { font-size:0.85rem; margin-bottom:8px; display:flex; align-items:center; gap:8px; }
                    .ip-gathering-row i { color:var(--accent-color); width:14px; text-align:center; font-size:0.8rem; }
                    .ip-btn-map { display:flex; align-items:center; justify-content:center; gap:6px; width:100%; padding:9px; border-radius:8px; background:rgba(0,122,255,0.1); color:var(--accent-color); text-decoration:none; font-weight:700; font-size:0.85rem; border:1px solid rgba(0,122,255,0.15); margin-bottom:10px; transition:all 0.2s; }
                    .ip-btn-map:hover { background:rgba(0,122,255,0.2); }
                    .ip-pass-stats { display:flex; gap:16px; font-size:0.8rem; margin-bottom:10px; }
                    .ip-pass-stats i { margin-right:4px; color:var(--accent-color); }
                    .ip-recruit-badge { text-align:center; padding:10px; border-radius:8px; font-weight:800; font-size:1.1rem; margin-bottom:10px; }
                    .ip-recruit-badge.open { background:rgba(0,122,255,0.15); color:#007AFF; border:1px solid rgba(0,122,255,0.25); }
                    .ip-recruit-badge.closed { background:rgba(142,142,147,0.1); color:var(--text-secondary); }
                    .ip-progress-section { margin-top:4px; }
                    .ip-progress-label { display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px; font-weight:600; }
                    .ip-progress-bar { width:100%; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden; }
                    .ip-progress-fill { height:100%; background:linear-gradient(90deg,#5AC8FA,#007AFF); border-radius:3px; transition:width 0.5s; }
                    .ip-settings-section { background:rgba(142,142,147,0.06); border:1px solid var(--border-color); }
                    .ip-settings-title { font-size:0.85rem; font-weight:700; margin:0 0 12px 0; display:flex; align-items:center; gap:6px; }
                    .ip-slider-group { margin-bottom:12px; }
                    .ip-slider-label { display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; }
                    .ip-slider-value { color:var(--accent-color); font-weight:700; }
                    .ip-slider { width:100%; accent-color:#007AFF; cursor:pointer; }
                    .ip-btn-reset { width:100%; padding:7px; border-radius:8px; background:rgba(255,59,48,0.08); color:#FF3B30; border:1px solid rgba(255,59,48,0.15); cursor:pointer; font-weight:600; font-size:0.78rem; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:4px; }
                    .ip-btn-reset:hover { background:rgba(255,59,48,0.18); }
                </style>
                ${headerHtml}
                ${memberListHtml}
                ${gatheringHtml}
                ${chatSettingsHtml}
            `;

            // 친구 추가 버튼 이벤트 바인딩
            panelBody.querySelectorAll('.ip-btn-friend').forEach(btn => {
                btn.onclick = async () => {
                    const targetUid = btn.dataset.targetUid;
                    const targetName = btn.dataset.targetName;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    try {
                        const res = await window.BSQ.api('/api/friends', {
                            method: 'POST',
                            body: JSON.stringify({ action: 'request', user_id: state.userId, friend_id: targetUid })
                        });
                        if (res.success) {
                            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                            btn.style.background = 'rgba(52,199,89,0.15)';
                            btn.style.color = '#34C759';
                            if (typeof showToast === 'function') showToast('success', '친구 요청', `${targetName}에게 친구 요청을 보냈습니다.`);
                        } else {
                            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
                            btn.disabled = false;
                            if (typeof showToast === 'function') showToast('info', '알림', res.error || '요청 실패');
                        }
                    } catch (e) {
                        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
                        btn.disabled = false;
                        alert('오류: ' + e.message);
                    }
                };
            });

        } catch (err) {
            console.error('[InfoPanel] Error:', err);
            panelBody.innerHTML = `<div style="padding:20px; color:#ff4d4d;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> 오류 발생: ${err.message}</div>`;
        }
    }

    return { init };
})();
