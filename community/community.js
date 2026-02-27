// community.js - 메인 컨트롤러
// Firebase + Supabase 통합 연동 오케스트레이터
(function () {
    // ---- 설정 ----
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";

    const firebaseConfig = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
    };

    // ---- 초기화 ----
    document.addEventListener('DOMContentLoaded', async () => {
        console.log("🏠 Community Controller loading...");

        // SDK 초기화
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const db = firebase.database();

        // 세션 확인 (getSession + onAuthStateChange 이중 체크)
        let session = null;
        try {
            const result = await supabase.auth.getSession();
            session = result.data?.session;
        } catch (e) {
            console.warn("getSession failed:", e);
        }

        if (!session) {
            // onAuthStateChange로 재시도 (토큰 복원 대기)
            session = await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(null), 2000);
                const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
                    clearTimeout(timeout);
                    subscription.unsubscribe();
                    resolve(sess);
                });
            });
        }

        // 헤더 사용자 메뉴 (로그인 여부 무관하게 렌더)
        const userMenu = document.getElementById('userMenu');
        if (session) {
            const userId = session.user.id;
            console.log("✅ Logged in:", userId);
            renderUserMenu(supabase, userMenu, userId);
            initCommunity(db, supabase, userId);
        } else {
            console.log("⚠️ Not logged in");
            if (userMenu) {
                userMenu.innerHTML = `<a href="../login/login.html" class="btn-login-main">로그인</a>`;
            }
            renderLoginPrompt();
        }
    });

    // ---- 커뮤니티 초기화 (로그인 후) ----
    function initCommunity(db, supabase, userId) {
        const { SyncBridge, ChatList, ChatUI, DM } = window.CommunityModules;

        // 1. SyncBridge
        SyncBridge.init(db, supabase, userId);

        // 2. ChatUI
        ChatUI.init();

        // 3. ChatList
        ChatList.init((roomId, roomType, roomInfo) => {
            console.log("📫 Room selected:", roomId, roomType);
            ChatUI.openRoom(roomId, roomType, roomInfo);
            SyncBridge.markAsRead(roomId);
        });

        // 전송 버튼
        document.getElementById('btnSend')?.addEventListener('click', () => ChatUI.sendCurrentMessage());
        document.getElementById('msgInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ChatUI.sendCurrentMessage();
            }
        });

        // 새 대화 모달
        setupNewChatModal(supabase, userId, SyncBridge, DM, ChatUI, ChatList);

        // 모바일 뒤로가기
        document.getElementById('btnBackMobile')?.addEventListener('click', () => {
            document.getElementById('commSidebar')?.classList.remove('hidden');
            document.getElementById('chatActiveArea').style.display = 'none';
            document.getElementById('noChatSelected').style.display = 'flex';
        });

        // 정보 패널
        document.getElementById('btnChatInfo')?.addEventListener('click', () => {
            const panel = document.getElementById('commInfoPanel');
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        });
        document.getElementById('btnClosePanel')?.addEventListener('click', () => {
            document.getElementById('commInfoPanel').style.display = 'none';
        });

        // 클래스 채팅 + 강사 채팅 자동 등록
        registerClassChats(db, userId);

        console.log("🚀 Community fully loaded!");
    }

    // ---- 클래스 채팅 자동 등록 ----
    async function registerClassChats(db, userId) {
        try {
            // 1. 수강 중인 클래스
            const enrollSnap = await db.ref(`enrollments/${userId}`).once('value');
            const enrolled = enrollSnap.val() || {};
            for (const classId of Object.keys(enrolled)) {
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

            // 2. 강사가 생성한 클래스도 자동 등록
            const classesSnap = await db.ref('classes').once('value');
            const allClasses = classesSnap.val() || {};
            for (const [classId, classData] of Object.entries(allClasses)) {
                if (classData.creator_id === userId) {
                    await db.ref(`user_chats/${userId}/${classId}`).update({
                        type: 'class',
                        class_name: classData.title || '클래스',
                        class_image: classData.image_url || ''
                    });
                }
            }
        } catch (e) {
            console.warn("Class chats registration:", e.message);
        }
    }

    // ---- 새 대화 모달 ----
    function setupNewChatModal(supabase, userId, SyncBridge, DM, ChatUI, ChatList) {
        const modal = document.getElementById('newChatModal');
        const input = document.getElementById('userSearchInput');
        const results = document.getElementById('userSearchResults');

        document.getElementById('btnNewChat')?.addEventListener('click', () => {
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

        let searchTimeout;
        input?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const q = input.value.trim();
                if (!q) { results.innerHTML = ''; return; }

                const users = await SyncBridge.searchUsers(q);
                results.innerHTML = users.map(u => `
                    <div class="user-result-item" data-uid="${u.id}">
                        <div class="user-result-avatar" style="${u.profile_image_url ? `background-image:url(${u.profile_image_url})` : ''}">
                            ${!u.profile_image_url ? '👤' : ''}
                        </div>
                        <div>
                            <div class="user-result-name">${u.name || u.email}</div>
                        </div>
                    </div>
                `).join('') || '<p style="color:#666;text-align:center;padding:1rem;">사용자를 찾을 수 없습니다</p>';

                results.querySelectorAll('.user-result-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const targetId = item.dataset.uid;
                        const roomId = await DM.openOrCreateRoom(targetId);
                        modal.style.display = 'none';

                        const profile = await SyncBridge.getUserProfile(targetId);
                        ChatUI.openRoom(roomId, 'dm', {
                            target_id: targetId,
                            target_name: profile.name,
                            target_avatar: profile.profile_image_url
                        });

                        ChatList.loadChatRooms();
                    });
                });
            }, 300);
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

    // ---- 사용자 메뉴 (main.js 스타일 일치) ----
    async function renderUserMenu(supabase, menu, userId) {
        if (!menu) return;
        try {
            const { data: profile } = await supabase.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
            const userName = profile?.name || '사용자';
            const profileImgUrl = profile?.profile_image_url;

            menu.innerHTML = `
                <a href="../mi_pesg/mypage.html" class="user-profile-btn">
                    <div class="user-avatar" style="${profileImgUrl ? `background-image: url(${profileImgUrl})` : ''}">${!profileImgUrl ? '👤' : ''}</div>
                    <span class="user-name">${userName} 님</span>
                </a>
                <button type="button" id="btnLogoutComm" style="color:var(--text-secondary); font-size: 0.8rem; margin-left: 5px; background:none; border:none; cursor:pointer;">로그아웃</button>
            `;

            document.getElementById('btnLogoutComm')?.addEventListener('click', async () => {
                await supabase.auth.signOut();
                window.location.reload();
            });
        } catch (e) {
            console.warn("renderUserMenu error:", e);
        }
    }
})();
