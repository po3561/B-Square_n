// notice_admin.js - 운영자전용 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    // bsq_server.js 초기화 + session bootstrap 대기
    const authBootstrapTasks = [];
    if (window.BSQ?.ready?.then) authBootstrapTasks.push(window.BSQ.ready.catch(() => null));
    if (window.BSQ?.sessionBootstrapPromise?.then) authBootstrapTasks.push(window.BSQ.sessionBootstrapPromise.catch(() => null));
    if (authBootstrapTasks.length) await Promise.all(authBootstrapTasks);

    // Quill JS 초기화
    let quill;
    if (document.getElementById('editorContainer')) {
        quill = new Quill('#editorContainer', {
            theme: 'snow',
            placeholder: '내용을 입력하세요...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'image', 'video'],
                    ['clean']
                ]
            }
        });
    }

    // Admin Check Logic (D1 Session)
    async function applyAdminUI() {
        const user = window.BSQ?.userProfile || window.BSQ?.session?.user || null;
        const isLoggedIn = !!window.BSQ?.isLoggedIn;
        
        let isAdmin = false;
        if (isLoggedIn && user) {
            if (user.role === 'admin' || user.user_type === 'admin' || window.__BSQ_DEV_MODE__) {
                isAdmin = true;
            }
        }

        if (isAdmin) {
            const btnNotice = document.getElementById('btnWriteNotice');
            if (btnNotice) btnNotice.style.display = 'inline-block';
            const btnFaq = document.getElementById('btnWriteFaq');
            if (btnFaq) btnFaq.style.display = 'inline-block';
        }
        return isAdmin;
    }

    let isAdmin = await applyAdminUI();

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
                if (quill) quill.root.innerHTML = itemData.content || '';
                else editContent.value = itemData.content || '';
                editIsHidden.checked = !!itemData.is_hidden;
                if (itemData.type === 'important') typeImportant.checked = true;
                else typeNormal.checked = true;
            } else {
                editTitle.value = '';
                if (quill) quill.root.innerHTML = '';
                else editContent.value = '';
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
                if (quill) quill.root.innerHTML = itemData.answer || '';
                else editContent.value = itemData.answer || '';
                editIsHidden.checked = !!itemData.is_hidden;
            } else {
                editTitle.value = '';
                if (quill) quill.root.innerHTML = '';
                else editContent.value = '';
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
    editorModal?.addEventListener('click', (event) => {
        if (event.target === editorModal) editorModal.style.display = 'none';
    });

    // Save Data (D1 API)
    document.getElementById('btnEditorSubmit')?.addEventListener('click', async () => {
        const dataType = editDataType.value;
        const id = editTargetId.value;
        const title = editTitle.value.trim();
        let content = '';
        if (quill) {
            content = quill.root.innerHTML.trim();
            if (content === '<p><br></p>') content = '';
        } else {
            content = editContent.value.trim();
        }
        const isHidden = editIsHidden.checked;

        if (!title || !content) {
            return alert('제목과 본문을 모두 입력해주세요.');
        }

        const btn = document.getElementById('btnEditorSubmit');
        btn.textContent = '저장 중...';
        btn.disabled = true;

        try {
            const user = window.BSQ?.userProfile || window.BSQ?.session?.user || null;
            const endpoint = dataType === 'notice' ? '/api/notices' : '/api/faqs';
            
            let payload = {};
            if (dataType === 'notice') {
                payload = {
                    id: id || undefined,
                    title: title,
                    content: content,
                    type: typeImportant.checked ? 'important' : 'normal',
                    is_hidden: isHidden,
                    author_name: user?.name || '운영자'
                };
            } else {
                payload = {
                    id: id || undefined,
                    question: title,
                    answer: content,
                    is_hidden: isHidden
                };
            }

            const res = await window.BSQ.api(endpoint, {
                method: 'POST',
                body: payload
            });

            if (!res || !res.success) throw new Error(res?.error || "Save failed");

            editorModal.style.display = 'none';
            alert('성공적으로 저장되었습니다.');
            
            // 페이지 새로고침 또는 UI 갱신 (관찰자/이벤트 처리 권장)
            location.reload(); 
        } catch (e) {
            console.error('Save failed in D1:', e);
            alert('저장에 실패했습니다: ' + e.message);
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
            if (actionDiv) {
                if (isAdmin) {
                    actionDiv.style.display = 'flex';
                    actionDiv.style.gap = '10px';
                } else {
                    actionDiv.style.display = 'none';
                }
            }
        }
    };

    // Edit inside Viewer
    document.getElementById('btnEditNoticeItem')?.addEventListener('click', () => {
        if (!currentViewerItem) return;
        openEditor('notice', currentViewerItem);
    });

    // Delete inside Viewer (D1 API)
    document.getElementById('btnDeleteNoticeItem')?.addEventListener('click', async () => {
        if (!currentViewerItem) return;
        if (confirm('이 공지사항을 정말 삭제하시겠습니까?')) {
            try {
                const res = await window.BSQ.api(`/api/notices?id=${currentViewerItem.id}`, {
                    method: 'DELETE'
                });
                if (!res || !res.success) throw new Error(res?.error || "Delete failed");
                
                alert('삭제되었습니다.');
                location.reload();
            } catch (e) {
                console.error("Delete failed in D1:", e);
                alert('삭제 실패: ' + e.message);
            }
        }
    });
});
