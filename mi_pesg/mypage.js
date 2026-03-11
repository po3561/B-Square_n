// mypage.js - Orchestrator
// header.js가 Supabase/Firebase 초기화 처리

document.addEventListener('DOMContentLoaded', async () => {
    // ★ BSQ.ready로 서버 초기화 대기 (폴링 제거)
    if (window.BSQ && window.BSQ.ready) {
        await window.BSQ.ready;
    } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const supabaseClient = window.supabaseClient;

    // 2. Auth Check
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        alert("로그인이 필요한 페이지입니다.");
        window.location.href = '../login/login.html';
        return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // 즉시 이메일 표시
    document.getElementById('displayEmail').textContent = userEmail;

    // 3. Tab Initialization (Call modules)
    // Note: ensure tab_*.js files are loaded via HTML
    if (window.initProfileTab) window.initProfileTab(supabaseClient, userId, userEmail);
    if (window.initClassesTab) window.initClassesTab(firebase, userId);
    if (window.initSecurityTab) window.initSecurityTab(supabaseClient, userId, firebase);
    if (window.initChatSubTab) window.initChatSubTab(supabaseClient, userId);

    // 4. Tab Switching Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.mypage-tab');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            // Update Sidebar UI
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update Content UI
            tabs.forEach(t => t.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // 5. Global Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = '../bsnnnnnnnnnnnnnnnnnn/index.html';
        });
    }
});
