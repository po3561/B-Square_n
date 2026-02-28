// class_list.js
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Supabase/Firebase 초기화
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
    };

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.database();

    // 2. 헤더 유저 메뉴 (프로필 / 로그아웃)
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userMenu = document.getElementById('userMenu');

    if (session) {
        const userId = session.user.id;
        const { data: profile } = await supabaseClient.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
        userMenu.innerHTML = `
            <a href="../mi_pesg/mypage.html" class="user-profile-btn" style="display:flex; align-items:center; gap:8px;">
                <div class="user-avatar" style="width:32px; height:32px; border-radius:50%; background:#444; background-image:url(${profile?.profile_image_url || ''}); background-size:cover; display:flex; align-items:center; justify-content:center; font-size:1rem;">${!profile?.profile_image_url ? '👤' : ''}</div>
                <span class="user-name" style="font-size:0.9rem; color:#fff;">${profile?.name || '사용자'} 님</span>
            </a>
            <button type="button" id="btnLogout" style="color:var(--text-secondary); font-size: 0.8rem; background:none; border:none; cursor:pointer;">로그아웃</button>
        `;
        document.getElementById('btnLogout').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.reload();
        });
    } else {
        userMenu.innerHTML = `<a href="../login/login.html" class="btn-login-main" style="padding: 8px 16px; background: #fff; color: #000; border-radius: 20px; font-weight: 600;">로그인</a>`;
    }

    // 3. 클래스 전체 목록 불러오기
    let allClasses = [];
    let currentCategory = 'all';

    db.ref('classes').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allClasses = Object.entries(data).map(([id, val]) => ({ id, ...val }));

            // 최신순 (생성 내림차순)으로 전체 정렬
            allClasses.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }
        renderClasses();
    });

    // 4. 필터 클릭 이벤트
    const categoryLinks = document.querySelectorAll('#categoryFilter a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            categoryLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            currentCategory = link.dataset.cat;
            renderClasses();
        });
    });

    // 5. 클래스 필터링 및 렌더링
    function renderClasses() {
        const grid = document.getElementById('allClassGrid');
        let filteredClasses = allClasses;

        if (currentCategory !== 'all') {
            filteredClasses = allClasses.filter(c => c.category === currentCategory);
        }

        document.getElementById('totalClassCount').textContent = `총 ${filteredClasses.length}개`;

        if (filteredClasses.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem; color:#888;">해당 카테고리에 등록된 클래스가 없습니다.</div>`;
            return;
        }

        const now = Date.now();
        // 48시간 = 2일
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        // 카드 생성
        const cardsHtml = filteredClasses.map(cls => {
            // New 뱃지 검사 (생성 시각 기준 48시간 이내 생성된 경우)
            const isNew = cls.created_at && (now - cls.created_at < FORTY_EIGHT_HOURS);
            const newBadgeHtml = isNew ? `<div class="badge-new">NEW</div>` : '';

            // 썸네일 스타일 처리
            const bgStyle = cls.thumbnail_url
                ? `background-image: url('${cls.thumbnail_url}');`
                : '';

            return `
                <div class="class-card template-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer; position:relative; overflow:visible;">
                    ${newBadgeHtml}
                    <div class="card-thumbnail" style="${bgStyle}">
                        <!-- 이미지가 없는 경우 표시할 예비용 컨텐츠 -->
                        ${!cls.thumbnail_url ? '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#555;">No Image</div>' : ''}
                    </div>
                    <div class="card-info" style="padding: 10px 0;">
                        <span class="category" style="color: var(--text-secondary); font-size: 0.8rem; display: block; margin-bottom: 4px;">${cls.category || '미분류'}</span>
                        <h4 class="title" style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 8px;">${cls.title || '제목 없음'}</h4>
                        <div class="stats" style="display:flex; gap: 10px; font-size: 0.85rem; color:#888;">
                            <span class="likes">❤️ ${cls.likes || 0}</span>
                            <span class="rating">⭐ 5.0</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHtml;
    }
});
