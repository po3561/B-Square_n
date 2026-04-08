// notice.js - 공지사항 통합 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    console.log("📢 B-Square Notice Page Initializing (D1 API)...");

    // BSQ ready + session bootstrap 대기
    const authBootstrapTasks = [];
    if (window.BSQ?.ready?.then) authBootstrapTasks.push(window.BSQ.ready.catch(() => null));
    if (window.BSQ?.sessionBootstrapPromise?.then) authBootstrapTasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
    if (authBootstrapTasks.length) await Promise.all(authBootstrapTasks);

    let currentUser = null;
    const session = window.BSQ?.session;
    if (session) {
        currentUser = session.user;
    }

    // ★ 개발자 모드 가상 운영자
    if (!currentUser && window.__BSQ_DEV_MODE__) {
        currentUser = window.__BSQ_OPERATOR_PROFILE__ || { id: 'OPERATOR_GHOST', name: '운영자', email: 'operator@b-square.kr' };
    }

    const urlParams = new URLSearchParams(window.location.search);
    const initialSearchQuery = String(urlParams.get('q') || '').trim();
    const initialNoticeId = String(urlParams.get('id') || urlParams.get('notice') || '').trim();
    const initialFaqId = String(urlParams.get('faq') || '').trim();

    // 전역 State
    const state = { notices: [], classNotices: [], faqs: [], searchQuery: initialSearchQuery };
    const modalState = window.__BSQ_NOTICE_MODAL_STATE__ || (window.__BSQ_NOTICE_MODAL_STATE__ = { openModals: new Set() });

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function syncModalLock() {
        document.body.classList.toggle('notice-modal-open', modalState.openModals.size > 0);
    }

    function openNoticeModal(modal) {
        if (!modal) return;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        modal.dataset.noticeOpen = 'true';
        modalState.openModals.add(modal);
        syncModalLock();
        return true;
    }

    function closeNoticeModal(modal) {
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.dataset.noticeOpen = 'false';
        modalState.openModals.delete(modal);
        syncModalLock();
        return true;
    }

    window.NoticeUI = {
        openModal: openNoticeModal,
        closeModal: closeNoticeModal,
        isOpen: (modal) => Boolean(modal && modal.dataset.noticeOpen === 'true'),
    };

    // DOM Elements
    const noticeListEl = document.getElementById('noticeList');
    const faqListEl = document.getElementById('faqList');
    const searchInput = document.getElementById('noticeSearchIP');
    const searchButton = document.getElementById('btnSearchNotice');

    function syncSearchUrl() {
        const nextUrl = new URL(window.location.href);
        const query = String(state.searchQuery || '').trim();
        if (query) nextUrl.searchParams.set('q', query);
        else nextUrl.searchParams.delete('q');
        nextUrl.searchParams.delete('id');
        nextUrl.searchParams.delete('notice');
        nextUrl.searchParams.delete('faq');
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }

    function applySearchQuery(value) {
        state.searchQuery = String(value || '').trim();
        if (searchInput && searchInput.value !== state.searchQuery) {
            searchInput.value = state.searchQuery;
        }
        syncSearchUrl();
        renderNotices();
        renderClassNotices();
        renderFaqs();
    }

    function findNoticeById(noticeId) {
        const target = String(noticeId || '').trim();
        if (!target) return null;
        return state.notices.find((item) => String(item.id || item.push_key || '').trim() === target) || null;
    }

    function openFaqById(faqId) {
        const target = String(faqId || '').trim();
        if (!target || !faqListEl) return false;
        const item = Array.from(faqListEl.querySelectorAll('.faq-item')).find((node) => String(node.dataset.id || '') === target);
        if (!item) return false;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('faq', target);
        nextUrl.searchParams.delete('id');
        nextUrl.searchParams.delete('notice');
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        document.querySelectorAll('.faq-item').forEach((node) => node.classList.remove('active'));
        item.classList.add('active');
        const questionButton = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        if (questionButton) questionButton.setAttribute('aria-expanded', 'true');
        if (answer) answer.hidden = false;
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
    }

    // 초기 로드
    await Promise.all([loadNotices(), loadClassNotices(), loadFaqs()]);
    if (initialNoticeId) {
        const notice = findNoticeById(initialNoticeId);
        if (notice) openViewer(notice.id || notice.push_key || initialNoticeId);
    } else if (initialFaqId) {
        openFaqById(initialFaqId);
    }

    // ==== 운영 공지 로드 (D1 API) ====
    async function loadNotices() {
        const result = await window.BSQ.api('/api/notices');
        if (result.success && result.data) {
            state.notices = result.data.map(n => ({ ...n, source: 'official' }));
            renderNotices();
        }
    }

    // ==== 클래스 공지 로드 ====
    async function loadClassNotices() {
        const result = await window.BSQ.api('/api/class-notices');
        if (result.success && result.data) {
            state.classNotices = result.data.map(n => ({ ...n, source: 'class' }));
            renderClassNotices();
        }
    }

    // ==== FAQ 로드 ====
    async function loadFaqs() {
        const result = await window.BSQ.api('/api/faqs');
        if (result.success && result.data) {
            state.faqs = result.data;
            renderFaqs();
        }
    }

    // ==== 공지 렌더링 (운영) ====
    function renderNotices() {
        if (!noticeListEl) return;

        let combined = [...state.notices];
        const query = state.searchQuery.toLowerCase();
        if (query) {
            combined = combined.filter(n => {
                const haystack = [
                    n.title,
                    n.content,
                    n.author_name,
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(query);
            });
        }

        combined.sort((a, b) => {
            if (a.type === 'important' && b.type !== 'important') return -1;
            if (a.type !== 'important' && b.type === 'important') return 1;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        if (combined.length === 0) {
            noticeListEl.innerHTML = `<div class="empty-state">${state.searchQuery ? '검색 결과가 없습니다.' : '등록된 공지사항이 없습니다.'}</div>`;
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
                    <div class="item-title">${escapeHtml(n.title || '')}</div>
                    <div class="item-author">${escapeHtml(n.author_name || '관리자')}</div>
                    <div class="item-date">${dateStr}</div>
                    <div class="item-views">${n.views || 0}</div>
                    <div class="item-meta-mobile">
                        <span class="item-author">${escapeHtml(n.author_name || '관리자')}</span>
                        <span class="item-date">${dateStr}</span>
                        <span class="item-views">조회 ${n.views || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('#noticeList .notice-item').forEach(item => {
            item.addEventListener('click', () => openViewer(item.dataset.id));
        });
    }

    // ==== 클래스 공지 렌더링 ====
    function renderClassNotices() {
        const classNoticeListEl = document.getElementById('classNoticeList');
        if (!classNoticeListEl) return;

        let combined = [...state.classNotices];
        const query = state.searchQuery.toLowerCase();
        if (query) {
            combined = combined.filter((n) => {
                const haystack = [
                    n.title,
                    n.content,
                    n.class_name,
                    n.class_title,
                    n.author_name,
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(query);
            });
        }
        combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        if (combined.length === 0) {
            classNoticeListEl.innerHTML = `<div class="empty-state">${state.searchQuery ? '검색 결과가 없습니다.' : '등록된 클래스 공지사항이 없습니다.'}</div>`;
            return;
        }

        classNoticeListEl.innerHTML = combined.map(n => {
            const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';
            return `
                <div class="notice-item normal" data-classid="${n.class_id || ''}">
                    <div class="item-type"><span class="item-badge class-notice">${n.class_name || '클래스'}</span></div>
                    <div class="item-title">${escapeHtml(n.title || '')}</div>
                    <div class="item-author">${escapeHtml(n.author_name || '강사')}</div>
                    <div class="item-date">${dateStr}</div>
                    <div class="item-views">${n.views || 0}</div>
                    <div class="item-meta-mobile">
                        <span class="item-author">${escapeHtml(n.author_name || '강사')}</span>
                        <span class="item-date">${dateStr}</span>
                        <span class="item-views">조회 ${n.views || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('#classNoticeList .notice-item').forEach(item => {
            item.addEventListener('click', () => {
                const classId = item.dataset.classid;
                if (classId) window.location.href = `../class_view/class_view.html?id=${classId}`;
            });
        });
    }

    // ==== FAQ 렌더링 ====
    function renderFaqs() {
        if (!faqListEl) return;
        let items = [...state.faqs];
        const query = state.searchQuery.toLowerCase();
        if (query) {
            items = items.filter((faq) => {
                const haystack = [faq.question, faq.answer].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(query);
            });
        }
        if (items.length === 0) {
            faqListEl.innerHTML = `<div class="empty-state">${state.searchQuery ? '검색 결과가 없습니다.' : '등록된 FAQ가 없습니다.'}</div>`;
            return;
        }

        faqListEl.innerHTML = items.map((f) => `
            <article class="faq-item" data-id="${f.id}">
                <button type="button" class="faq-question" aria-expanded="false">
                    <span class="faq-question-text"><span class="faq-prefix">Q.</span> ${escapeHtml(f.question || '')}</span>
                    <span class="faq-toggle" aria-hidden="true">⌄</span>
                </button>
                <div class="faq-answer" hidden>${escapeHtml(f.answer || '').replace(/\n/g, '<br>')}</div>
            </article>
        `).join('');

        document.querySelectorAll('.faq-item').forEach((item) => {
            const button = item.querySelector('.faq-question');
            const answer = item.querySelector('.faq-answer');
            if (!button || !answer) return;

            button.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.faq-item').forEach((node) => {
                    node.classList.remove('active');
                    const nodeButton = node.querySelector('.faq-question');
                    const nodeAnswer = node.querySelector('.faq-answer');
                    if (nodeButton) nodeButton.setAttribute('aria-expanded', 'false');
                    if (nodeAnswer) nodeAnswer.hidden = true;
                });

                if (!isActive) {
                    item.classList.add('active');
                    button.setAttribute('aria-expanded', 'true');
                    answer.hidden = false;
                }
            });
        });
    }

    if (searchInput) searchInput.value = state.searchQuery;

    searchInput?.addEventListener('input', (e) => {
        applySearchQuery(e.target.value);
    });

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applySearchQuery(e.target.value);
        }
    });

    searchButton?.addEventListener('click', () => {
        applySearchQuery(searchInput?.value || '');
    });

    // ==== VIEWER LOGIC (D1 API) ====
    const viewerModal = document.getElementById('viewerModal');
    let currentOpenNoticeId = null;

    async function openViewer(noticeId) {
        currentOpenNoticeId = noticeId;
        const notice = findNoticeById(noticeId);
        if (!notice) return;

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('id', String(notice.id || notice.push_key || noticeId).trim());
        nextUrl.searchParams.delete('notice');
        nextUrl.searchParams.delete('faq');
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

        // 조회수 증가 (D1 API)
        window.BSQ.api('/api/notices', {
            method: 'POST',
            body: JSON.stringify({ action: 'increment_views', notice_id: noticeId })
        });

        document.getElementById('viewerTypeBadge').className = notice.type === 'important' ? 'item-badge important' : 'item-badge normal';
        document.getElementById('viewerTypeBadge').textContent = notice.type === 'important' ? '중요' : '일반';
        document.getElementById('viewerTitle').textContent = notice.title;
        document.getElementById('viewerAuthor').textContent = `작성자: ${notice.author_name || '관리자'}`;
        document.getElementById('viewerDate').textContent = `등록일: ${new Date(notice.created_at).toLocaleString()}`;
        document.getElementById('viewerViews').textContent = `조회수: ${(notice.views || 0) + 1}`;
        document.getElementById('viewerContent').innerHTML = (notice.content || '').replace(/\n/g, '<br>');

        if (window.NoticeAdmin && window.NoticeAdmin.onViewerOpen) window.NoticeAdmin.onViewerOpen(notice);

        openNoticeModal(viewerModal);
        loadNoticeDetail(noticeId);
    }

    async function loadNoticeDetail(noticeId) {
        const result = await window.BSQ.api(`/api/notices?id=${noticeId}`);
        if (!result.success || !result.data) return;

        const data = result.data;
        document.getElementById('likeCount').textContent = data.like_count || 0;
        document.getElementById('commentCount').textContent = (data.comments || []).length;

        const commentsList = document.getElementById('commentsList');
        commentsList.innerHTML = (data.comments || []).map(c => `
            <div class="comment-item">
                <div class="comment-meta">
                    <span class="comment-author">${escapeHtml(c.user_name || '')}</span>
                    <span class="comment-date">${new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.content || '').replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');

        // 좋아요 활성 상태 (간단 처리)
        const btnLike = document.getElementById('btnLikeNotice');
        if (btnLike) btnLike.classList.remove('active');
    }

    document.getElementById('btnViewerClose')?.addEventListener('click', () => {
        closeNoticeModal(viewerModal);
        currentOpenNoticeId = null;
    });

    [viewerModal, document.getElementById('editorModal')].filter(Boolean).forEach((modal) => {
        modal.addEventListener('click', (event) => {
            if (event.target !== modal) return;
            closeNoticeModal(modal);
            if (modal === viewerModal) currentOpenNoticeId = null;
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (window.NoticeUI?.isOpen(viewerModal)) {
            closeNoticeModal(viewerModal);
            currentOpenNoticeId = null;
        }
        const editorModal = document.getElementById('editorModal');
        if (window.NoticeUI?.isOpen(editorModal)) {
            closeNoticeModal(editorModal);
        }
    });

    // ==== LIKES (D1 API) ====
    document.getElementById('btnLikeNotice')?.addEventListener('click', async () => {
        if (!currentUser) return alert('로그인이 필요합니다.');
        if (!currentOpenNoticeId) return;

        const result = await window.BSQ.api('/api/notices', {
            method: 'POST',
            body: JSON.stringify({ action: 'toggle_like', notice_id: currentOpenNoticeId, user_id: currentUser.id })
        });

        if (result.success) {
            document.getElementById('likeCount').textContent = result.data.count;
            const btnLike = document.getElementById('btnLikeNotice');
            if (result.data.liked) btnLike.classList.add('active');
            else btnLike.classList.remove('active');
        }
    });

    // ==== COMMENTS (D1 API) ====
    document.getElementById('btnSubmitComment')?.addEventListener('click', async () => {
        if (!currentUser) return alert('로그인이 필요합니다.');
        if (!currentOpenNoticeId) return;

        const commentInput = document.getElementById('commentInput');
        const content = commentInput.value.trim();
        if (!content) return;

        await window.BSQ.api('/api/notices', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add_comment',
                notice_id: currentOpenNoticeId,
                user_id: currentUser.id,
                user_name: currentUser.name || '사용자',
                content
            })
        });

        commentInput.value = '';
        loadNoticeDetail(currentOpenNoticeId);
    });
});
