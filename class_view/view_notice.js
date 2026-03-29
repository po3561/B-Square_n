window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initNotice = function (_, classId, userId, __, hasAccess, isInstructor, authorContext = {}) {
    const listContainer = document.getElementById('classNoticeList');
    const btnCreate = document.getElementById('btnCreateClassNotice');
    const viewerModal = document.getElementById('classNoticeViewerModal');
    const editorModal = document.getElementById('classNoticeEditorModal');

    const cvTitle = document.getElementById('cvTitle');
    const cvAuthor = document.getElementById('cvAuthor');
    const cvDate = document.getElementById('cvDate');
    const cvViews = document.getElementById('cvViews');
    const cvContent = document.getElementById('cvContent');
    const cvAdminActions = document.getElementById('cvAdminActions');

    const ceModalTitle = document.getElementById('ceModalTitle');
    const ceTargetId = document.getElementById('ceTargetId');
    const ceTitle = document.getElementById('ceTitle');
    const ceEditorContainer = document.getElementById('ceEditorContainer');
    const ceContent = document.getElementById('ceContent');

    const btnCvClose = document.getElementById('btnCvClose');
    const btnCeClose = document.getElementById('btnCeClose');
    const btnCeCancel = document.getElementById('btnCeCancel');
    const btnCeSubmit = document.getElementById('btnCeSubmit');
    const btnCvEdit = document.getElementById('btnCvEdit');
    const btnCvDelete = document.getElementById('btnCvDelete');

    const viewerActionRow = cvContent?.nextElementSibling || null;
    const viewerCommentSection = viewerActionRow?.nextElementSibling || null;

    const currentUser = window.BSQ?.session?.user || null;
    const canWriteNotice = !!(isInstructor || window.__BSQ_DEV_MODE__ === true || authorContext?.role === 'admin' || authorContext?.role === 'operator');

    let notices = [];
    let currentNotice = null;
    let quill = null;

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripHtml(value = '') {
        const html = String(value || '');
        const el = document.createElement('div');
        el.innerHTML = html;
        return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? '-'
            : date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }

    function getRoleLabel(item) {
        const role = String(item?.author_role || authorContext?.role || '').trim().toLowerCase();
        if (item?.author_role_label) return item.author_role_label;
        if (role === 'main_instructor') return '메인 강사';
        if (role === 'sub_instructor') return '보조 강사';
        if (role === 'operator') return '운영자';
        if (role === 'admin' || role === 'super_admin') return '관리자';
        return '강사';
    }

    function setViewerExtrasVisible(visible) {
        if (viewerActionRow) viewerActionRow.style.display = visible ? 'flex' : 'none';
        if (viewerCommentSection) viewerCommentSection.style.display = visible ? 'block' : 'none';
        if (cvAdminActions) cvAdminActions.style.display = 'none';
    }

    function ensureQuill() {
        if (!ceEditorContainer || !window.Quill) return null;

        if (!quill) {
            quill = new Quill('#ceEditorContainer', {
                theme: 'snow',
                placeholder: '내용을 입력하세요.',
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        ['link', 'clean'],
                    ],
                },
            });
        }

        return quill;
    }

    function setEditorContent(html = '') {
        const editor = ensureQuill();
        const normalized = String(html || '').trim();

        if (editor) {
            editor.setText('');
            if (normalized) editor.clipboard.dangerouslyPasteHTML(normalized);
        } else if (ceContent) {
            ceContent.value = normalized;
        }
    }

    function getEditorContent() {
        const editor = ensureQuill();
        if (editor) {
            const html = editor.root.innerHTML.trim();
            return html === '<p><br></p>' ? '' : html;
        }

        return String(ceContent?.value || '').trim();
    }

    function openEditor(item = null) {
        if (!editorModal || !canWriteNotice) return;

        ceTargetId.value = item?.id || item?.push_key || '';
        ceModalTitle.textContent = item ? '공지사항 수정' : '공지사항 등록';
        ceTitle.value = item?.title || '';
        setEditorContent(item?.content || '');
        editorModal.style.display = 'flex';

        window.setTimeout(() => ceTitle?.focus(), 30);
    }

    function closeEditor() {
        if (editorModal) editorModal.style.display = 'none';
    }

    function openViewer(item) {
        if (!item || !viewerModal) return;

        currentNotice = item;
        cvTitle.textContent = item.title || '공지사항';
        cvAuthor.textContent = `작성자: ${getRoleLabel(item)} ${item.author_name || '강사'}`;
        cvDate.textContent = `등록일: ${formatDate(item.created_at)}`;
        cvViews.textContent = `조회수 ${Number(item.views || 0)}`;
        cvContent.innerHTML = item.content || '<div class="empty-state">내용이 없습니다.</div>';

        setViewerExtrasVisible(false);
        viewerModal.style.display = 'flex';
    }

    function closeViewer() {
        if (viewerModal) viewerModal.style.display = 'none';
        currentNotice = null;
    }

    async function loadClassNotices() {
        if (!classId || !listContainer) return;

        try {
            const res = await window.BSQ.api(`/api/class-notices?class_id=${encodeURIComponent(classId)}`, { cacheBust: false });
            notices = res?.success && Array.isArray(res.data) ? res.data : [];
            renderNoticeList();
        } catch (error) {
            console.error('Notice load error:', error);
            if (listContainer) {
                listContainer.innerHTML = '<div class="empty-state" style="padding: 3rem; text-align: center; color: var(--comm-text2);">공지사항을 불러오지 못했습니다.</div>';
            }
        }
    }

    function renderNoticeList() {
        if (!listContainer) return;

        if (!notices.length) {
            listContainer.innerHTML = '<div class="empty-state" style="padding: 3rem; text-align: center; color: var(--comm-text2);">아직 등록된 공지사항이 없습니다.</div>';
            return;
        }

        listContainer.innerHTML = notices.map((notice) => {
            const roleLabel = getRoleLabel(notice);
            const roleTone = notice.author_role === 'main_instructor'
                ? '#4f46e5'
                : notice.author_role === 'sub_instructor'
                    ? '#0f766e'
                    : '#64748b';
            const noticeId = String(notice.id || notice.push_key || '').trim();

            return `
                <article
                    class="notice-item card-block"
                    data-id="${escapeHtml(noticeId)}"
                    style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.4rem 1.5rem; margin-bottom: 1rem; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; box-shadow: 0 8px 20px rgba(0,0,0,0.08);"
                >
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:1rem;">
                        <div style="min-width:0;">
                            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem; margin-bottom:0.55rem;">
                                <span style="display:inline-flex; align-items:center; padding:0.24rem 0.62rem; border-radius:999px; background:${roleTone}18; color:${roleTone}; font-size:0.74rem; font-weight:800;">${escapeHtml(roleLabel)}</span>
                                <span style="font-size:0.82rem; color: var(--comm-text2);">${escapeHtml(formatDate(notice.created_at))}</span>
                            </div>
                            <h4 style="font-size:1.04rem; font-weight:800; color:var(--text-color); margin:0; line-height:1.45;">${escapeHtml(notice.title || '')}</h4>
                        </div>
                        <span style="font-size:0.82rem; color: var(--comm-text2); white-space:nowrap;">조회수 ${Number(notice.views || 0)}</span>
                    </div>
                    <div style="margin-top:0.75rem; color: var(--comm-text2); font-size:0.88rem;">
                        ${escapeHtml(notice.author_name || '강사')}
                    </div>
                </article>
            `;
        }).join('');

        listContainer.querySelectorAll('.notice-item').forEach((item) => {
            item.addEventListener('mouseenter', () => {
                item.style.transform = 'translateY(-1px)';
                item.style.boxShadow = '0 12px 28px rgba(0,0,0,0.12)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.transform = 'translateY(0)';
                item.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
            });
            item.addEventListener('click', () => {
                const notice = notices.find((entry) => String(entry.id || entry.push_key || '') === String(item.dataset.id || ''));
                if (notice) openViewer(notice);
            });
        });
    }

    async function saveNotice() {
        if (!canWriteNotice) return;

        const title = String(ceTitle?.value || '').trim();
        const content = getEditorContent();

        if (!title) {
            showToast('info', '제목을 입력해 주세요', '공지사항 제목이 비어 있습니다.');
            return;
        }

        if (!stripHtml(content)) {
            showToast('info', '내용을 입력해 주세요', '공지사항 내용을 작성한 뒤 저장해 주세요.');
            return;
        }

        const btn = btnCeSubmit;
        const originalText = btn?.textContent || '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '저장 중...';
        }

        try {
            const payload = {
                class_id: classId,
                title,
                content,
                author_name: authorContext?.name || currentUser?.name || '강사',
                author_id: currentUser?.id || userId || undefined,
                author_role: authorContext?.role || undefined,
            };

            const res = await window.BSQ.api('/api/class-notices', {
                method: 'POST',
                body: payload,
            });

            if (!res?.success) throw new Error(res?.error || '저장에 실패했습니다.');

            closeEditor();
            await loadClassNotices();
            showToast('success', '공지사항이 등록되었습니다', '수강생들에게 바로 노출됩니다.');
        } catch (error) {
            console.error('Class notice save failed:', error);
            showToast('error', '저장에 실패했습니다', error.message || '잠시 후 다시 시도해 주세요.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || '저장하기';
            }
        }
    }

    if (btnCreate) {
        btnCreate.style.display = canWriteNotice ? 'inline-flex' : 'none';
        btnCreate.addEventListener('click', () => openEditor(null));
    }

    btnCeClose?.addEventListener('click', closeEditor);
    btnCeCancel?.addEventListener('click', closeEditor);
    btnCeSubmit?.addEventListener('click', saveNotice);
    btnCvClose?.addEventListener('click', closeViewer);

    if (btnCvEdit) btnCvEdit.style.display = 'none';
    if (btnCvDelete) btnCvDelete.style.display = 'none';
    setViewerExtrasVisible(false);

    loadClassNotices();
};
