// header.js - 모든 페이지에 공통 헤더/푸터 주입 및 유저 메뉴 설정

document.addEventListener('DOMContentLoaded', async () => {
    // ---- 1. Supabase / Firebase 전역 초기화 상태 확인 ----
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";

    // Create Supabase client if not exists
    let client = window.supabaseClient;
    if (!client && window.supabase) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = client; // 전역 저장
    }

    // ---- 2. 사용자 세션 확인 ----
    let currentUser = null;
    let currentSession = null;

    if (client) {
        try {
            const { data } = await client.auth.getSession();
            currentSession = data?.session;

            if (currentSession) {
                const userId = currentSession.user.id;
                const { data: profile } = await client.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
                currentUser = profile;
            }
        } catch (e) { console.warn("Session check failed:", e); }
    }

    // ---- 3. 헤더 사용자 메뉴 렌더링 ----
    const renderUserMenus = () => {
        document.querySelectorAll('#userMenu').forEach(menuEl => {
            if (currentSession && currentUser) {
                menuEl.innerHTML = `
                    <a href="../mi_pesg/mypage.html" class="user-profile-btn" style="text-decoration:none;">
                        <div class="user-avatar" style="background-image:url(${currentUser.profile_image_url || ''});">
                            ${!currentUser.profile_image_url ? '👤' : ''}
                        </div>
                        <span class="user-name">${currentUser.name || '사용자'}</span>
                    </a>
                    <button type="button" class="btn-logout" id="headerBtnLogout" style="color:var(--text-secondary); font-size: 0.8rem; background:none; border:none; cursor:pointer;" onclick="handleGlobalLogout()">로그아웃</button>
                `;
            } else {
                menuEl.innerHTML = `
                    <a href="../login/login.html" class="btn-login-main">로그인</a>
                `;
            }
        });
    };

    // 초기 렌더링 수행 (이미 HTML에 하드코딩된 부분 교체)
    renderUserMenus();
});

// 전역 로그아웃 함수
window.handleGlobalLogout = async function () {
    if (window.supabaseClient) {
        await window.supabaseClient.auth.signOut();
        window.location.href = '../bsnnnnnnnnnnnnnnnnnn/index.html';
    }
};
