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

async function loadAdminClasses() {
    const tbody = document.getElementById('adminClassesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">클래스 데이터를 불러오는 중입니다...</td></tr>';

    try {
        const db = firebase.database();
        const snap = await db.ref('classes').once('value');
        const classes = snap.val();

        if (!classes) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">등록된 클래스가 없습니다.</td></tr>';
            return;
        }

        const classItems = Object.entries(classes).map(([key, val]) => ({ id: key, ...val }));
        classItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        tbody.innerHTML = classItems.map(item => {
            const statusBadge = item.isApproved 
                ? '<span class="admin-badge success">운영 중</span>' 
                : '<span class="admin-badge muted">대기/비공개</span>';

            const cat = item.category || '미분류';
            
            return `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <img src="${item.thumbnail || 'https://via.placeholder.com/60x40?text=No+Img'}" style="width:60px; height:40px; border-radius:6px; object-fit:cover;">
                            <div>
                                <div style="font-weight:700; color:var(--admin-text-main); margin-bottom:2px;">${item.title || '제목 없음'}</div>
                                <div style="font-size:0.8rem; color:var(--admin-text-muted);">ID: ${item.id.substring(0, 8)}...</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-weight:600;">${item.instructorName || '강사'}</td>
                    <td><span class="admin-badge muted">${cat}</span></td>
                    <td>${item.currentParticipants || 0} / ${item.maxCapacity || '∞'}명</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-small outline" onclick="window.open('../class_view/class_view.html?id=${item.id}', '_blank')">보기</button>
                            <button class="btn-small outline" onclick="alert('클래스 강제 삭제 테스트: ${item.title}')" style="color:var(--admin-danger); border-color:rgba(241,65,108,0.3);">삭제</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load classes", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패</td></tr>';
    }
}
