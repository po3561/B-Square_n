// mypage.js - Orchestrator
document.addEventListener('DOMContentLoaded', async () => {
    // 1. BSQ 서버 초기화 대기
    if (!window.BSQ) {
        console.error('[Mypage] BSQ_SERVER가 로드되지 않았습니다.');
        return;
    }
    const bsq = await window.BSQ.ready;
    const { supabase, db, firebaseUser } = bsq;

    // 2. Auth Check (Supabase 기반)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("로그인이 필요한 페이지입니다.");
        window.location.href = '../login/login.html';
        return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // 즉시 이메일 표시
    if (document.getElementById('displayEmail')) {
        document.getElementById('displayEmail').textContent = userEmail;
    }

    // 3. Tab Initialization (클라이언트 통일성 있게 전달)
    if (window.initProfileTab) window.initProfileTab(supabase, userId, userEmail);
    if (window.initClassesTab) window.initClassesTab(db, userId);
    if (window.initSecurityTab) window.initSecurityTab(supabase, userId, db);
    if (window.initChatSubTab) window.initChatSubTab(supabase, db, userId);

    // 4. Tab Switching Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.mypage-tab');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabs.forEach(t => t.classList.remove('active'));
            const targetTab = document.getElementById(targetId);
            if (targetTab) targetTab.classList.add('active');
        });
    });

    // 5. Global Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = '../bsnnnnnnnnnnnnnnnnnn/index.html';
        });
    }
});

