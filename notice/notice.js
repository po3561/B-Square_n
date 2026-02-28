// notice.js - 일반 접속자/회원용 (읽기, 좋아요, 댓글, 조회수)
document.addEventListener('DOMContentLoaded', async () => {
    // Supabase 및 Firebase 초기화 (전역 설정과 동일)
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
    };

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.database();

    // Auth Check
    let currentUser = null;
    const { data: authData } = await supabase.auth.getSession();
    if (authData?.session) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', authData.session.user.id).single();
        currentUser = profile;
        document.getElementById('btnLogin').style.display = 'none';

        const userMenu = document.getElementById('userMenu');
        userMenu.innerHTML = `
            <div class="user-profile">
                <div class="user-avatar" style="${profile?.profile_image_url ? `background-image:url(${profile.profile_image_url});background-size:cover;` : 'background:#444;'}">
                    ${!profile?.profile_image_url ? '👤' : ''}
                </div>
                <span>${profile?.name || '사용자'}</span>
            </div>
        `;
    }

    // 전역 State
    const state = {
        notices: [],
        faqs: [],
        searchQuery: ''
    };

    // DOM Elements
    const noticeListEl = document.getElementById('noticeList');
    const faqListEl = document.getElementById('faqList');
    const searchInput = document.getElementById('noticeSearchIP');
    const btnSearch = document.getElementById('btnSearchNotice');

    // ==== INIT FETCH ====
    loadNotices();
    loadFaqs();

    // ==== NOTICES LOAD ====
    function loadNotices() {
        db.ref('notices').on('value', (snap) => {
            state.notices = [];
            snap.forEach(child => {
                const data = child.val();
                if (!data.is_hidden || window.__BSQ_DEV_MODE__) {
                    state.notices.push({ id: child.key, ...data });
                }
            });

            // 최신순 정렬 (important 우선)
            state.notices.sort((a, b) => {
                if (a.type === 'important' && b.type !== 'important') return -1;
                if (a.type !== 'important' && b.type === 'important') return 1;
                return b.created_at - a.created_at;
            });
            renderNotices();
        });
    }

    function renderNotices() {
        if (!noticeListEl) return;
        const query = state.searchQuery.toLowerCase();
        const filtered = state.notices.filter(n =>
            n.title.toLowerCase().includes(query) ||
            (n.content && n.content.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
            noticeListEl.innerHTML = `<div class="empty-state">등록된 공지사항이 없습니다.</div>`;
            return;
        }

        noticeListEl.innerHTML = filtered.map(n => {
            const dateStr = new Date(n.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const badgeClass = n.type === 'important' ? 'important' : 'normal';
            const badgeText = n.type === 'important' ? '중요' : '일반';
            const rowClass = n.type === 'important' ? 'is-important' : '';

            return `
                <div class="notice-item ${rowClass}" data-id="${n.id}">
                    <div class="item-type"><span class="item-badge ${badgeClass}">${badgeText}</span></div>
                    <div class="item-title">${n.title}</div>
                    <div class="item-author">${n.author_name || '관리자'}</div>
                    <div class="item-date">${dateStr}</div>
                    <div class="item-views">${n.views || 0}</div>
                </div>
            `;
        }).join('');

        // Event Binding for Viewer
        document.querySelectorAll('.notice-item').forEach(item => {
            item.addEventListener('click', () => openViewer(item.dataset.id));
        });
    }

    // ==== FAQS LOAD ====
    function loadFaqs() {
        db.ref('faqs').on('value', (snap) => {
            state.faqs = [];
            snap.forEach(child => {
                const data = child.val();
                if (!data.is_hidden || window.__BSQ_DEV_MODE__) {
                    state.faqs.push({ id: child.key, ...data });
                }
            });
            state.faqs.sort((a, b) => b.created_at - a.created_at);
            renderFaqs();
        });
    }

    function renderFaqs() {
        if (!faqListEl) return;
        if (state.faqs.length === 0) {
            faqListEl.innerHTML = `<div class="empty-state">등록된 FAQ가 없습니다.</div>`;
            return;
        }

        faqListEl.innerHTML = state.faqs.map(f => `
            <div class="faq-item" data-id="${f.id}">
                <div class="faq-question">
                    <div class="faq-question-text">Q. ${f.question}</div>
                    <div class="faq-toggle">▼</div>
                </div>
                <div class="faq-answer">${f.answer.replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');

        // Toggle Expand
        document.querySelectorAll('.faq-item').forEach(item => {
            const q = item.querySelector('.faq-question');
            q.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
                if (!isActive) item.classList.add('active');
            });
        });
    }

    searchInput?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderNotices();
    });

    // ==== VIEWER LOGIC ====
    const viewerModal = document.getElementById('viewerModal');
    let currentOpenNoticeId = null;

    async function openViewer(noticeId) {
        currentOpenNoticeId = noticeId;
        const notice = state.notices.find(n => n.id === noticeId);
        if (!notice) return;

        // DB 조회수 증가
        db.ref(`notices/${noticeId}/views`).transaction((currentViews) => {
            return (currentViews || 0) + 1;
        });

        document.getElementById('viewerTypeBadge').className = notice.type === 'important' ? 'item-badge important' : 'item-badge normal';
        document.getElementById('viewerTypeBadge').textContent = notice.type === 'important' ? '중요' : '일반';

        document.getElementById('viewerTitle').textContent = notice.title;
        document.getElementById('viewerAuthor').textContent = `작성자: ${notice.author_name || '관리자'}`;
        document.getElementById('viewerDate').textContent = `등록일: ${new Date(notice.created_at).toLocaleString()}`;
        document.getElementById('viewerViews').textContent = `조회수: ${(notice.views || 0) + 1}`;

        document.getElementById('viewerContent').innerHTML = notice.content.replace(/\n/g, '<br>');

        // Call Admin Event Dispatcher
        if (window.NoticeAdmin && window.NoticeAdmin.onViewerOpen) {
            window.NoticeAdmin.onViewerOpen(notice);
        }

        viewerModal.style.display = 'flex';
        loadLikes(noticeId);
        loadComments(noticeId);
    }

    document.getElementById('btnViewerClose')?.addEventListener('click', () => {
        viewerModal.style.display = 'none';
        currentOpenNoticeId = null;
    });

    // ==== LIKES ====
    const btnLike = document.getElementById('btnLikeNotice');
    function loadLikes(noticeId) {
        db.ref(`notice_likes/notices/${noticeId}`).on('value', (snap) => {
            const likesCount = snap.numChildren();
            document.getElementById('likeCount').textContent = likesCount;

            if (currentUser && snap.hasChild(currentUser.id)) {
                btnLike.classList.add('active');
            } else {
                btnLike.classList.remove('active');
            }
        });
    }

    btnLike?.addEventListener('click', async () => {
        if (!currentUser) return alert('로그인이 필요합니다.');
        if (!currentOpenNoticeId) return;

        const ref = db.ref(`notice_likes/notices/${currentOpenNoticeId}/${currentUser.id}`);
        const snap = await ref.once('value');
        if (snap.exists()) {
            await ref.remove(); // Unlike
        } else {
            await ref.set(true); // Like
        }
    });

    // ==== COMMENTS ====
    const btnSubmitComment = document.getElementById('btnSubmitComment');
    const commentInput = document.getElementById('commentInput');
    const commentsList = document.getElementById('commentsList');

    function loadComments(noticeId) {
        db.ref(`notice_comments/notices/${noticeId}`).on('value', (snap) => {
            document.getElementById('commentCount').textContent = snap.numChildren();
            const comments = [];
            snap.forEach(c => { comments.push({ id: c.key, ...c.val() }); });

            commentsList.innerHTML = comments.map(c => `
                <div class="comment-item">
                    <div class="comment-meta">
                        <span class="comment-author">${c.user_name}</span>
                        <span class="comment-date">${new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div class="comment-text">${c.content.replace(/\n/g, '<br>')}</div>
                </div>
            `).join('');
        });
    }

    btnSubmitComment?.addEventListener('click', async () => {
        if (!currentUser) return alert('로그인이 필요합니다.');
        if (!currentOpenNoticeId) return;

        const content = commentInput.value.trim();
        if (!content) return;

        await db.ref(`notice_comments/notices/${currentOpenNoticeId}`).push({
            user_id: currentUser.id,
            user_name: currentUser.name || '사용자',
            content: content,
            created_at: firebase.database.ServerValue.TIMESTAMP
        });

        commentInput.value = '';
    });
});
