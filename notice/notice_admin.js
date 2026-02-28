// notice_admin.js - 운영자/개발자모드 전용 (작성, 수정, 삭제, 숨김)
document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.database();

    // Admin Check Logic
    function applyAdminUI() {
        const isAdmin = window.__BSQ_DEV_MODE__ === true;
        if (isAdmin) {
            document.getElementById('btnWriteNotice').style.display = 'inline-block';
            document.getElementById('btnWriteFaq').style.display = 'inline-block';
        }
        return isAdmin;
    }

    // 초기 로드 시 체크
    let isAdmin = applyAdminUI();

    // Dev Mode 레이스 컨디션 대응 (이벤트 리스너)
    window.addEventListener('bsq_dev_mode_activated', () => {
        isAdmin = applyAdminUI();
    });

    // Modal Elements
    const editorModal = document.getElementById('editorModal');
    const editTargetId = document.getElementById('editTargetId');
    const editDataType = document.getElementById('editDataType'); // 'notice' | 'faq'
    const editTitle = document.getElementById('editTitle');
    const editContent = document.getElementById('editContent');
    const editIsHidden = document.getElementById('editIsHidden');
    const typeNormal = document.getElementById('typeNormal');
    const typeImportant = document.getElementById('typeImportant');

    const groupType = document.getElementById('groupType');
    const groupHidden = document.getElementById('groupHidden');
    const modalTitle = document.getElementById('editorModalTitle');

    let currentViewerItem = null;

    // Open Editor (New Notice)
    document.getElementById('btnWriteNotice')?.addEventListener('click', () => {
        openEditor('notice', null);
    });

    // Open Editor (New FAQ)
    document.getElementById('btnWriteFaq')?.addEventListener('click', () => {
        openEditor('faq', null);
    });

    function openEditor(dataType, itemData) {
        editTargetId.value = itemData ? itemData.id : '';
        editDataType.value = dataType;

        if (dataType === 'notice') {
            modalTitle.textContent = itemData ? '공지사항 수정' : '새 공지사항 작성';
            groupType.style.display = 'block';
            document.getElementById('editContentLabel').textContent = '본문';
            editTitle.placeholder = '제목을 입력하세요';
            if (itemData) {
                editTitle.value = itemData.title;
                editContent.value = itemData.content;
                editIsHidden.checked = !!itemData.is_hidden;
                if (itemData.type === 'important') typeImportant.checked = true;
                else typeNormal.checked = true;
            } else {
                editTitle.value = '';
                editContent.value = '';
                editIsHidden.checked = false;
                typeNormal.checked = true;
            }
        } else {
            modalTitle.textContent = itemData ? 'FAQ 수정' : '새 FAQ 작성';
            groupType.style.display = 'none';
            document.getElementById('editContentLabel').textContent = '답변';
            editTitle.placeholder = '질문을 입력하세요';
            if (itemData) {
                editTitle.value = itemData.question;
                editContent.value = itemData.answer;
                editIsHidden.checked = !!itemData.is_hidden;
            } else {
                editTitle.value = '';
                editContent.value = '';
                editIsHidden.checked = false;
            }
        }

        editorModal.style.display = 'flex';
    }

    document.getElementById('btnEditorClose')?.addEventListener('click', () => {
        editorModal.style.display = 'none';
    });
    document.getElementById('btnEditorCancel')?.addEventListener('click', () => {
        editorModal.style.display = 'none';
    });

    // Save Data
    document.getElementById('btnEditorSubmit')?.addEventListener('click', async () => {
        const type = editDataType.value;
        const id = editTargetId.value;
        const title = editTitle.value.trim();
        const content = editContent.value.trim();
        const isHidden = editIsHidden.checked;

        if (!title || !content) {
            return alert('제목과 본문을 모두 입력해주세요.');
        }

        const btn = document.getElementById('btnEditorSubmit');
        btn.textContent = '저장 중...';
        btn.disabled = true;

        try {
            if (type === 'notice') {
                const noticeType = typeImportant.checked ? 'important' : 'normal';
                const payload = {
                    title: title,
                    content: content,
                    type: noticeType,
                    is_hidden: isHidden,
                    updated_at: firebase.database.ServerValue.TIMESTAMP
                };

                if (id) {
                    await db.ref(`notices/${id}`).update(payload);
                } else {
                    payload.author_id = 'OPERATOR_GHOST';
                    payload.author_name = '운영자';
                    payload.created_at = firebase.database.ServerValue.TIMESTAMP;
                    payload.views = 0;
                    await db.ref('notices').push(payload);
                }
            } else {
                const payload = {
                    question: title,
                    answer: content,
                    is_hidden: isHidden,
                    updated_at: firebase.database.ServerValue.TIMESTAMP
                };

                if (id) {
                    await db.ref(`faqs/${id}`).update(payload);
                } else {
                    payload.author_id = 'OPERATOR_GHOST';
                    payload.created_at = firebase.database.ServerValue.TIMESTAMP;
                    await db.ref('faqs').push(payload);
                }
            }

            // Close Modal
            editorModal.style.display = 'none';
            // Alert and reset
            alert('성공적으로 저장되었습니다.');
            document.getElementById('viewerModal').style.display = 'none'; // Re-render triggers from notice.js
        } catch (e) {
            console.error('Save failed:', e);
            alert('저장에 실패했습니다.');
        } finally {
            btn.textContent = '저장';
            btn.disabled = false;
        }
    });

    // Notice Viewer Integration
    window.NoticeAdmin = {
        onViewerOpen: (noticeData) => {
            currentViewerItem = noticeData;
            const actionDiv = document.getElementById('adminViewerActions');
            if (window.__BSQ_DEV_MODE__ === true) {
                actionDiv.style.display = 'flex';
                actionDiv.style.gap = '10px';
            } else {
                actionDiv.style.display = 'none';
            }
        }
    };

    // Edit inside Viewer
    document.getElementById('btnEditNoticeItem')?.addEventListener('click', () => {
        if (!currentViewerItem) return;
        openEditor('notice', currentViewerItem);
    });

    // Delete inside Viewer
    document.getElementById('btnDeleteNoticeItem')?.addEventListener('click', async () => {
        if (!currentViewerItem) return;
        if (confirm('이 공지사항을 정말 삭제하시겠습니까?')) {
            try {
                await db.ref(`notices/${currentViewerItem.id}`).remove();
                alert('삭제되었습니다.');
                document.getElementById('viewerModal').style.display = 'none';
            } catch (e) {
                alert('삭제 실패');
            }
        }
    });
});
