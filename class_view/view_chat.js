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
 * 정보 패널 렌더링 (D1 마이그레이션 임시 뷰)
 */
async function renderInfoPanel(db, classId, userId, supabase, isInstructor) {
    const panelBody = document.getElementById('infoPanelBody');
    const panelTitle = document.getElementById('infoPanelTitle');
    if (!panelBody) return;

    panelBody.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">데이터 로딩 중...</div>';

    try {
        // 1. 모임 현황 가져오기
        const gatherRes = await window.BSQ.api(`/api/gatherings?class_id=${classId}`);
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
                <!-- 참여자 목록 등 추가 예정 -->
                <h4 style="color:#fff; font-size:1rem; margin-bottom:12px; margin-top:20px;">👥 클래스 멤버</h4>
                <div id="panelMemberList" style="display:flex; flex-direction:column; gap:8px;">
                    <p style="color:#666; font-size:0.9rem;">멤버 정보를 불러오고 있습니다...</p>
                </div>
            </div>
        `;
        
        // 추가 정보(멤버 등) 비동기 로드
        updatePanelMemberList(db, classId, isInstructor);

    } catch (err) {
        panelBody.innerHTML = `<div style="padding:20px; color:#ff4d4d;">오류 발생: ${err.message}</div>`;
    }
}

async function updatePanelMemberList(db, classId, isInstructor) {
    const listEl = document.getElementById('panelMemberList');
    if (!listEl) return;

    // D1 class_participants 테이블에서 가져오기
    try {
        const res = await window.BSQ.api(`/api/classes/${classId}/members`);
        if (res.success && res.data) {
            listEl.innerHTML = res.data.map(m => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px;">
                    <img src="${m.profile_image_url || '/api/placeholder/40/40'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-size:0.9rem; color:#fff; font-weight:600;">${m.nickname || m.name} ${m.role === 'instructor' ? '👑' : ''}</div>
                        ${isInstructor && m.phone ? `<div style="font-size:0.75rem; color:#888;">${m.phone}</div>` : ''}
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        listEl.innerHTML = '<p style="color:#666; font-size:0.8rem;">멤버 정보를 가져올 수 없습니다.</p>';
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
// Pinned messages (ChatUI) - D1 마이그레이션 안내 처리
// =========================
function setupPinnedMessagesChatUI(db, classId, isInstructor) {
    const pinnedBar = document.getElementById('pinnedMsgBar');
    if (pinnedBar) {
        pinnedBar.style.display = 'none'; // 당분간 핀 메시지 상단바 숨김
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
