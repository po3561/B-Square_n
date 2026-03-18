// view_chat.js - Class Channel with Lock/Unlock + UI Spec Consolidated Implementation
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initChat = function (db, classId, userId, supabase, hasAccess, isInstructor) {
    console.log("💬 Chat Module Initializing... | Access:", hasAccess, "| Instructor:", isInstructor);

    // 총괄 개발자 모드 무적 패스
    if (window.__BSQ_DEV_MODE__) {
        hasAccess = true;
    }

    const lockedOverlay = document.getElementById('chatLockedOverlay');
    const unlockedArea = document.getElementById('chatUnlocked');

    if (hasAccess && (userId || window.__BSQ_DEV_MODE__)) {
        // 수강자 / 강사 / 운영자: 채팅 해제
        if (lockedOverlay) lockedOverlay.style.display = 'none';
        if (unlockedArea) unlockedArea.style.display = 'flex'; // flex for comm-main layout

        // 1. 커뮤니티 모듈 연결
        const SyncBridge = window.CommunityModules.SyncBridge;
        const ChatUI = window.CommunityModules.ChatUI;

        // 운영자 고스트 계정 처리
        const currentUserId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : userId;

        // 초기화 ('class' 전용 테마 키 사용)
        SyncBridge.init(db, supabase, currentUserId);
        ChatUI.init({ themeKey: 'bsq_theme_class' });

        // 2. 클래스 채팅방 열기 (타이틀 가져오기)
        const classTitle = document.getElementById('sidebarTitle')?.textContent || '클래스';
        ChatUI.openRoom(classId, 'class', {
            class_name: classTitle,
            is_instructor: isInstructor,
            class_id: classId
        });

        // 3. 전송 이벤트 바인딩
        const btnSend = document.getElementById('btnSend');
        const msgInput = document.getElementById('msgInput');

        if (btnSend) {
            btnSend.onclick = () => ChatUI.sendCurrentMessage();
        }

        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ChatUI.sendCurrentMessage();
                }
            });
        }

        // 4. 헤더 액션 이벤트 바인딩
        // (정보 패널 토글 및 닫기는 chat_ui.js 에서 통합 처리됨)
        const btnThemeToggle = document.getElementById('btnThemeToggle');
        const btnChatSearch = document.getElementById('btnChatSearch');
        const chatSearchBar = document.getElementById('chatSearchBar');

        if (btnThemeToggle) {
            btnThemeToggle.onclick = () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                const themeIcon = document.getElementById('themeIcon');
                if (themeIcon) {
                    themeIcon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
                }
                localStorage.setItem('bsq_theme_class', newTheme);
            };
            // 초기 테마 설정 로드
            const savedTheme = localStorage.getItem('bsq_theme_class') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
            const themeIcon = document.getElementById('themeIcon');
            if (themeIcon) themeIcon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }

        if (btnChatSearch && chatSearchBar) {
            btnChatSearch.onclick = () => {
                const isSearchVisible = chatSearchBar.style.display === 'flex';
                chatSearchBar.style.display = isSearchVisible ? 'none' : 'flex';
                if (!isSearchVisible) document.getElementById('msgSearchInput')?.focus();
            };
            document.getElementById('msgSearchClose').onclick = () => {
                chatSearchBar.style.display = 'none';
            };
        }


        // 5. 참여자 목록 로드 (헤더 뱃지용)
        updateParticipantBadge(db, classId);

        // 6. 고정 메시지 (상단 바 + 햄버거 전환 + 우클릭 메뉴) — SimpleClassChat 버전 이식
        setupPinnedMessagesChatUI(db, classId, isInstructor);

    } else {
        // 미수강자: 채팅 잠금
        if (lockedOverlay) lockedOverlay.style.display = 'flex';
        if (unlockedArea) unlockedArea.style.display = 'none';
    }
};

/**
 * 정보 패널 렌더링 (UI_SPEC_CONSOLIDATED.md 기반)
 */
async function renderInfoPanel(db, classId, userId, supabase, isInstructor) {
    const panelBody = document.getElementById('infoPanelBody');
    const panelTitle = document.getElementById('infoPanelTitle');
    if (!panelBody) return;

    panelTitle.textContent = isInstructor ? '클래스 참여자 / 총 000명 수강' : '클래스 정보';
    panelBody.innerHTML = '<div class="info-empty">데이터를 불러오는 중...</div>';

    try {
        // 1. 기본 데이터 로드
        const enrollRef = db.ref('enrollments');
        const snap = await enrollRef.once('value');
        const allEnrollments = snap.val() || {};
        const participantsUids = [];
        for (const uid in allEnrollments) {
            if (allEnrollments[uid][classId]) participantsUids.push(uid);
        }

        const participantCount = participantsUids.length;

        // 참여자가 아예 없으면 간단 메시지 후 종료
        if (participantCount === 0) {
            if (isInstructor && panelTitle) {
                panelTitle.textContent = '클래스 참여자 / 총 0명 수강';
            }
            panelBody.innerHTML = '<div class="info-empty">아직 참여 중인 수강생이 없습니다.</div>';
            return;
        }

        // 클래스 정보 (수강권 통계, 모임 정보 등)
        const classSnap = await db.ref(`classes/${classId}`).once('value');
        const classInfo = classSnap.val() || {};

        // 2. 참여자 상세 정보 로드 (Supabase) - nickname 컬럼 없이 name만 사용
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, name, profile_image_url, phone')
            .in('id', participantsUids);

        if (usersError) {
            console.error('Supabase users 조회 실패:', usersError);
            panelBody.innerHTML = '<div class="info-empty">참여자 정보를 불러오지 못했습니다.</div>';
            return;
        }

        if (!users || users.length === 0) {
            panelBody.innerHTML = '<div class="info-empty">참여자 정보를 찾을 수 없습니다.</div>';
            return;
        }

        // 3. 수강권 데이터 로드 (user_passes/{userId}/{classId})
        const passesSnap = await db.ref('user_passes').once('value');
        const allPasses = passesSnap.val() || {};

        let totalPassesUsed = 0;
        let totalPassesIssued = 0;
        participantsUids.forEach((uid) => {
            const p = allPasses[uid] && allPasses[uid][classId];
            if (!p) return;
            totalPassesIssued += p.issued_count || 0;
            totalPassesUsed += p.used_count || 0;
        });

        // 클래스에 집계 필드가 있으면 우선 사용
        if (typeof classInfo.total_passes_issued === 'number') {
            totalPassesIssued = classInfo.total_passes_issued;
        }
        if (typeof classInfo.total_passes_used === 'number') {
            totalPassesUsed = classInfo.total_passes_used;
        }

        // 4. 모임 정보 로드
        const gatherSnap = await db.ref(`classes/${classId}/gathering`).once('value');
        const gather = gatherSnap.val() || {
            title: classInfo.title || '클래스 모임',
            time: '모임 일시 미정',
            place: classInfo.location || '장소 미정',
            min: 1,
            max: participantCount || 1,
            current: participantCount,
            status: 'open'
        };

        let html = '<div class="staggered-entry">';

        if (isInstructor) {
            // 상단 타이틀에 실제 수강 인원 반영
            if (panelTitle) {
                panelTitle.textContent = `클래스 참여자 / 총 ${participantCount}명 수강`;
            }

            // [A. 강사 뷰]
            // 1. 수강권 통계
            html += `
                <div class="instructor-stats-box stagger-1">
                    <div style="color:var(--comm-accent); font-size:0.8rem; margin-bottom:4px;">📊 수강권 사용 현황</div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:1.4rem; font-weight:900;">${totalPassesUsed} / ${totalPassesIssued}</span>
                        <span style="font-size:0.85rem; color:var(--comm-text2);">회 사용됨</span>
                    </div>
                </div>
            `;

            // 2. 참여자 목록 (상세)
            html += '<div class="info-section-title stagger-2">참여자 목록</div>';
            html += '<div class="info-student-list-grid stagger-3">';
            users.forEach((user) => {
                const p = allPasses[user.id] && allPasses[user.id][classId];
                const remain = p && typeof p.count === 'number' ? p.count : 0;
                html += `
                    <div class="participant-row-item">
                        <div class="participant-avatar" style="${user.profile_image_url ? `background-image:url(${user.profile_image_url})` : ''}">
                            <div class="online-indicator online"></div>
                        </div>
                        <div class="participant-info-block">
                            <div class="participant-name-line">
                                <span class="nick">${user.name}</span>
                                <div class="instructor-private-info">
                                    <span class="real">(${user.name})</span>
                                    <a href="tel:${user.phone}" class="phone">${user.phone || '연락처 없음'}</a>
                                </div>
                            </div>
                            <div class="participant-pass-tag">잔여 ${remain}회</div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            // 3. 모임 정보 + 지도 바로가기
            const progress = Math.min(100, (gather.current / (gather.max || 1)) * 100);
            const kakaoUrl = `https://map.kakao.com/?q=${encodeURIComponent(gather.place || '')}`;
            html += `
                <div class="info-section-title stagger-3" style="margin-top:24px;">가장 최근 모임 정보</div>
                <div class="info-gathering-card-dark stagger-3">
                    <div class="gathering-card-row">
                        <span class="gathering-label">모임일시</span>
                        <span class="gathering-value">${gather.time}</span>
                    </div>
                    <div class="gathering-card-row">
                        <span class="gathering-label">모임장소</span>
                        <span class="gathering-value">${gather.place}</span>
                    </div>
                    <button class="btn-gathering-map-info hover-lift" onclick="window.open('${kakaoUrl}', '_blank')">
                        지도 바로가기
                    </button>
                </div>
            `;

            // 4. 모집 마감 버튼
            html += `
                <div style="margin-top:24px;" class="stagger-4">
                    <button id="btnCloseGatheringPanel" class="btn-info-action-xl dark btn-press">
                        모집 마감
                    </button>
                </div>
            `;

            // 5. 하단 참여 인원 + 프로그레스 바
            html += `
                <div class="info-panel-footer-progress stagger-5">
                    <div class="footer-progress-label-row">
                        <span>참여 : ${gather.current} / ${gather.max}명</span>
                        <span class="footer-progress-sub-label">최소 ${gather.min}명 필요</span>
                    </div>
                    <div class="info-progress-container-thin">
                        <div class="info-progress-bar-fill" style="width:${progress}%"></div>
                    </div>
                </div>
            `;

        } else {
            // [B. 수강생 뷰]
            // 1. 모임 정보 (프로그레스 바)
            const progress = Math.min(100, (gather.current / gather.max) * 100);
            html += `
                <div class="info-section-title stagger-1">예정된 모임</div>
                <div class="info-gathering-card-dark stagger-2">
                    <div class="gathering-card-row">
                        <span class="gathering-label">일시</span>
                        <span class="gathering-value">${gather.time}</span>
                    </div>
                    <div class="gathering-card-row">
                        <span class="gathering-label">장소</span>
                        <span class="gathering-value">${gather.place}</span>
                    </div>
                    <div style="margin-top:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="participation-label">참여 인원 (${gather.current}/${gather.max})</span>
                            <span class="min-required-label">최소 ${gather.min}명 필요</span>
                        </div>
                        <div class="info-progress-container-thin">
                            <div class="info-progress-bar-fill" style="width:${progress}%"></div>
                        </div>
                    </div>
                    <button class="btn-gathering-map-info hover-lift">지도 보기</button>
                </div>
            `;

            // 2. 참여자 목록 (프라이버시)
            html += '<div class="info-section-title stagger-3">참여 중인 학우</div>';
            html += '<div class="info-student-list-grid stagger-4">';
            users.forEach((user) => {
                html += `
                    <div class="participant-row-item">
                        <div class="participant-avatar" style="${user.profile_image_url ? `background-image:url(${user.profile_image_url})` : ''}">
                        </div>
                        <div class="participant-info-block">
                            <span class="nick">${user.name || '익명의 수강생'}</span>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            // 3. 이원화 액션 버튼
            html += `
                <div class="dual-action-btns stagger-5" style="margin-top:30px;">
                    <button class="btn-info-action-lg primary btn-press" onclick="alert('클래스 참여 신청 완료!')">
                        <span class="btn-main-text">클래스 참여</span>
                        <span class="btn-sub-text">수강권 1회 사용</span>
                    </button>
                    <button class="btn-info-action-lg danger btn-press" onclick="document.getElementById('commInfoPanel').classList.remove('visible')">
                        <span class="btn-main-text">다음에 참여</span>
                    </button>
                </div>
            `;
        }

        html += '</div>';
        panelBody.innerHTML = html;

        // 모집 마감 버튼 핸들러 (강사용)
        if (isInstructor) {
            const btnCloseGathering = document.getElementById('btnCloseGatheringPanel');
            if (btnCloseGathering) {
                btnCloseGathering.onclick = async () => {
                    try {
                        await db.ref(`classes/${classId}/gathering/status`).set('closed');
                        alert('모집이 마감되었습니다.');
                    } catch (e) {
                        console.error('모집 마감 처리 실패:', e);
                        alert('모집 마감 처리 중 오류가 발생했습니다.');
                    }
                };
            }
        }

    } catch (err) {
        console.error("Info Panel Render Error:", err);
        panelBody.innerHTML = '<div class="info-empty">정보를 불러오지 못했습니다.</div>';
    }
}

function updateParticipantBadge(db, classId) {
    const enrollRef = db.ref('enrollments');
    enrollRef.on('value', (snap) => {
        const allEnrollments = snap.val() || {};
        let count = 0;
        for (const uid in allEnrollments) {
            if (allEnrollments[uid][classId]) count++;
        }

        const countEl = document.getElementById('chatMemberCount');
        if (countEl) countEl.textContent = `${count}명 참여 중`;

        const chatTabBtn = document.querySelector('[data-target="tabChat"]');
        if (chatTabBtn && count > 0) {
            let badge = chatTabBtn.querySelector('.tab-participant-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'tab-participant-badge';
                chatTabBtn.appendChild(badge);
            }
            badge.textContent = count;
        }
    });
}

// =========================
// Pinned messages (ChatUI)
// =========================
function setupPinnedMessagesChatUI(db, classId, isInstructor) {
    if (!db || !classId) return;

    const state = {
        pins: {} // { pinId: { messageId, content, timestamp } }
    };

    const pinnedBar = document.getElementById('pinnedMsgBar');
    const pinnedText = document.getElementById('pinnedMsgText');
    const pinnedContent = document.getElementById('pinnedMsgContent');
    const btnPinnedList = document.getElementById('btnPinnedList');
    const pinnedListOverlay = document.getElementById('pinnedListOverlay');
    const pinnedListBody = document.getElementById('pinnedListBody');
    const pinnedListTitle = document.getElementById('pinnedListTitle');
    const btnClosePinnedList = document.getElementById('btnClosePinnedList');

    const chatMessages = document.getElementById('chatMessagesContainer');
    const chatInput = document.getElementById('chatInputArea');
    const pinnedBarTop = document.getElementById('pinnedMsgBar');

    // 초기 상태 보정 (HTML에 display:none 인라인이 있는 경우)
    if (pinnedListOverlay) {
        pinnedListOverlay.classList.remove('visible');
        pinnedListOverlay.style.display = 'none';
    }

    const pinsRef = db.ref('pinned_messages/' + classId);

    pinsRef.on('value', (snap) => {
        state.pins = snap.val() || {};
        const pinsArr = Object.entries(state.pins).map(([id, v]) => ({ id, ...v }));

        if (!pinnedBar || !pinnedText) return;

        if (pinsArr.length === 0) {
            pinnedBar.style.display = 'none';
            if (pinnedListBody) pinnedListBody.innerHTML = '';
            if (pinnedListTitle) pinnedListTitle.textContent = '0개의 고정된 메시지';
            return;
        }

        pinsArr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const latest = pinsArr[pinsArr.length - 1];

        pinnedBar.style.display = 'flex';
        pinnedText.textContent = latest.content || '';
        if (pinnedContent) pinnedContent.onclick = () => scrollToMessageInChatUI(latest.messageId);

        // 고정 메시지 전용 화면(오버레이) 렌더링 — 채팅 버블 형태
        if (pinnedListBody && pinnedListTitle) {
            pinnedListTitle.textContent = `${pinsArr.length}개의 고정된 메시지`;
            pinnedListBody.innerHTML = '';

            let lastDateLabel = '';
            [...pinsArr].reverse().forEach((pin) => {
                const ts = pin.timestamp ? new Date(pin.timestamp) : null;
                const dateLabel = ts ? `${ts.getMonth() + 1}월 ${ts.getDate()}일` : '';
                const timeStr = ts ? ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

                if (dateLabel && dateLabel !== lastDateLabel) {
                    lastDateLabel = dateLabel;
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'pin-date-header';
                    dateDiv.textContent = dateLabel;
                    pinnedListBody.appendChild(dateDiv);
                }

                const row = document.createElement('div');
                row.className = 'chat-msg';
                row.dataset.pinId = pin.id;
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

                row.onclick = () => {
                    hidePinnedScreen();
                    scrollToMessageInChatUI(pin.messageId);
                };

                pinnedListBody.appendChild(row);
            });
        }
    });

    function showPinnedScreen() {
        if (pinnedListOverlay) {
            pinnedListOverlay.style.display = 'flex';
            pinnedListOverlay.classList.add('visible');
        }
        chatMessages && chatMessages.classList.add('chat-pane-hidden');
        chatInput && chatInput.classList.add('chat-pane-hidden');
        pinnedBarTop && pinnedBarTop.classList.add('chat-pane-hidden');
    }

    function hidePinnedScreen() {
        if (pinnedListOverlay) {
            pinnedListOverlay.classList.remove('visible');
            pinnedListOverlay.style.display = 'none';
        }
        chatMessages && chatMessages.classList.remove('chat-pane-hidden');
        chatInput && chatInput.classList.remove('chat-pane-hidden');
        pinnedBarTop && pinnedBarTop.classList.remove('chat-pane-hidden');
    }

    if (btnPinnedList && pinnedListOverlay) {
        btnPinnedList.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPinnedScreen();
        };
    }
    if (btnClosePinnedList && pinnedListOverlay) {
        btnClosePinnedList.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hidePinnedScreen();
        };
    }
    if (pinnedListOverlay) {
        pinnedListOverlay.addEventListener('click', (e) => {
            if (e.target === pinnedListOverlay) hidePinnedScreen();
        });
    }

    // ---- 우클릭 메뉴 (강사 전용: 이제 chat_ui.js의 고급 메뉴가 담당함) ----
    if (isInstructor && pinnedListBody) {
        pinnedListBody.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('[data-pin-id]');
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            const pinId = row.dataset.pinId;
            showUnpinMenu(e.clientX, e.clientY, pinId);
        });
    }

    function showUnpinMenu(x, y, pinId) {
        closeAllPinMenus();
        const menu = document.createElement('div');
        menu.className = 'simple-msg-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.innerHTML = `
            <div class="ctx-item">
                <div class="ctx-item-label">고정 해제하기</div>
            </div>
        `;
        document.body.appendChild(menu);
        menu.querySelector('.ctx-item').addEventListener('click', () => {
            unpinById(pinId);
            closeAllPinMenus();
        });
        setTimeout(() => {
            document.addEventListener('click', () => closeAllPinMenus(), { once: true });
        }, 0);
    }

    function closeAllPinMenus() {
        document.querySelectorAll('.simple-msg-context-menu').forEach((el) => el.remove());
    }

    function pinMessage(messageId, content) {
        pinsRef.push({
            messageId,
            content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
        }).catch((err) => {
            console.error('❌ pinned_messages push 실패', err);
            alert('메시지 고정에 실패했습니다.');
        });
    }

    function unpinByMessageId(messageId) {
        const pins = state.pins || {};
        const updates = {};
        Object.entries(pins).forEach(([id, v]) => {
            if (v.messageId === messageId) updates[id] = null;
        });
        if (Object.keys(updates).length === 0) return;
        pinsRef.update(updates).catch((err) => {
            console.error('❌ pinned_messages unpin(update) 실패', err);
            alert('고정 해제에 실패했습니다.');
        });
    }

    function unpinById(pinId) {
        pinsRef.child(pinId).remove().catch((err) => {
            console.error('❌ pinned_messages unpin(remove) 실패', err);
            alert('고정 해제에 실패했습니다.');
        });
    }
}

function scrollToMessageInChatUI(messageId) {
    if (!messageId) return;
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-pin');
    setTimeout(() => el.classList.remove('highlight-pin'), 1500);
}
