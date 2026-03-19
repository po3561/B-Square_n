// mypage.js - B-Square 마이페이지 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    console.log("👤 B-Square MyPage Initializing (D1 API)...");

    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    const session = window.BSQ?.session;
    const isOperator = window.__BSQ_DEV_MODE__;

    if (!session && !isOperator) {
        alert("로그인이 필요합니다.");
        window.location.href = '../login/login.html';
        return;
    }

    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    const user = isOperator
        ? (window.__BSQ_OPERATOR_PROFILE__ || { name: '운영자', email: 'operator@b-square.kr', profile_image_url: '' })
        : session.user;

    // ===== 프로필 렌더링 =====
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const avatarEl = document.getElementById('profileAvatar');

    if (nameEl) nameEl.textContent = user.name || '사용자';
    if (emailEl) emailEl.textContent = user.email || '';
    if (avatarEl) {
        if (user.profile_image_url) {
            avatarEl.style.backgroundImage = `url(${user.profile_image_url})`;
            avatarEl.textContent = '';
        } else {
            avatarEl.textContent = '👤';
        }
    }

    // ===== 프로필 수정 =====
    const editForm = document.getElementById('profileEditForm');
    if (editForm && !isOperator) {
        // 폼 초기값 세팅
        document.getElementById('editName').value = user.name || '';
        document.getElementById('editPhone').value = user.phone || '';

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('editName').value.trim();
            const phone = document.getElementById('editPhone').value.trim();
            const currentPw = document.getElementById('editCurrentPw')?.value;
            const newPw = document.getElementById('editNewPw')?.value;

            const payload = { name, phone };
            if (currentPw && newPw) {
                payload.current_password = currentPw;
                payload.new_password = newPw;
            }

            const result = await window.BSQ.api(`/api/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (result.success) {
                alert('프로필이 업데이트되었습니다.');
                location.reload();
            } else {
                alert('수정 실패: ' + (result.error || '알 수 없는 오류'));
            }
        });
    }

    // ===== 수강 중인 클래스 목록 =====
    const enrolledGrid = document.getElementById('enrolledClassGrid');
    if (enrolledGrid && !isOperator) {
        const result = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
        if (result.success && result.data && result.data.length > 0) {
            enrolledGrid.innerHTML = result.data.map(e => `
                <div class="enrolled-card" onclick="location.href='../class_view/class_view.html?id=${e.class_id}'">
                    <div class="enrolled-thumb" style="background-image: url(${e.image_url || 'https://via.placeholder.com/300x180'})"></div>
                    <div class="enrolled-info">
                        <span class="enrolled-category">${e.category || '기타'}</span>
                        <h4>${e.title || '클래스명'}</h4>
                        <span class="enrolled-date">수강 시작: ${e.created_at ? new Date(e.created_at).toLocaleDateString('ko-KR') : '-'}</span>
                    </div>
                </div>
            `).join('');
        } else {
            enrolledGrid.innerHTML = '<div class="empty-state">수강 중인 클래스가 없습니다.</div>';
        }
    }

    // ===== 개설한 클래스 목록 =====
    const createdGrid = document.getElementById('createdClassGrid');
    if (createdGrid && !isOperator) {
        const result = await window.BSQ.api(`/api/classes?creator_id=${userId}`);
        if (result.success && result.data && result.data.length > 0) {
            createdGrid.innerHTML = result.data.map(c => `
                <div class="created-card" onclick="location.href='../class_view/class_view.html?id=${c.id}'">
                    <div class="created-thumb" style="background-image: url(${c.image_url || 'https://via.placeholder.com/300x180'})"></div>
                    <div class="created-info">
                        <h4>${c.title || '클래스명'}</h4>
                        <span class="created-meta">${c.category || '기타'} · 가격: ${c.price ? c.price.toLocaleString() + '원' : '무료'}</span>
                    </div>
                </div>
            `).join('');
        } else {
            createdGrid.innerHTML = '<div class="empty-state">개설한 클래스가 없습니다.</div>';
        }
    }

    // ===== 탭 전환 =====
    const tabBtns = document.querySelectorAll('.mypage-tab-btn');
    const tabContents = document.querySelectorAll('.mypage-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(t => t.classList.remove('active'));
            const el = document.getElementById(target);
            if (el) el.classList.add('active');
        });
    });
});
