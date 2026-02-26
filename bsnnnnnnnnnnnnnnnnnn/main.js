// main.js

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 수파베이스 초기화
    const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    // 2. 파이어베이스 초기화
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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    const userMenu = document.getElementById('userMenu');
    if (!userMenu) return;

    // 현재 유저 세션 체크
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        const userId = session.user.id;
        const { data: profile } = await supabase.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
        const userName = profile?.name || '사용자';
        const profileImgUrl = profile?.profile_image_url;

        userMenu.innerHTML = `
            <a href="../mi_pesg/mypage.html" class="user-profile-btn">
                <div class="user-avatar" id="headerAvatar" style="${profileImgUrl ? `background-image: url(${profileImgUrl})` : ''}">${!profileImgUrl ? '👤' : ''}</div>
                <span class="user-name">${userName} 님</span>
            </a>
            <button type="button" id="btnLogout" style="color:var(--text-secondary); font-size: 0.8rem; margin-left: 5px; background:none; border:none; cursor:pointer;">로그아웃</button>
        `;

        document.getElementById('btnLogout').addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });
    } else {
        userMenu.innerHTML = `<a href="../login/login.html" class="btn-login-main">로그인</a>`;
    }

    // 메인 페이지 클래스 목록 로드 (실시간)
    initRealtimeClasses(supabase);

    // 3. 카테고리 필터링 이벤트 연결
    const categoryLinks = document.querySelectorAll('.category-grid a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryName = link.textContent.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '').trim();
            // 아이콘 제외하고 텍스트만 추출 (예: "💻디자인" -> "디자인")
            filterClassesByCategory(categoryName);

            // 시각적 피드백 (선택된 카테고리 강조 등 - 옵션)
            categoryLinks.forEach(l => l.style.fontWeight = '400');
            link.style.fontWeight = '700';
            link.style.color = 'var(--accent-color)';
        });
    });
});

let globalAllClasses = []; // 필터링을 위한 전역 변수

async function initRealtimeClasses(supabase) {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');
    if (!cardGrid) return;

    console.log("📡 Initializing Realtime Class Listener...");

    const db = firebase.database();
    db.ref('classes').on('value', async (snapshot) => {
        console.log("🔄 Realtime Update Received from Firebase");
        let allClasses = [];

        if (snapshot.exists()) {
            const fbData = snapshot.val();
            Object.keys(fbData).forEach(key => {
                allClasses.push({ ...fbData[key], id: key });
            });
        }

        try {
            const { data: sbData } = await supabase.from('classes').select('*');
            if (sbData) {
                sbData.forEach(cls => {
                    if (!allClasses.some(a => a.supabase_uid === cls.creator_id && a.title === cls.title)) {
                        allClasses.push(cls);
                    }
                });
            }
        } catch (e) {
            console.warn("Supabase load failed, using Firebase only.", e);
        }

        allClasses.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        globalAllClasses = allClasses; // 필터링용 데이터 저장
        renderClassCards(allClasses, cardGrid);
        if (largeGrid) renderClassCards(allClasses, largeGrid);
    });
}

function filterClassesByCategory(categoryName) {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');

    // "전체" 또는 "B-Square" 로고 클릭 시 필터 해제 로직이 필요할 수 있으나, 
    // 여기서는 클릭한 카테고리로 필터링
    const filtered = globalAllClasses.filter(cls =>
        cls.category && cls.category.includes(categoryName)
    );

    renderClassCards(filtered, cardGrid);
    if (largeGrid) renderClassCards(filtered, largeGrid);

    // 스크롤 이동 (선택 사항)
    document.querySelector('.class-lists-section').scrollIntoView({ behavior: 'smooth' });
}

function renderClassCards(classes, container) {
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="empty-state">등록된 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const discountRate = parseInt(cls.discount_rate) || 0;
        const originalPrice = parseInt(cls.price) || 0;
        const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${cls.image_url || 'https://via.placeholder.com/400x250'}" alt="${cls.title}">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
                <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">🔖</button>
                <div class="badge-award">2025<br>어워즈</div>
            </div>
            <div class="card-info">
                <span class="category">${cls.category || '미분류'}</span>
                <h4 class="title">${cls.title}</h4>
                <span class="creator">작성자: ${cls.creator_name || '크리에이터'}</span>
                <div class="meta">
                    <span class="rating" id="rating-${cls.id}">⭐ -</span>
                    <span class="reviews" id="reviews-${cls.id}">(-)</span>
                </div>
                <div class="price-area">
                    ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                    <span class="current-price">${Math.round(currentPrice).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `}).join('');

    // 각 클래스 카드에 실시간 별점/후기수 로드
    const db = firebase.database();
    classes.forEach(cls => {
        db.ref(`reviews/${cls.id}`).on('value', (snap) => {
            const ratingEl = document.getElementById(`rating-${cls.id}`);
            const reviewsEl = document.getElementById(`reviews-${cls.id}`);
            if (!ratingEl || !reviewsEl) return;

            const reviews = snap.val();
            if (!reviews) {
                ratingEl.textContent = '⭐ 0.0';
                reviewsEl.textContent = '(0)';
                return;
            }

            const items = Object.values(reviews);
            const count = items.length;
            const sum = items.reduce((a, b) => a + parseInt(b.rating || 5), 0);
            const avg = (sum / count).toFixed(1);

            ratingEl.textContent = `⭐ ${avg}`;
            reviewsEl.textContent = `(${count})`;
        });
    });
}
