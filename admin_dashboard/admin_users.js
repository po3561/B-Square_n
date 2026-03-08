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
    if (!tbody || !window.supabaseClient) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">데이터를 불러오는 중입니다...</td></tr>';

    try {
        const { data: users, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Pagination in a real scenario

        if (error) throw error;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">가입된 회원이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const dateStr = new Date(user.created_at).toLocaleDateString('ko-KR');
            
            // promise1 계정은 권한 수정 막기
            const isPromise = user.email?.startsWith('promise') || user.username === 'promise1';
            const disabledAttr = isPromise ? 'disabled' : '';

            return `
                <tr>
                    <td style="font-family: monospace; font-size:0.8rem; color:var(--admin-text-muted);">${user.id.substring(0, 8)}...</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${user.profile_url || user.profile_image_url || 'https://ui-avatars.com/api/?name='+(user.name||'U')+'&background=random'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                            <span style="font-weight:600;">${user.name || '이름 없음'}</span>
                        </div>
                    </td>
                    <td>${user.email || '-'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <select onchange="updateUserRole('${user.id}', this.value)" ${disabledAttr} style="padding:0.3rem; border:1px solid #e2e8f0; border-radius:4px; font-size:0.85rem; background:#f8fafc; font-weight:600; cursor:pointer;">
                            <option value="user" ${user.role==='user'||!user.role ? 'selected' : ''}>일반 유저</option>
                            <option value="instructor" ${user.role==='instructor' ? 'selected' : ''}>🔥 강사</option>
                            <option value="admin" ${user.role==='admin' ? 'selected' : ''}>👑 최고 관리자</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn-small outline" onclick="alert('회원 상세 조회: ${user.name}')">상세 보기</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load users", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패</td></tr>';
    }
}

// 사용자 권한 즉시 변경 함수 (글로벌 윈도우 스코프)
window.updateUserRole = async function(userId, newRole) {
    if (!confirm(`해당 회원의 권한을 ${newRole}(으)로 변경하시겠습니까?`)) {
        loadAdminUsers(); // 원래 등급으로 원복
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('users')
            .update({ role: newRole })
            .eq('id', userId);
            
        if (error) throw error;
        // 권한 변경 성공. UI 상의 RoleBadge는 Select 자체이므로 텍스트 토스트 메세지만 추가.
        alert('권한이 성공적으로 업데이트되었습니다.');
        
        // 만약 tabOperators가 열려 데이터를 공유중이라면 재렌더링 트리거
        if (typeof loadOperators === 'function') {
            loadOperators();
        }
    } catch(err) {
        console.error("Role update failed", err);
        alert('권한 변경에 실패했습니다.');
        loadAdminUsers(); // 롤백
    }
};
