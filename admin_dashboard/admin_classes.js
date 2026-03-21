// admin_classes.js - Handles Class List fetching and rendering

document.addEventListener('DOMContentLoaded', () => {
    const tabClasses = document.getElementById('tabClasses');
    if (tabClasses && tabClasses.classList.contains('active')) {
        loadAdminClasses();
    }

    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabClasses') {
            loadAdminClasses();
        }
    });
});

// 1. Load Class List (D1 API)
async function loadAdminClasses() {
    const tbody = document.getElementById('adminClassesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">클래스 데이터를 불러오는 중입니다...</td></tr>';

    try {
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const res = await window.BSQ.api('/api/classes');

        if (!res || !res.success) {
            throw new Error(res?.error || 'Failed to fetch classes');
        }

        const classItems = res.data || [];

        if (classItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">등록된 클래스가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = classItems.map(item => {
            const statusBadge = item.is_approved
                ? '<span class="admin-badge success">운영 중</span>'
                : '<span class="admin-badge muted">대기/비공개</span>';

            const cat = item.category || '미분류';

            return `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <img src="${item.thumbnail || item.image_url || 'https://via.placeholder.com/60x40?text=No+Img'}" style="width:60px; height:40px; border-radius:6px; object-fit:cover;">
                            <div>
                                <div style="font-weight:700; color:var(--admin-text-main); margin-bottom:2px;">${item.title || '제목 없음'}</div>
                                <div style="font-size:0.8rem; color:var(--admin-text-muted);">ID: ${item.id.substring(0, 8)}...</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-weight:600;">${item.instructor_name || item.creator_name || '강사'}</td>
                    <td><span class="admin-badge muted">${cat}</span></td>
                    <td>${item.current_participants || 0} / ${item.max_capacity || '∞'}명</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-small outline" onclick="window.open('../class_view/class_view.html?id=${item.id}', '_blank')">보기</button>
                            <button class="btn-small outline" onclick="deleteClassItem('${item.id}', '${(item.title || '').replace(/'/g, "\\'")}')" style="color:var(--admin-danger); border-color:rgba(241,65,108,0.3);">삭제</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load classes from D1:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패: ' + err.message + '</td></tr>';
    }
}

// 2. Delete Class (D1 API)
window.deleteClassItem = async function (classId, classTitle) {
    if (!confirm(`정말로 "${classTitle}" 클래스를 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }

    try {
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const res = await window.BSQ.api(`/api/classes?id=${classId}`, {
            method: 'DELETE'
        });

        if (!res || !res.success) throw new Error(res?.error || "Delete failed");

        alert(`"${classTitle}" 클래스가 삭제되었습니다.`);
        loadAdminClasses(); // 목록 새로고침
    } catch (err) {
        console.error("Failed to delete class in D1:", err);
        alert('클래스 삭제 실패: ' + err.message);
    }
};
