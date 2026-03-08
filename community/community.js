// community.js - 커뮤니티 채팅 메인 컨트롤러
// Firebase + Supabase 오케스트레이터
document.addEventListener('DOMContentLoaded', async () => {
    // ---- header.js가 Supabase/Firebase 초기화 및 유저 메뉴를 처리함 ----
    // 초기화 완료 대기
    const waitForInit = () => new Promise((resolve) => {
        const check = () => {
            if (window.supabaseClient && (typeof firebase !== 'undefined' && firebase.apps.length > 0)) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
        setTimeout(resolve, 3000);
    });
    await waitForInit();

    const db = firebase.database();
    const supabase = window.supabaseClient;

    // ---- 세션 및 운영자 확인 ----
    const isOperator = window.__BSQ_DEV_MODE__ === true;
    let session = null;

    try {
        if (supabase && supabase.auth) {
            const { data } = await supabase.auth.getSession();
            session = data?.session || null;
        }
    } catch (e) {
        console.warn('Session check error:', e);
    }

    // ★ 운영자 모드면 로그인 없이 진입 가능
    if ((!session || !session.user) && !isOperator) {
        renderLoginPrompt();
        return;
    }

    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    // header.js에서 유저 메뉴를 이미 처리하므로, 운영자 표시만 추가
    if (isOperator) {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.innerHTML = `<div class="user-profile-btn"><span class="user-avatar">🛡️</span><span class="user-name">운영자 님</span></div>`;
    }

    // ---- 모듈 초기화 ----
    const SyncBridge = window.CommunityModules.SyncBridge;
    const DM = window.CommunityModules.DM;
    const ChatList = window.CommunityModules.ChatList;
    const ChatUI = window.CommunityModules.ChatUI;

    SyncBridge.init(db, supabase, userId);
    ChatUI.init();

    // 방 선택 콜백
    ChatList.init((roomId, type, roomInfo) => {
        ChatUI.openRoom(roomId, type, roomInfo);
        ChatList.setActiveRoom(roomId);
        // 모바일: 사이드바 숨기기
        document.getElementById('commSidebar')?.classList.add('hidden');
    });

    // 전송 버튼
    document.getElementById('btnSend')?.addEventListener('click', () => ChatUI.sendCurrentMessage());
    document.getElementById('msgInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ChatUI.sendCurrentMessage();
        }
    });

    // 모바일 뒤로가기
    document.getElementById('btnBackMobile')?.addEventListener('click', () => {
        document.getElementById('commSidebar')?.classList.remove('hidden');
    });

    // 클래스 채팅 자동 등록
    registerClassChats(db, userId);

    // ---- 햄버거 메뉴 ----
    setupHamburgerMenu(supabase, userId, db, SyncBridge, DM, ChatUI, ChatList);

    // ---- 새 대화 모달 ----
    setupNewChatModal(supabase, userId, SyncBridge, DM, ChatUI, ChatList);

    // ---- 정보 패널 ----
    setupInfoPanel();

    console.log("✅ Community loaded for:", userId);
});

// ---- 클래스 채팅 자동 등록 ----
async function registerClassChats(db, userId) {
    try {
        const enrollSnap = await db.ref(`enrollments/${userId}`).once('value');
        const enrollments = enrollSnap.val() || {};
        for (const [classId, data] of Object.entries(enrollments)) {
            if (data.status === 'approved' || data.status === 'enrolled' || data.status === 'paid' || data.enrolled) {
                const classSnap = await db.ref(`classes/${classId}`).once('value');
                const classData = classSnap.val();
                if (classData) {
                    await db.ref(`user_chats/${userId}/${classId}`).update({
                        type: 'class',
                        class_name: classData.title || '클래스',
                        class_image: classData.image_url || ''
                    });
                }
            }
        }

        const classesSnap = await db.ref('classes').once('value');
        const allClasses = classesSnap.val() || {};
        for (const [classId, classData] of Object.entries(allClasses)) {
            if (classData.creator_id === userId || window.__BSQ_DEV_MODE__) {
                await db.ref(`user_chats/${userId}/${classId}`).update({
                    type: 'class',
                    class_name: classData.title || '클래스',
                    class_image: classData.image_url || '',
                    is_instructor: true
                });
            }
        }
    } catch (e) {
        console.warn("Class chats registration:", e.message);
    }
}

// ---- 햄버거 메뉴 ----
function setupHamburgerMenu(supabase, userId, db, SyncBridge, DM, ChatUI, ChatList) {
    const btn = document.getElementById('btnHamburger');
    const menu = document.getElementById('hamburgerMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        console.log("Hamburger menu toggled", menu.style.display);
    });

    // Prevent clicks inside the menu from closing it immediately
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', () => { menu.style.display = 'none'; });

    // 단체 채팅 만들기
    document.getElementById('hmGroupChat')?.addEventListener('click', () => {
        menu.style.display = 'none';
        setupGroupChatModal(supabase, userId, db, SyncBridge, ChatUI, ChatList);
        document.getElementById('groupChatModal').style.display = 'flex';
    });

    // 클래스 목록
    document.getElementById('hmClassList')?.addEventListener('click', () => {
        menu.style.display = 'none';
        window.location.href = '../class_list/class_list.html';
    });

    // 연락처
    document.getElementById('hmContacts')?.addEventListener('click', () => {
        menu.style.display = 'none';
        setupContactModal(supabase, userId, db);
        document.getElementById('contactModal').style.display = 'flex';
    });

    // 결제 정보 (마이페이지)
    document.getElementById('hmBillingInfo')?.addEventListener('click', () => {
        menu.style.display = 'none';
        window.location.href = '../mypage/mypage.html';
    });

    // 설정
    document.getElementById('hmSettings')?.addEventListener('click', () => {
        menu.style.display = 'none';
        // 임시 설정 모달 / 페이지 (현재는 알림으로 대체)
        alert('설정 기능 준비 중입니다.');
    });
}

// ---- 단체 채팅 만들기 모달 ----
function setupGroupChatModal(supabase, userId, db, SyncBridge, ChatUI, ChatList) {
    const modal = document.getElementById('groupChatModal');
    const input = document.getElementById('groupSearchInput');
    const nameInput = document.getElementById('groupNameInput');
    const results = document.getElementById('groupSearchResults');
    const selectedEl = document.getElementById('selectedMembers');
    const btnCreate = document.getElementById('btnCreateGroup');

    let selectedMembers = [];

    document.getElementById('btnCloseGroupModal')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // 이름 입력 초기화
    if (nameInput) nameInput.value = '';
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    selectedMembers = [];
    renderSelected();

    let searchTimeout;
    input?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const q = input.value.trim();
            if (!q) { results.innerHTML = ''; return; }
            const users = await SyncBridge.searchUsers(q);
            results.innerHTML = users.filter(u => !selectedMembers.find(m => m.id === u.id))
                .map(u => `
                    <div class="user-result-item" data-uid="${u.id}" data-name="${u.name || u.email}">
                        <div class="user-result-avatar" style="${u.profile_image_url ? `background-image:url(${u.profile_image_url})` : ''}">${!u.profile_image_url ? '👤' : ''}</div>
                        <div><div class="user-result-name">${u.name || u.email}</div></div>
                    </div>
                `).join('') || '<p style="color:var(--comm-text2);text-align:center;font-size:0.85rem;">사용자를 찾을 수 없습니다</p>';

            results.querySelectorAll('.user-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectedMembers.push({ id: item.dataset.uid, name: item.dataset.name });
                    renderSelected();
                    input.value = '';
                    results.innerHTML = '';
                });
            });
        }, 300);
    });

    function renderSelected() {
        selectedEl.innerHTML = selectedMembers.map(m =>
            `<div class="member-chip">${m.name}<button onclick="this.parentElement.remove()" data-id="${m.id}">✕</button></div>`
        ).join('');
        selectedEl.querySelectorAll('.member-chip button').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedMembers = selectedMembers.filter(m => m.id !== btn.dataset.id);
                renderSelected();
            });
        });
        if (btnCreate) btnCreate.disabled = selectedMembers.length === 0;
    }

    // 그룹 생성
    btnCreate.onclick = async () => {
        if (selectedMembers.length === 0) return;
        const groupName = nameInput?.value.trim() || selectedMembers.map(m => m.name).join(', ');
        const members = [userId, ...selectedMembers.map(m => m.id)];

        try {
            const groupId = 'group_' + Date.now();
            await db.ref(`group_chats/${groupId}/meta`).set({
                name: groupName,
                members,
                created_by: userId,
                created_at: firebase.database.ServerValue.TIMESTAMP
            });

            // 모든 멤버의 user_chats에 등록
            for (const memberId of members) {
                await db.ref(`user_chats/${memberId}/${groupId}`).set({
                    type: 'group',
                    group_name: groupName,
                    group_image: '',
                    unread_count: 0
                });
            }

            modal.style.display = 'none';
            ChatList.loadChatRooms();

            // 바로 열기
            ChatUI.openRoom(groupId, 'group', { group_name: groupName });
            document.getElementById('commSidebar')?.classList.add('hidden');
        } catch (e) {
            console.error('Group creation failed:', e);
            alert('그룹 생성 실패: ' + e.message);
        }
    };
}

// ---- 연락처 모달 ----
function setupContactModal(supabase, userId, db) {
    const modal = document.getElementById('contactModal');
    const input = document.getElementById('contactSearchInput');
    const results = document.getElementById('contactSearchResults');
    const list = document.getElementById('contactList');

    document.getElementById('btnCloseContactModal')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // 기존 연락처 로드
    loadContacts();

    let searchTimeout;
    input?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const q = input.value.trim();
            if (!q) { results.innerHTML = ''; return; }

            try {
                const { data: byName } = await supabase.from('users')
                    .select('id, name, email, profile_image_url')
                    .ilike('name', `%${q}%`).limit(10);
                const { data: byEmail } = await supabase.from('users')
                    .select('id, name, email, profile_image_url')
                    .ilike('email', `%${q}%`).limit(10);

                const map = {};
                [...(byName || []), ...(byEmail || [])].forEach(u => {
                    if (u.id !== userId) map[u.id] = u;
                });
                const users = Object.values(map);

                results.innerHTML = users.map(u => `
                    <div class="user-result-item" data-uid="${u.id}" data-name="${u.name || u.email}" data-avatar="${u.profile_image_url || ''}">
                        <div class="user-result-avatar" style="${u.profile_image_url ? `background-image:url(${u.profile_image_url})` : ''}">${!u.profile_image_url ? '👤' : ''}</div>
                        <div>
                            <div class="user-result-name">${u.name || u.email}</div>
                            <div style="font-size:0.75rem;color:var(--comm-text2);">${u.email || ''}</div>
                        </div>
                    </div>
                `).join('') || '<p style="color:var(--comm-text2);text-align:center;font-size:0.85rem;">사용자를 찾을 수 없습니다</p>';

                results.querySelectorAll('.user-result-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        await db.ref(`contacts/${userId}/${item.dataset.uid}`).set({
                            name: item.dataset.name,
                            avatar: item.dataset.avatar,
                            added_at: firebase.database.ServerValue.TIMESTAMP
                        });
                        input.value = '';
                        results.innerHTML = '';
                        loadContacts();
                    });
                });
            } catch (e) { console.error(e); }
        }, 300);
    });

    async function loadContacts() {
        if (!list) return;
        try {
            const snap = await db.ref(`contacts/${userId}`).once('value');
            const data = snap.val() || {};
            const entries = Object.entries(data);

            if (entries.length === 0) {
                list.innerHTML = '<p style="color:var(--comm-text2);text-align:center;font-size:0.85rem;">연락처가 없습니다</p>';
                return;
            }

            list.innerHTML = entries.map(([uid, info]) => `
                <div class="contact-item">
                    <div class="contact-avatar" style="${info.avatar ? `background-image:url(${info.avatar})` : ''}">${!info.avatar ? '👤' : ''}</div>
                    <span class="contact-name">${info.name}</span>
                    <button onclick="firebase.database().ref('contacts/${userId}/${uid}').remove().then(()=>this.closest('.contact-item').remove())" title="삭제">🗑️</button>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<p style="color:var(--comm-text2);text-align:center;">로드 실패</p>';
        }
    }
}

// ---- 새 대화 모달 ----
function setupNewChatModal(supabase, userId, SyncBridge, DM, ChatUI, ChatList) {
    const modal = document.getElementById('newChatModal');
    const input = document.getElementById('userSearchInput');
    const results = document.getElementById('userSearchResults');

    document.getElementById('btnNewChat')?.addEventListener('click', () => {
        const menu = document.getElementById('hamburgerMenu');
        if (menu) menu.style.display = 'none';
        modal.style.display = 'flex';
        input.value = '';
        results.innerHTML = '';
        input.focus();
    });

    document.getElementById('btnCloseModal')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // 폴더 관리 모달 닫기
    document.getElementById('btnCloseFolderModal')?.addEventListener('click', () => {
        document.getElementById('folderModal').style.display = 'none';
    });

    let searchTimeout;
    input?.addEventListener('input', () => {
        clearTimeout(searchTimeout);

        // --- Secret Mode ---
        if (input.value.trim() === '예수그리스도의 계시라') {
            window.open('https://web.telegram.org/k/', '_blank');
            input.value = '';
            results.innerHTML = '';
            modal.style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(async () => {
            const q = input.value.trim();
            if (!q) { results.innerHTML = ''; return; }

            let users = [];
            try {
                const { data: byName } = await supabase.from('users')
                    .select('id, name, email, profile_image_url')
                    .ilike('name', `%${q}%`).limit(20);
                const { data: byEmail } = await supabase.from('users')
                    .select('id, name, email, profile_image_url')
                    .ilike('email', `%${q}%`).limit(20);

                const map = {};
                [...(byName || []), ...(byEmail || [])].forEach(u => {
                    if (u.id !== userId) map[u.id] = u;
                });
                users = Object.values(map);
            } catch (e) {
                console.error('User search error:', e);
            }

            results.innerHTML = users.map(u => `
                <div class="user-result-item" data-uid="${u.id}">
                    <div class="user-result-avatar" style="${u.profile_image_url ? `background-image:url(${u.profile_image_url})` : ''}">
                        ${!u.profile_image_url ? '👤' : ''}
                    </div>
                    <div>
                        <div class="user-result-name">${u.name || u.email}</div>
                        <div style="font-size:0.75rem;color:#888;">${u.email || ''}</div>
                    </div>
                </div>
            `).join('') || '<p style="color:#666;text-align:center;padding:1rem;">사용자를 찾을 수 없습니다</p>';

            results.querySelectorAll('.user-result-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const targetId = item.dataset.uid;
                    console.log('📨 Starting DM with:', targetId);

                    try {
                        const roomId = await DM.openOrCreateRoom(targetId);
                        console.log('✅ Room created/found:', roomId);
                        modal.style.display = 'none';

                        const profile = await SyncBridge.getUserProfile(targetId);
                        ChatUI.openRoom(roomId, 'dm', {
                            target_id: targetId,
                            target_name: profile.name || '사용자',
                            target_avatar: profile.profile_image_url || ''
                        });

                        document.getElementById('commSidebar')?.classList.add('hidden');
                        ChatList.loadChatRooms();
                    } catch (err) {
                        console.error('❌ DM 생성 오류:', err);
                        alert('채팅방 생성 중 오류가 발생했습니다: ' + err.message);
                    }
                });
            });
        }, 300);
    });
}

// ---- 정보 패널 ----
function setupInfoPanel() {
    const btn = document.getElementById('btnChatInfo');
    const close = document.getElementById('btnClosePanel');

    // ℹ️ 버튼 → ChatUI의 정보 패널 렌더링
    btn?.addEventListener('click', () => {
        const ChatUI = window.CommunityModules.ChatUI;
        const roomId = ChatUI.getCurrentRoomId();
        const roomType = ChatUI.getCurrentRoomType();
        if (roomId) {
            // roomInfo는 roomsCache에서 가져올 수 없으므로 기본 정보 전달
            const headerName = document.getElementById('chatHeaderName')?.textContent || '';
            const roomInfo = roomType === 'dm'
                ? { target_name: headerName }
                : roomType === 'class'
                    ? { class_name: headerName }
                    : { group_name: headerName };
            ChatUI.renderInfoPanel(roomId, roomType, roomInfo);
        }
    });

    close?.addEventListener('click', () => {
        document.getElementById('commInfoPanel').style.display = 'none';
    });
}

// ---- 로그인 안내 ----
function renderLoginPrompt() {
    const container = document.querySelector('.comm-container');
    if (!container) return;
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;flex-direction:column;gap:1rem;">
            <span style="font-size:3rem;">🔒</span>
            <h2 style="color:#e8e8e8;">로그인이 필요합니다</h2>
            <p style="color:#888;">커뮤니티를 이용하려면 먼저 로그인해주세요.</p>
            <a href="../login/login.html" style="padding:12px 32px;background:linear-gradient(135deg,#6e8efb,#a777e3);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;">로그인하기</a>
        </div>
    `;
}

// renderUserMenu는 header.js에서 처리 — 중복 제거됨
