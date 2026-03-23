// view_notice.js - 클래스 개별 공지사항 모듈 (D1 API 기반)
window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initNotice = function (_, classId, userId, __, hasAccess, isInstructor) {
    console.log("📢 initNotice called for class (D1 API):", classId);

    const listContainer = document.getElementById('classNoticeList');
    const btnCreate = document.getElementById('btnCreateClassNotice');
    
    // Viewer UI Elements
    const viewerModal = document.getElementById('classNoticeViewerModal');
    const cvTitle = document.getElementById('cvTitle');
    const cvAuthor = document.getElementById('cvAuthor');
    const cvDate = document.getElementById('cvDate');
    const cvViews = document.getElementById('cvViews');
    const cvContent = document.getElementById('cvContent');
    const cvAdminActions = document.getElementById('cvAdminActions'); // 현재 읽기 전용이므로 숨김

    let notices = [];
    const hasAdminPrivilege = isInstructor || window.__BSQ_DEV_MODE__ === true;

    if (btnCreate) {
        if (!hasAdminPrivilege) {
            btnCreate.style.display = 'none';
        } else {
            btnCreate.style.display = 'inline-block';
            btnCreate.addEventListener('click', async () => {
                const title = prompt("공지사항 제목을 입력하세요:");
                if (!title) return;
                const content = prompt("공지사항 내용을 입력하세요:");
                if (!content) return;
                
                try {
                    const res = await window.BSQ.api('/api/class-notices', {
                        method: 'POST',
                        body: JSON.stringify({
                            class_id: classId,
                            title: title,
                            content: content,
                            author_name: userProfile?.name || '강사'
                        })
                    });
                    if (res.success) {
                        alert("공지사항이 등록되었습니다.");
                        loadClassNotices();
                    } else {
                        alert("공지 작성 실패: " + res.error);
                    }
                } catch (e) {
                    alert("서버 연결에 실패했습니다.");
                }
            });
        }
    }

    async function loadClassNotices() {
        if (!classId) return;
        try {
            const res = await window.BSQ.api(`/api/class-notices?class_id=${classId}`);
            if (res.success) {
                notices = res.data || [];
                renderNoticeList();
            }
        } catch (err) {
            console.error("Notice load error:", err);
        }
    }

    function renderNoticeList() {
        if (!listContainer) return;
        if (notices.length === 0) {
            listContainer.innerHTML = `<div class="empty-state" style="padding: 3rem; text-align: center; color: var(--comm-text2);">등록된 공지가 없습니다.</div>`;
            return;
        }

        listContainer.innerHTML = notices.map(n => {
            const dateStr = new Date(n.created_at).toLocaleDateString('ko-KR');
            return `
                <div class="notice-item card-block" data-id="${n.id}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; cursor:pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                        <h4 style="font-size: 1.2rem; font-weight: 700; color: var(--text-color); margin: 0;">${n.title}</h4>
                        <span style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; color: var(--comm-text2);">${dateStr}</span>
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.85rem; color: var(--comm-text2); align-items:center;">
                        <span style="font-weight:600;">${n.author_name || '강사'}</span>
                        <span>👁️ ${n.views || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.notice-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.backgroundColor = 'rgba(255,255,255,0.03)');
            item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');
            item.addEventListener('click', () => openViewer(item.dataset.id));
        });
    }

    function openViewer(id) {
        const n = notices.find(x => x.id === id);
        if (!n) return;

        cvTitle.textContent = n.title;
        cvAuthor.textContent = `작성자: ${n.author_name || '강사'}`;
        cvDate.textContent = `등록일: ${new Date(n.created_at).toLocaleString()}`;
        cvViews.textContent = `조회수: ${n.views || 0}`;
        cvContent.innerHTML = n.content ? n.content.replace(/\n/g, '<br>') : '';
        
        if (cvAdminActions) cvAdminActions.style.display = 'none';
        viewerModal.style.display = 'flex';
    }

    document.getElementById('btnCvClose')?.addEventListener('click', () => {
        viewerModal.style.display = 'none';
    });

    loadClassNotices();
};
