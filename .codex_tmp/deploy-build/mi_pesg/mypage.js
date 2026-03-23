// mypage.js - B-Square 마이페이지 (D1 API 기반, 통합 대시보드)
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
        ? (window.__BSQ_OPERATOR_PROFILE__ || { name: '운영자', email: 'operator@b-square.kr' })
        : session.user;

    // ===== 사이드바 프로필 렌더링 =====
    const nickname = document.getElementById('displayNickname');
    const email = document.getElementById('displayEmail');
    const username = document.getElementById('displayUsername');
    const profileImg = document.getElementById('profileImg');

    if (nickname) nickname.textContent = (user.name || user.username || '사용자') + '님';
    if (email) email.textContent = user.email || '';
    if (username) username.textContent = 'ID: ' + (user.username || user.id || '-');
    if (profileImg && user.profile_image_url) {
        profileImg.style.backgroundImage = `url(${user.profile_image_url})`;
        profileImg.style.backgroundSize = 'cover';
        profileImg.textContent = '';
    }

    // ===== 탭 전환 =====
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.mypage-tab');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabs.forEach(t => t.classList.remove('active'));
            const el = document.getElementById(target);
            if (el) el.classList.add('active');
        });
    });

    // ===== 대시보드 통합 로드 (통계 + 최근 클래스) =====
    await loadDashboard(userId, isOperator);

    // ===== 각 탭 모듈 초기화 (D1 API 기반) =====
    if (typeof window.initClassesTab === 'function') window.initClassesTab(null, userId);
    if (typeof window.initProfileTab === 'function') window.initProfileTab(userId, user);
    if (typeof window.initSecurityTab === 'function') window.initSecurityTab(userId);
    if (typeof window.initChatSubTab === 'function') window.initChatSubTab(userId);

    // 친구 탭 활성화 시 로드
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.target === 'tabFriends') loadFriends(userId);
        });
    });

    console.log("✅ MyPage loaded for:", userId);

    // ===== 친구 기능 =====
    async function loadFriends(uid) {
        const pendingArea = document.getElementById('pendingFriendList');
        const friendArea = document.getElementById('friendListArea');
        const pendingCount = document.getElementById('pendingCount');
        const friendCount = document.getElementById('friendCount');

        // 받은 요청 로드
        try {
            const pendingRes = await window.BSQ.api(`/api/friends?user_id=${uid}&pending=1`);
            if (pendingRes.success && pendingRes.data?.length > 0) {
                if (pendingCount) pendingCount.textContent = pendingRes.data.length;
                pendingArea.innerHTML = pendingRes.data.map(r => `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF9500,#FF6B00);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.9rem;">${(r.nickname || r.name || '?')[0]}</div>
                        <div style="flex:1;">
                            <div style="font-weight:700;font-size:0.95rem;">${r.nickname || r.name || '알 수 없음'}</div>
                            <div style="font-size:0.75rem;color:#888;">${new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                        <button class="btn-accept-friend" data-fid="${r.requester_id}" style="padding:6px 14px;border-radius:8px;background:rgba(52,199,89,0.15);color:#34C759;border:1px solid rgba(52,199,89,0.25);cursor:pointer;font-weight:700;font-size:0.8rem;">수락</button>
                        <button class="btn-reject-friend" data-fid="${r.requester_id}" style="padding:6px 14px;border-radius:8px;background:rgba(255,59,48,0.1);color:#FF3B30;border:1px solid rgba(255,59,48,0.2);cursor:pointer;font-weight:700;font-size:0.8rem;">거절</button>
                    </div>
                `).join('');

                pendingArea.querySelectorAll('.btn-accept-friend').forEach(btn => {
                    btn.onclick = async () => {
                        await window.BSQ.api('/api/friends', { method:'POST', body:JSON.stringify({ action:'accept', user_id:uid, friend_id:btn.dataset.fid }) });
                        loadFriends(uid);
                    };
                });
                pendingArea.querySelectorAll('.btn-reject-friend').forEach(btn => {
                    btn.onclick = async () => {
                        await window.BSQ.api('/api/friends', { method:'POST', body:JSON.stringify({ action:'reject', user_id:uid, friend_id:btn.dataset.fid }) });
                        loadFriends(uid);
                    };
                });
            } else {
                if (pendingCount) pendingCount.textContent = '0';
                pendingArea.innerHTML = '<p style="color:#888; font-size:0.85rem;">받은 요청이 없습니다</p>';
            }
        } catch (e) { pendingArea.innerHTML = '<p style="color:#ff4d4d;">로드 실패</p>'; }

        // 친구 목록 로드
        try {
            const friendRes = await window.BSQ.api(`/api/friends?user_id=${uid}`);
            if (friendRes.success && friendRes.data?.length > 0) {
                if (friendCount) friendCount.textContent = friendRes.data.length;
                friendArea.innerHTML = friendRes.data.map(f => `
                    <div style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="width:42px;height:42px;border-radius:50%;background:${f.profile_image ? `url(${f.profile_image}) center/cover` : 'linear-gradient(135deg,#007AFF,#5AC8FA)'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;">${f.profile_image ? '' : (f.nickname || f.name || '?')[0]}</div>
                        <div style="flex:1;">
                            <div style="font-weight:700;">${f.nickname || f.name || '알 수 없음'}</div>
                            <div style="font-size:0.75rem;color:#888;">${f.email || ''}</div>
                        </div>
                        <button class="btn-msg-friend" data-fid="${f.friend_id}" style="padding:6px 12px;border-radius:8px;background:rgba(0,122,255,0.1);color:#007AFF;border:1px solid rgba(0,122,255,0.15);cursor:pointer;font-size:0.8rem;font-weight:600;" title="메시지"><i class="fa-solid fa-comment"></i></button>
                        <button class="btn-remove-friend" data-fid="${f.friend_id}" style="padding:6px 12px;border-radius:8px;background:rgba(255,59,48,0.08);color:#FF3B30;border:1px solid rgba(255,59,48,0.12);cursor:pointer;font-size:0.8rem;" title="삭제"><i class="fa-solid fa-user-minus"></i></button>
                    </div>
                `).join('');

                friendArea.querySelectorAll('.btn-remove-friend').forEach(btn => {
                    btn.onclick = async () => {
                        if (!confirm('이 친구를 삭제하시겠습니까?')) return;
                        await window.BSQ.api('/api/friends', { method:'POST', body:JSON.stringify({ action:'remove', user_id:uid, friend_id:btn.dataset.fid }) });
                        loadFriends(uid);
                    };
                });
                friendArea.querySelectorAll('.btn-msg-friend').forEach(btn => {
                    btn.onclick = () => {
                        window.location.href = `../community/community.html?dm=${btn.dataset.fid}`;
                    };
                });
            } else {
                if (friendCount) friendCount.textContent = '0';
                friendArea.innerHTML = '<p style="color:#888; font-size:0.85rem;">친구가 없습니다. 클래스 채널에서 친구를 추가해보세요!</p>';
            }
        } catch (e) { friendArea.innerHTML = '<p style="color:#ff4d4d;">로드 실패</p>'; }
    }
});

// ===== 대시보드 통합 로드 =====
async function loadDashboard(userId, isOperator) {
    const dashPassCount = document.getElementById('dashPassCount');
    const dashClassCount = document.getElementById('dashClassCount');
    const dashChatCount = document.getElementById('dashChatCount');
    const dashRecentClass = document.getElementById('dashRecentClass');

    if (isOperator) {
        if (dashPassCount) dashPassCount.textContent = '∞';
        if (dashClassCount) dashClassCount.textContent = '전체';
        if (dashChatCount) dashChatCount.textContent = '전체';
        if (dashRecentClass) dashRecentClass.innerHTML = '<div class="empty-state">운영자 모드에서는 전체 클래스를 관리합니다.</div>';
        return;
    }

    try {
        // 병렬로 API 호출
        const [enrollRes, passRes, classRes] = await Promise.all([
            window.BSQ.api(`/api/enrollments?user_id=${userId}`),
            window.BSQ.api(`/api/user-passes?user_id=${userId}`),
            window.BSQ.api(`/api/classes?instructor_id=${userId}`)
        ]);

        // 수강 데이터
        const enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];
        // 수강권 데이터
        const passes = passRes?.success ? (passRes.data || []) : [];
        // 내 클래스 데이터
        const myClasses = classRes?.success ? (classRes.data || []) : [];

        // 수강권 총합
        let totalPasses = 0;
        passes.forEach(p => { if (p.remaining_count > 0) totalPasses += p.remaining_count; });

        // 통계 업데이트
        if (dashPassCount) dashPassCount.textContent = `${totalPasses}개`;
        if (dashClassCount) dashClassCount.textContent = `${enrollments.length + myClasses.length}개`;
        if (dashChatCount) dashChatCount.textContent = `${enrollments.length}개`; // 수강 중인 채팅방 수

        // 최근 수강 클래스 (최대 3개)
        if (dashRecentClass) {
            const recentEnrolls = enrollments.slice(0, 3);
            if (recentEnrolls.length > 0) {
                dashRecentClass.innerHTML = recentEnrolls.map(e => `
                    <div class="my-class-card" onclick="location.href='../class_view/class_view.html?id=${e.class_id}'" style="cursor:pointer;">
                        <div class="class-thumb ${!e.image_url ? 'placeholder-orange' : ''}">
                            ${e.image_url ? `<img src="${e.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4>${e.title || e.name || '클래스명'}</h4>
                            <p style="font-size:0.9rem;color:#888;">${e.category || '기타'} · 수강일: ${e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('ko-KR') : '-'}</p>
                        </div>
                    </div>
                `).join('');
            } else if (myClasses.length > 0) {
                // 수강 중인 건 없지만 개설 클래스가 있는 경우
                dashRecentClass.innerHTML = myClasses.slice(0, 3).map(c => `
                    <div class="my-class-card" onclick="location.href='../class_view/class_view.html?id=${c.id}'" style="cursor:pointer;">
                        <div class="class-thumb ${!c.image_url ? 'placeholder-orange' : ''}">
                            ${c.image_url ? `<img src="${c.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4>${c.title || '클래스명'}</h4>
                            <p style="font-size:0.9rem;color:#888;">${c.category || '기타'} · 내가 개설한 클래스</p>
                        </div>
                    </div>
                `).join('');
            } else {
                dashRecentClass.innerHTML = '<div class="empty-state">수강 중인 클래스가 없습니다.<br><a href="../class/class_list.html" style="color:#6e8efb;">클래스 둘러보기 →</a></div>';
            }
        }
    } catch (error) {
        console.error("Dashboard load error:", error);
        if (dashRecentClass) dashRecentClass.innerHTML = '<div class="empty-state">데이터 로드 실패</div>';
    }
}
