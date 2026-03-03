// notice.js - 공지사항 통합 (운영 공지 + 클래스 공지) + 읽기/좋아요/댓글/조회수
document.addEventListener('DOMContentLoaded', async () => {
    console.log("📢 B-Square Notice Page Initializing...");

    // Supabase & Firebase 초기화 대기 (header.js에서 처리됨)
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

    const supabase = window.supabaseClient;
    const db = firebase.database();

    // Auth Check (header.js에서 유저메뉴 처리됨)
    let currentUser = null;
    try {
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session) {
            const { data: profile } = await supabase.from('users').select('*').eq('id', authData.session.user.id).single();
            currentUser = profile;
        }
    } catch (e) {
        console.warn("Auth check failed:", e);
    }

    // 전역 State
    const state = {
        notices: [],        // 운영 공지
        classNotices: [],   // 클래스 공지
        faqs: [],
        searchQuery: ''
    };

    // DOM Elements
    const noticeListEl = document.getElementById('noticeList');
    const faqListEl = document.getElementById('faqList');
    const searchInput = document.getElementById('noticeSearchIP');

    // ==== INIT FETCH ====
    loadNotices();
    loadClassNotices();
    loadFaqs();

    // ==== 운영 공지 로드 ====
    function loadNotices() {
        db.ref('notices').on('value', (snap) => {
            state.notices = [];
            snap.forEach(child => {
                const data = child.val();
                if (!data.is_hidden || window.__BSQ_DEV_MODE__) {
                    state.notices.push({
                        id: child.key,
                        source: 'official',
                        ...data
                    });
                }
            });
            renderNotices();
        });
    }

    // ==== 클래스 공지 통합 로드 ====
    function loadClassNotices() {
        db.ref('class_notices').on('value', (snap) => {
            state.classNotices = [];
            snap.forEach(classSnap => {
                const classId = classSnap.key;
                classSnap.forEach(noticeSnap => {
                    const data = noticeSnap.val();
                    state.classNotices.push({
                        id: noticeSnap.key,
                        source: 'class',
                        classId: classId,
                        className: data.class_name || '클래스',
                        ...data
                    });
                });
            });
            renderClassNotices();
        });
    }

    // ==== 공지 렌더링 (운영) ====
    function renderNotices() {
        if (!noticeListEl) return;

        let combined = [...state.notices];

        const query = state.searchQuery.toLowerCase();
        if (query) {
            combined = combined.filter(n =>
                (n.title || '').toLowerCase().includes(query) ||
                (n.content || '').toLowerCase().includes(query)
            );
        }

        combined.sort((a, b) => {
            if (a.type === 'important' && b.type !== 'important') return -1;
            if (a.type !== 'important' && b.type === 'important') return 1;
            return (b.created_at || 0) - (a.created_at || 0);
        });

        if (combined.length === 0) {
            noticeListEl.innerHTML = `<div class="empty-state">등록된 공지사항이 없습니다.</div>`;
            return;
        }

        noticeListEl.innerHTML = combined.map(n => {
            const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

            let badgeClass = n.type === 'important' ? 'important' : 'normal';
            let badgeText = n.type === 'important' ? '중요' : '일반';
            const rowClass = n.type === 'important' ? 'is-important' : '';

            return `
                <div class="notice-item ${rowClass}" data-id="${n.id}" data-source="${n.source}">
                    <div class="item-type"><span class="item-badge ${badgeClass}">${badgeText}</span></div>
                    <div class="item-title">${n.title}</div>
                    <div class="item-author">${n.author_name || '관리자'}</div>
                    <div class="item-date">${dateStr}</div>
                    <div class="item-views">${n.views || 0}</div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('#noticeList .notice-item').forEach(item => {
            item.addEventListener('click', () => {
                openViewer(item.dataset.id);
            });
        });
    }

    // ==== 렌더링 (클래스별 공지) ====
    function renderClassNotices() {
        const classNoticeListEl = document.getElementById('classNoticeList');
        if (!classNoticeListEl) return;

        let combined = [...state.classNotices];

        combined.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        if (combined.length === 0) {
            classNoticeListEl.innerHTML = `<div class="empty-state">등록된 클래스 공지사항이 없습니다.</div>`;
            return;
        }

        classNoticeListEl.innerHTML = combined.map(n => {
            const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';
            return `
                <div class="notice-item normal" data-classid="${n.classId || ''}">
                    <div class="item-type"><span class="item-badge class-notice">${n.className || '클래스'}</span></div>
                    <div class="item-title">${n.title}</div>
                    <div class="item-author">${n.author_name || '강사'}</div>
                    <div class="item-date">${dateStr}</div>
                    <div class="item-views">${n.views || 0}</div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('#classNoticeList .notice-item').forEach(item => {
            item.addEventListener('click', () => {
                const classId = item.dataset.classid;
                if (classId) {
                    window.location.href = `../class_view/class_view.html?id=${classId}`;
                }
            });
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
            state.faqs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
                <div class="faq-answer">${(f.answer || '').replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');

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

        db.ref(`notices/${noticeId}/views`).transaction((currentViews) => {
            return (currentViews || 0) + 1;
        });

        document.getElementById('viewerTypeBadge').className = notice.type === 'important' ? 'item-badge important' : 'item-badge normal';
        document.getElementById('viewerTypeBadge').textContent = notice.type === 'important' ? '중요' : '일반';

        document.getElementById('viewerTitle').textContent = notice.title;
        document.getElementById('viewerAuthor').textContent = `작성자: ${notice.author_name || '관리자'}`;
        document.getElementById('viewerDate').textContent = `등록일: ${new Date(notice.created_at).toLocaleString()}`;
        document.getElementById('viewerViews').textContent = `조회수: ${(notice.views || 0) + 1}`;

        document.getElementById('viewerContent').innerHTML = (notice.content || '').replace(/\n/g, '<br>');

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
            await ref.remove();
        } else {
            await ref.set(true);
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
                    <div class="comment-text">${(c.content || '').replace(/\n/g, '<br>')}</div>
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
