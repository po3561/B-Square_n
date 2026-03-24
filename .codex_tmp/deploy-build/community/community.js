// community.js - 커뮤니티 채팅 메인 컨트롤러 (D1 API 버전)
// Firebase/Supabase 의존성 완전 제거 → BSQ.api 기반
document.addEventListener('DOMContentLoaded', async () => {
    // ---- BSQ.ready 대기 ----
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    // ---- 세션 및 운영자 확인 ----
    const isOperator = window.__BSQ_DEV_MODE__ === true;
    const session = window.BSQ?.session;

    if ((!session || !session.user) && !isOperator) {
        renderLoginPrompt();
        return;
    }

    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;

    if (isOperator) {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.innerHTML = `<div class="user-profile-btn"><span class="user-avatar">🛡️</span><span class="user-name">운영자 님</span></div>`;
    }

    // ---- 모듈 초기화 (D1 API 기반) ----
    const SyncBridge = window.CommunityModules.SyncBridge;
    const ChatList = window.CommunityModules.ChatList;
    const ChatUI = window.CommunityModules.ChatUI;

    SyncBridge.init(null, null, userId); // Firebase/Supabase 인자 null

    if (ChatUI && typeof ChatUI.init === 'function') ChatUI.init();

    // 방 선택 콜백
    ChatList.init((roomId, type, roomInfo) => {
        if (ChatUI && typeof ChatUI.openRoom === 'function') {
            ChatUI.openRoom(roomId, type, roomInfo);
        }
        ChatList.setActiveRoom(roomId);
        document.getElementById('commSidebar')?.classList.add('hidden');
    });

    // 전송 버튼
    document.getElementById('btnSend')?.addEventListener('click', () => {
        if (ChatUI && typeof ChatUI.sendCurrentMessage === 'function') ChatUI.sendCurrentMessage();
    });
    document.getElementById('msgInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (ChatUI && typeof ChatUI.sendCurrentMessage === 'function') ChatUI.sendCurrentMessage();
        }
    });

    // 모바일 뒤로가기
    document.getElementById('btnBackMobile')?.addEventListener('click', () => {
        document.getElementById('commSidebar')?.classList.remove('hidden');
    });

    // 클래스 채팅 자동 등록 (D1 API)
    registerClassChats(userId);

    // ---- 햄버거 메뉴 ----
    setupHamburgerMenu(userId, SyncBridge, ChatUI, ChatList);

    // ---- 새 대화 모달 ----
    setupNewChatModal(userId, SyncBridge, ChatUI, ChatList);

    // ---- 그룹 채팅 모달 ----
    setupGroupChatModal(userId, SyncBridge, ChatList);

    // ---- 연락처 모달 ----
    setupContactModal(userId, SyncBridge, ChatUI, ChatList);

    // ---- 정보 패널 ----
    setupInfoPanel();

    console.log("✅ Community loaded (D1 API) for:", userId);
});

// ---- 클래스 채팅 자동 등록 (D1 API) ----
async function registerClassChats(userId) {
    try {
        const enrollRes = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
        const enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];

        for (const enroll of enrollments) {
            // user_chats에 이미 등록되어있는지 확인 후 자동 추가
            await window.BSQ.api('/api/user-chats', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'class',
                    room_id: enroll.class_id,
                    class_name: enroll.title || '클래스',
                    class_image: enroll.image_url || '',
                    class_category: enroll.category || '',
                    is_instructor: String(enroll.instructor_id || '') === String(userId)
                })
            }).catch(() => {});
        }
    } catch (e) {
        console.warn("클래스 채팅 자동 등록 실패:", e);
    }
}

// ---- 로그인 프롬프트 ----
function renderLoginPrompt() {
    const main = document.querySelector('.comm-container');
    if (main) {
        main.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100vh; width:100%; flex-direction:column; gap:20px; text-align:center;">
                <span style="font-size:4rem;">🔒</span>
                <h2 style="margin:0;">로그인이 필요합니다</h2>
                <p style="color:#888;">커뮤니티 기능은 로그인 후 이용 가능합니다.</p>
                <button onclick="location.href='../login/login.html'" style="padding:12px 32px; border-radius:12px; background:linear-gradient(135deg,#6e8efb,#a777e3); color:white; border:none; font-weight:bold; cursor:pointer;">로그인하기</button>
            </div>
        `;
    }
}

// ---- 햄버거 메뉴 ----
function setupHamburgerMenu(userId, SyncBridge, ChatUI, ChatList) {
    const btn = document.getElementById('commHamburgerBtn') || document.querySelector('.comm-nav-rail .btn-hamburger');
    const menu = document.getElementById('hamburgerMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { menu.style.display = 'none'; });

    document.getElementById('hmClassList')?.addEventListener('click', () => { location.href = '../class/class_list.html'; });
    document.getElementById('hmBillingInfo')?.addEventListener('click', () => { location.href = '../mi_pesg/mypage.html'; });
    document.getElementById('hmSettings')?.addEventListener('click', () => { location.href = '../mi_pesg/mypage.html'; });
    document.getElementById('hmContacts')?.addEventListener('click', () => {
        document.getElementById('contactModal').style.display = 'flex';
        loadContacts(userId);
    });
}

// ---- 새 대화 모달 (D1 API) ----
function setupNewChatModal(userId, SyncBridge, ChatUI, ChatList) {
    const modal = document.getElementById('newChatModal');
    const closeBtn = document.getElementById('btnCloseModal');
    const searchInput = document.getElementById('userSearchInput');
    const resultsList = document.getElementById('userSearchResults');

    document.getElementById('btnNewChat')?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
    });
    closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });

    let searchTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) { resultsList.innerHTML = ''; return; }

            const users = await SyncBridge.searchUsers(query);
            resultsList.innerHTML = users.map(u => `
                <div class="user-search-item" data-uid="${u.id}" data-name="${u.name || ''}" data-avatar="${u.profile_image_url || ''}">
                    <div class="user-avatar-mini" style="${u.profile_image_url ? `background-image:url(${u.profile_image_url})` : ''}">
                        ${!u.profile_image_url ? '👤' : ''}
                    </div>
                    <div>
                        <strong>${u.name || '사용자'}</strong>
                        <span style="font-size:0.8rem; color:#888; margin-left:8px;">${u.email || ''}</span>
                    </div>
                </div>
            `).join('') || '<p style="color:#888; text-align:center; padding:1rem;">검색 결과 없음</p>';

            resultsList.querySelectorAll('.user-search-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const targetId = item.dataset.uid;
                    const targetName = item.dataset.name;
                    const targetAvatar = item.dataset.avatar;

                    // DM 생성
                    const res = await window.BSQ.api('/api/user-chats', {
                        method: 'POST',
                        body: JSON.stringify({ user_id: userId, target_user_id: targetId, target_name: targetName, target_avatar: targetAvatar })
                    });

                    if (res?.success) {
                        modal.style.display = 'none';
                        ChatList.loadChatRooms();
                        alert(`${targetName}님과의 대화방이 생성되었습니다.`);
                    } else {
                        alert('대화방 생성 실패: ' + (res?.error || ''));
                    }
                });
            });
        }, 300);
    });
}

// ---- 그룹 채팅 모달 (D1 API) ----
function setupGroupChatModal(userId, SyncBridge, ChatList) {
    const modal = document.getElementById('groupChatModal');
    const closeBtn = document.getElementById('btnCloseGroupModal');
    const searchInput = document.getElementById('groupSearchInput');
    const resultsList = document.getElementById('groupSearchResults');
    const selectedMembers = document.getElementById('selectedMembers');
    const btnCreate = document.getElementById('btnCreateGroup');

    let membersList = [];

    document.getElementById('hmGroupChat')?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
    });
    closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });

    let searchTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) { resultsList.innerHTML = ''; return; }

            const users = await SyncBridge.searchUsers(query);
            resultsList.innerHTML = users.filter(u => !membersList.includes(u.id)).map(u => `
                <div class="user-search-item" data-uid="${u.id}" data-name="${u.name || '사용자'}">
                    <div class="user-avatar-mini">👤</div>
                    <strong>${u.name || '사용자'}</strong>
                </div>
            `).join('');

            resultsList.querySelectorAll('.user-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const uid = item.dataset.uid;
                    const name = item.dataset.name;
                    if (!membersList.includes(uid)) {
                        membersList.push(uid);
                        renderSelectedMembers();
                    }
                });
            });
        }, 300);
    });

    function renderSelectedMembers() {
        if (!selectedMembers) return;
        selectedMembers.innerHTML = membersList.map(uid =>
            `<span class="member-chip">${uid.substring(0, 8)}... <button onclick="this.parentElement.remove()">✕</button></span>`
        ).join('');
    }

    btnCreate?.addEventListener('click', async () => {
        const name = document.getElementById('groupNameInput')?.value.trim();
        if (!name) { alert('그룹 이름을 입력하세요.'); return; }

        const res = await window.BSQ.api('/api/group-chats', {
            method: 'POST',
            body: JSON.stringify({ name, members: membersList, created_by: userId })
        });

        if (res?.success) {
            modal.style.display = 'none';
            ChatList.loadChatRooms();
            alert('그룹 채팅이 생성되었습니다.');
            membersList = [];
        } else {
            alert('그룹 생성 실패: ' + (res?.error || ''));
        }
    });
}

// ---- 연락처 모달 (D1 API) ----
function setupContactModal(userId, SyncBridge, ChatUI, ChatList) {
    const modal = document.getElementById('contactModal');
    const closeBtn = document.getElementById('btnCloseContactModal');
    const searchInput = document.getElementById('contactSearchInput');
    const resultsList = document.getElementById('contactSearchResults');

    closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });

    let searchTimer;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) { resultsList.innerHTML = ''; return; }

            const users = await SyncBridge.searchUsers(query);
            resultsList.innerHTML = users.map(u => `
                <div class="user-search-item" data-uid="${u.id}" data-name="${u.name || '사용자'}">
                    <div class="user-avatar-mini">👤</div>
                    <strong>${u.name || '사용자'}</strong>
                    <button class="btn-add-contact" data-uid="${u.id}" data-name="${u.name || ''}">+ 추가</button>
                </div>
            `).join('');

            resultsList.querySelectorAll('.btn-add-contact').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const res = await window.BSQ.api('/api/contacts', {
                        method: 'POST',
                        body: JSON.stringify({ user_id: userId, target_user_id: btn.dataset.uid, name: btn.dataset.name })
                    });
                    if (res?.success) {
                        alert('연락처에 추가되었습니다.');
                        loadContacts(userId);
                    }
                });
            });
        }, 300);
    });
}

async function loadContacts(userId) {
    const contactList = document.getElementById('contactList');
    if (!contactList) return;

    try {
        const res = await window.BSQ.api(`/api/contacts?user_id=${userId}`);
        const contacts = res?.success ? (res.data || []) : [];

        if (contacts.length === 0) {
            contactList.innerHTML = '<p style="color:#888; text-align:center; padding:1rem;">등록된 연락처가 없습니다.</p>';
            return;
        }

        contactList.innerHTML = contacts.map(c => `
            <div class="contact-item" style="display:flex; align-items:center; gap:12px; padding:10px; border-radius:12px; background:rgba(255,255,255,0.03); margin-bottom:8px;">
                <div style="width:40px;height:40px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                    ${c.avatar ? `<img src="${c.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '👤'}
                </div>
                <div style="flex:1;">
                    <strong>${c.name || c.real_name || '사용자'}</strong>
                    ${c.memo ? `<p style="font-size:0.8rem;color:#888;margin:0;">${c.memo}</p>` : ''}
                </div>
                <button style="background:none;border:none;color:#ff4757;cursor:pointer;" onclick="deleteContact('${userId}','${c.target_user_id}')">🗑️</button>
            </div>
        `).join('');
    } catch (e) {
        contactList.innerHTML = '<p style="color:#ff4757; text-align:center;">연락처 로드 실패</p>';
    }
}

window.deleteContact = async function(userId, targetId) {
    if (!confirm('이 연락처를 삭제하시겠습니까?')) return;
    await window.BSQ.api(`/api/contacts?user_id=${userId}&target_user_id=${targetId}`, { method: 'DELETE' });
    loadContacts(userId);
};

// ---- 정보 패널 ----
function setupInfoPanel() {
    const panel = document.getElementById('commInfoPanel');
    const btnInfo = document.getElementById('btnChatInfo');
    const btnClose = document.getElementById('btnClosePanel');

    btnInfo?.addEventListener('click', () => {
        panel?.classList.toggle('open');
    });
    btnClose?.addEventListener('click', () => {
        panel?.classList.remove('open');
    });
}
