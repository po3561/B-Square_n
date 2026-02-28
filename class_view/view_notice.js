// view_notice.js - 클래스 개별 공지사항 모듈
window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initNotice = function (db, classId, userId, supabaseClient, hasAccess, isInstructor) {
    console.log("📢 initNotice called for class:", classId);

    const listContainer = document.getElementById('classNoticeList');
    const btnCreate = document.getElementById('btnCreateClassNotice');

    // Editor UI Elements
    const editorModal = document.getElementById('classNoticeEditorModal');
    const ceTargetId = document.getElementById('ceTargetId');
    const ceTitle = document.getElementById('ceTitle');
    const ceContent = document.getElementById('ceContent');
    const ceModalTitle = document.getElementById('ceModalTitle');

    // Viewer UI Elements
    const viewerModal = document.getElementById('classNoticeViewerModal');
    const cvTitle = document.getElementById('cvTitle');
    const cvAuthor = document.getElementById('cvAuthor');
    const cvDate = document.getElementById('cvDate');
    const cvViews = document.getElementById('cvViews');
    const cvContent = document.getElementById('cvContent');
    const btnCvLike = document.getElementById('btnCvLike');
    const cvLikeCount = document.getElementById('cvLikeCount');
    const cvAdminActions = document.getElementById('cvAdminActions');

    const cvCommentsList = document.getElementById('cvCommentsList');
    const cvCommentInput = document.getElementById('cvCommentInput');
    const cvCommentCount = document.getElementById('cvCommentCount');

    let notices = [];
    let currentOpenNoticeId = null;

    // 1. 강사일 경우 작성 버튼 노출
    if (isInstructor || window.__BSQ_DEV_MODE__) {
        if (btnCreate) btnCreate.style.display = 'block';
    }

    // 2. 공지사항 데이터 불러오기
    function loadClassNotices() {
        if (!classId) return;
        db.ref(`class_notices/${classId}`).on('value', (snap) => {
            notices = [];
            snap.forEach(child => {
                notices.push({ id: child.key, ...child.val() });
            });
            notices.sort((a, b) => b.created_at - a.created_at);
            renderNoticeList();
        });
    }

    // 3. 리스트 렌더링
    function renderNoticeList() {
        if (!listContainer) return;
        if (notices.length === 0) {
            listContainer.innerHTML = `<div class="empty-state" style="padding: 3rem; text-align: center; color: var(--comm-text2);">등록된 공지가 없습니다.</div>`;
            return;
        }

        listContainer.innerHTML = notices.map(n => {
            const dateStr = new Date(n.created_at).toLocaleDateString('ko-KR');
            return `
                <div class="notice-item" data-id="${n.id}" style="display:grid; grid-template-columns: 1fr 100px 100px 60px; padding: 16px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor:pointer; align-items:center; transition: background 0.2s;">
                    <div style="font-weight: 500; color: #fff;">${n.title}</div>
                    <div style="color: var(--comm-text2); font-size: 0.85rem; text-align:center;">${n.author_name || '강사'}</div>
                    <div style="color: var(--comm-text2); font-size: 0.85rem; text-align:center;">${dateStr}</div>
                    <div style="color: var(--comm-text2); font-size: 0.85rem; text-align:center;">${n.views || 0}</div>
                </div>
            `;
        }).join('');

        // Event Binding
        listContainer.querySelectorAll('.notice-item').forEach(item => {
            // Hover styling
            item.addEventListener('mouseenter', () => item.style.backgroundColor = 'rgba(255,255,255,0.03)');
            item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');

            // Click to view
            item.addEventListener('click', () => openViewer(item.dataset.id));
        });
    }

    // 4. 새 공지사항 및 수정 모달 (Editor)
    btnCreate?.addEventListener('click', () => {
        openEditor(null);
    });

    function openEditor(noticeData) {
        if (noticeData) {
            ceModalTitle.textContent = '공지사항 수정';
            ceTargetId.value = noticeData.id;
            ceTitle.value = noticeData.title;
            ceContent.value = noticeData.content;
        } else {
            ceModalTitle.textContent = '새 공지사항 등록';
            ceTargetId.value = '';
            ceTitle.value = '';
            ceContent.value = '';
        }
        editorModal.style.display = 'flex';
    }

    document.getElementById('btnCeClose')?.addEventListener('click', () => editorModal.style.display = 'none');
    document.getElementById('btnCeCancel')?.addEventListener('click', () => editorModal.style.display = 'none');

    document.getElementById('btnCeSubmit')?.addEventListener('click', async () => {
        const id = ceTargetId.value;
        const title = ceTitle.value.trim();
        const content = ceContent.value.trim();

        if (!title || !content) return alert('제목과 내용을 모두 입력해주세요.');

        const btn = document.getElementById('btnCeSubmit');
        btn.textContent = '저장 중...';
        btn.disabled = true;

        try {
            let authorName = '강사';
            if (userId) {
                const { data: profile } = await supabaseClient.from('users').select('name').eq('id', userId).single();
                if (profile) authorName = profile.name;
            }

            const payload = {
                title: title,
                content: content,
                updated_at: firebase.database.ServerValue.TIMESTAMP
            };

            if (id) {
                await db.ref(`class_notices/${classId}/${id}`).update(payload);
            } else {
                payload.author_id = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : userId;
                payload.author_name = window.__BSQ_DEV_MODE__ ? '운영자' : authorName;
                payload.created_at = firebase.database.ServerValue.TIMESTAMP;
                payload.views = 0;
                await db.ref(`class_notices/${classId}`).push(payload);
            }

            editorModal.style.display = 'none';
            if (viewerModal.style.display === 'flex') {
                viewerModal.style.display = 'none'; // Re-render closes viewer
            }
        } catch (e) {
            console.error('Notice save failed', e);
            alert('저장에 실패했습니다.');
        } finally {
            btn.textContent = '저장';
            btn.disabled = false;
        }
    });

    // 5. 공지사항 상세 보기 (Viewer)
    function openViewer(id) {
        currentOpenNoticeId = id;
        const n = notices.find(x => x.id === id);
        if (!n) return;

        // DB 조회수 증가
        db.ref(`class_notices/${classId}/${id}/views`).transaction((currentViews) => {
            return (currentViews || 0) + 1;
        });

        cvTitle.textContent = n.title;
        cvAuthor.textContent = `작성자: ${n.author_name || '강사'}`;
        cvDate.textContent = `등록일: ${new Date(n.created_at).toLocaleString()}`;
        cvViews.textContent = `조회수: ${(n.views || 0) + 1}`;
        cvContent.innerHTML = n.content.replace(/\n/g, '<br>');

        // 강사면 수정/삭제 표시
        if (isInstructor || window.__BSQ_DEV_MODE__) {
            cvAdminActions.style.display = 'flex';
        } else {
            cvAdminActions.style.display = 'none';
        }

        viewerModal.style.display = 'flex';
        loadLikes(id);
        loadComments(id);
    }

    document.getElementById('btnCvClose')?.addEventListener('click', () => {
        viewerModal.style.display = 'none';
        currentOpenNoticeId = null;
    });

    // 상세 보기 > 액션 (수정/삭제)
    document.getElementById('btnCvEdit')?.addEventListener('click', () => {
        const n = notices.find(x => x.id === currentOpenNoticeId);
        if (n) openEditor(n);
    });

    document.getElementById('btnCvDelete')?.addEventListener('click', async () => {
        if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;
        try {
            await db.ref(`class_notices/${classId}/${currentOpenNoticeId}`).remove();
            alert('삭제되었습니다.');
            viewerModal.style.display = 'none';
        } catch (e) {
            alert('삭제에 실패했습니다.');
        }
    });

    // 6. 좋아요 연동
    function loadLikes(id) {
        db.ref(`notice_likes/class_notices/${classId}/${id}`).on('value', (snap) => {
            cvLikeCount.textContent = snap.numChildren();
            if (userId && snap.hasChild(userId)) {
                btnCvLike.classList.add('active');
                btnCvLike.style.background = '#ff4d4d';
                btnCvLike.style.color = '#fff';
            } else {
                btnCvLike.classList.remove('active');
                btnCvLike.style.background = 'rgba(255,70,70,0.1)';
                btnCvLike.style.color = '#ff4d4d';
            }
        });
    }

    btnCvLike?.addEventListener('click', async () => {
        if (!userId) {
            if (window.__BSQ_DEV_MODE__) {
                userId = 'OPERATOR_GHOST';
            } else {
                return alert('로그인이 필요합니다.');
            }
        }
        if (!currentOpenNoticeId) return;

        const ref = db.ref(`notice_likes/class_notices/${classId}/${currentOpenNoticeId}/${userId}`);
        const snap = await ref.once('value');
        if (snap.exists()) {
            await ref.remove(); // Unlike
        } else {
            await ref.set(true); // Like
        }
    });

    // 7. 댓글 연동
    function loadComments(id) {
        db.ref(`notice_comments/class_notices/${classId}/${id}`).on('value', (snap) => {
            cvCommentCount.textContent = snap.numChildren();
            const comments = [];
            snap.forEach(c => { comments.push({ id: c.key, ...c.val() }); });

            cvCommentsList.innerHTML = comments.map(c => `
                <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 12px; margin-bottom:10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.85rem;">
                        <span style="font-weight: 600; color: var(--comm-accent);">${c.user_name}</span>
                        <span style="color: var(--comm-text2);">${new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div style="font-size: 0.95rem; line-height: 1.5;">${c.content.replace(/\n/g, '<br>')}</div>
                </div>
            `).join('');
        });
    }

    document.getElementById('btnCvSubmitComment')?.addEventListener('click', async () => {
        let activeUserId = userId;
        let activeUserName = '사용자';

        if (window.__BSQ_DEV_MODE__) {
            activeUserId = 'OPERATOR_GHOST';
            activeUserName = '운영자';
        } else {
            if (!activeUserId) return alert('로그인이 필요합니다.');
            const { data: profile } = await supabaseClient.from('users').select('name').eq('id', activeUserId).single();
            if (profile) activeUserName = profile.name;
        }

        if (!currentOpenNoticeId) return;
        const content = cvCommentInput.value.trim();
        if (!content) return;

        await db.ref(`notice_comments/class_notices/${classId}/${currentOpenNoticeId}`).push({
            user_id: activeUserId,
            user_name: activeUserName,
            content: content,
            created_at: firebase.database.ServerValue.TIMESTAMP
        });

        cvCommentInput.value = '';
    });

    // Initialize
    loadClassNotices();
};
