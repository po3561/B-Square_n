// admin_users.js - Handles User List fetching and rendering

document.addEventListener('DOMContentLoaded', () => {
    // Only load data if we are explicitly on the Users tab
    const tabUsers = document.getElementById('tabUsers');
    if (tabUsers && tabUsers.classList.contains('active')) {
        loadAdminUsers();
    }

    // Listen for tab changes
    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabUsers') {
            loadAdminUsers();
        }
    });

    // Search Box Listener
    document.getElementById('searchInputUsers')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#adminUsersTableBody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
});

async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    // BSQ.ready 대기
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">데이터를 불러오는 중입니다...</td></tr>';

    try {
        const res = await window.BSQ.api('/api/users');
        if (!res || !res.success) throw new Error(res?.error || "Failed to load users");

        const users = res.data || [];

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">가입된 회원이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-';

            // promise1 계정은 권한 수정 막기
            const isPromise = user.email?.startsWith('promise') || user.username === 'promise1';
            const disabledAttr = isPromise ? 'disabled' : '';

            return `
                <tr>
                    <td style="font-family: monospace; font-size:0.8rem; color:var(--admin-text-muted);">${user.id.substring(0, 8)}...</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${user.profile_url || user.profile_image_url || 'https://ui-avatars.com/api/?name=' + (user.name || 'U') + '&background=random'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                            <span style="font-weight:600;">${user.name || '이름 없음'}</span>
                        </div>
                    </td>
                    <td>${user.email || user.username || '-'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <select onchange="updateUserRole('${user.id}', this.value)" ${disabledAttr} style="padding:0.3rem; border:1px solid #e2e8f0; border-radius:4px; font-size:0.85rem; background:#f8fafc; font-weight:600; cursor:pointer;">
                            <option value="user" ${user.role === 'user' || !user.role ? 'selected' : ''}>일반 유저</option>
                            <option value="instructor" ${user.role === 'instructor' ? 'selected' : ''}>🔥 강사</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>👑 최고 관리자</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn-small outline" onclick="showUserDetail('${user.id}')">상세 보기</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load users from D1:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패: ' + err.message + '</td></tr>';
    }
}

// 사용자 권한 즉시 변경 함수 (D1 API)
window.updateUserRole = async function (userId, newRole) {
    if (!confirm(`해당 회원의 권한을 ${newRole}(으)로 변경하시겠습니까?`)) {
        loadAdminUsers(); // 원래 등급으로 원복
        return;
    }

    try {
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const res = await window.BSQ.api(`/api/users/${userId}`, {
            method: 'PUT',
            body: { role: newRole }
        });

        if (!res || !res.success) throw new Error(res?.error || "Update failed");

        alert('권한이 성공적으로 업데이트되었습니다.');

        // 관련 리스트 업데이트
        if (typeof loadOperators === 'function') {
            loadOperators();
        }
        loadAdminUsers();

    } catch (err) {
        console.error("Role update failed in D1:", err);
        alert('권한 변경에 실패했습니다: ' + err.message);
        loadAdminUsers(); // 롤백
    }
};
