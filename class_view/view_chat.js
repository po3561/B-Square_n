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
        const btnChatInfo = document.getElementById('btnChatInfo');
        const btnThemeToggle = document.getElementById('btnThemeToggle');
        const btnChatSearch = document.getElementById('btnChatSearch');
        const commInfoPanel = document.getElementById('commInfoPanel');
        const btnClosePanel = document.getElementById('btnClosePanel');
        const chatSearchBar = document.getElementById('chatSearchBar');

        if (btnChatInfo && commInfoPanel) {
            btnChatInfo.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = commInfoPanel.classList.toggle('visible');
                if (isVisible) {
                    renderInfoPanel(db, classId, currentUserId, supabase, isInstructor);
                }
            };
        }

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

        if (btnClosePanel && commInfoPanel) {
            btnClosePanel.onclick = () => {
                commInfoPanel.classList.remove('visible');
            };
        }

        // 5. 참여자 목록 로드 (헤더 뱃지용)
        updateParticipantBadge(db, classId);

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

    panelTitle.textContent = isInstructor ? '수강생 관리' : '클래스 정보';
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

        // 2. 참여자 상세 정보 로드 (Supabase)
        const { data: users } = await supabase.from('users').select('id, name, nickname, profile_image_url, phone').in('id', participantsUids);
        
        // 3. 수강권 데이터 로드 (가정: enrollments 하위에 passCount 존재)
        let totalPassesUsed = 0;
        let totalPassesIssued = participantsUids.length * 10; // 예시 데이터

        // 4. 모임 정보 로드 (가정: classes/classId/gathering)
        const gatherSnap = await db.ref(`classes/${classId}/gathering`).once('value');
        const gather = gatherSnap.val() || {
            title: '주말 오프라인 실습',
            time: '매주 토요일 14:00',
            place: 'B-Square 라운지',
            min: 5,
            max: 15,
            current: participantsUids.length
        };

        let html = '<div class="staggered-entry">';

        if (isInstructor) {
            // [A. 강사 뷰]
            // 1. 수강권 통계
            html += `
                <div class="instructor-stats-box stagger-1">
                    <div style="color:var(--comm-accent); font-size:0.8rem; margin-bottom:4px;">📊 수강권 사용 현황</div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:1.4rem; font-weight:900;">${participantsUids.length * 2} / ${totalPassesIssued}</span>
                        <span style="font-size:0.85rem; color:var(--comm-text2);">회 사용됨</span>
                    </div>
                </div>
            `;

            // 2. 참여자 목록 (상세)
            html += '<div class="info-section-title stagger-2">참여자 목록</div>';
            html += '<div class="info-student-list-grid stagger-3">';
            users.forEach((user, idx) => {
                html += `
                    <div class="participant-row-item">
                        <div class="participant-avatar" style="${user.profile_image_url ? `background-image:url(${user.profile_image_url})` : ''}">
                            <div class="online-indicator online"></div>
                        </div>
                        <div class="participant-info-block">
                            <div class="participant-name-line">
                                <span class="nick">${user.nickname || user.name}</span>
                                <div class="instructor-private-info">
                                    <span class="real">(${user.name})</span>
                                    <a href="tel:${user.phone}" class="phone">${user.phone || '연락처 없음'}</a>
                                </div>
                            </div>
                            <div class="participant-pass-tag">잔여 8회</div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            // 3. 액션 XL
            html += `
                <div style="margin-top:30px;" class="stagger-4">
                    <button class="btn-info-action-xl dark btn-press" onclick="alert('모집이 마감되었습니다.')">모집 마감하기</button>
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
                            <span class="nick">${user.nickname || '익명의 수강생'}</span>
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
