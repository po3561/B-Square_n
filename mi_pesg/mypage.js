// mypage.js - Orchestrator
const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
    authDomain: "b-square-39b11.firebaseapp.com",
    databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
    projectId: "b-square-39b11",
    storageBucket: "b-square-39b11.firebasestorage.app",
    messagingSenderId: "1012056920961",
    appId: "1:1012056920961:web:8342bfdf123b78f6a38e80",
    measurementId: "G-TLQFK7FDY9"
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Firebase Initialize
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

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
