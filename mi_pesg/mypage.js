document.addEventListener('DOMContentLoaded', async () => {
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    const session = window.BSQ?.session;
    const isOperator = !!window.__BSQ_DEV_MODE__;

    if (!session && !isOperator) {
        alert('로그인이 필요합니다.');
        window.location.href = '../login/login.html';
        return;
    }

    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    const user = isOperator
        ? (window.__BSQ_OPERATOR_PROFILE__ || { name: '운영자', email: 'operator@b-square.kr' })
        : session.user;

    bindSidebarProfile(user);
    bindTabs(userId);
    await loadDashboard(userId, isOperator);

    if (typeof window.initClassesTab === 'function') window.initClassesTab(null, userId);
    if (typeof window.initProfileTab === 'function') window.initProfileTab(userId, user);
    if (typeof window.initSecurityTab === 'function') window.initSecurityTab(userId);
    if (typeof window.initChatSubTab === 'function') window.initChatSubTab(userId);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.target === 'tabFriends') {
                loadFriends(userId);
            }
        });
    });

    async function loadFriends(uid) {
        const pendingArea = document.getElementById('pendingFriendList');
        const friendArea = document.getElementById('friendListArea');
        const pendingCount = document.getElementById('pendingCount');
        const friendCount = document.getElementById('friendCount');

        if (!pendingArea || !friendArea) return;

        pendingArea.innerHTML = '<div class="friend-loading">받은 요청을 불러오는 중...</div>';
        friendArea.innerHTML = '<div class="friend-loading">친구 목록을 불러오는 중...</div>';

        try {
            const [pendingRes, friendRes] = await Promise.all([
                window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(uid)}&pending=1`),
                window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(uid)}`),
            ]);

            const pending = pendingRes?.success ? (pendingRes.data || []) : [];
            const friends = friendRes?.success ? (friendRes.data || []) : [];

            if (pendingCount) pendingCount.textContent = String(pending.length);
            if (friendCount) friendCount.textContent = String(friends.length);

            pendingArea.innerHTML = pending.length
                ? pending.map((item) => renderFriendCard(item, 'pending')).join('')
                : '<div class="empty-state compact friends-empty">받은 요청이 없습니다.</div>';

            friendArea.innerHTML = friends.length
                ? friends.map((item) => renderFriendCard(item, 'accepted')).join('')
                : '<div class="empty-state compact friends-empty">친구가 없습니다. 클래스 채널에서 먼저 연결을 만들어보세요.</div>';

            pendingArea.querySelectorAll('[data-friend-accept]').forEach((btn) => {
                btn.onclick = async () => {
                    await window.BSQ.api('/api/friends', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'accept', user_id: uid, friend_id: btn.dataset.friendAccept }),
                    });
                    loadFriends(uid);
                };
            });

            pendingArea.querySelectorAll('[data-friend-reject]').forEach((btn) => {
                btn.onclick = async () => {
                    await window.BSQ.api('/api/friends', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'reject', user_id: uid, friend_id: btn.dataset.friendReject }),
                    });
                    loadFriends(uid);
                };
            });

            friendArea.querySelectorAll('[data-friend-message]').forEach((btn) => {
                btn.onclick = () => {
                    window.location.href = `../community/community.html?dm=${encodeURIComponent(btn.dataset.friendMessage)}`;
                };
            });

            friendArea.querySelectorAll('[data-friend-remove]').forEach((btn) => {
                btn.onclick = async () => {
                    if (!confirm('친구를 삭제하시겠습니까?')) return;
                    await window.BSQ.api('/api/friends', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'remove', user_id: uid, friend_id: btn.dataset.friendRemove }),
                    });
                    loadFriends(uid);
                };
            });
        } catch (error) {
            console.error('[MyPage] friends load failed:', error);
            if (pendingCount) pendingCount.textContent = '0';
            if (friendCount) friendCount.textContent = '0';
            pendingArea.innerHTML = '<div class="empty-state compact friends-empty error">받은 요청을 불러오지 못했습니다.</div>';
            friendArea.innerHTML = '<div class="empty-state compact friends-empty error">친구 목록을 불러오지 못했습니다.</div>';
        }
    }

    function bindSidebarProfile(currentUser) {
        const nickname = document.getElementById('displayNickname');
        const email = document.getElementById('displayEmail');
        const username = document.getElementById('displayUsername');
        const profileImg = document.getElementById('profileImg');

        if (nickname) nickname.textContent = `${currentUser.name || currentUser.username || '사용자'} 님`;
        if (email) email.textContent = currentUser.email || '';
        if (username) username.textContent = `ID: ${currentUser.username || currentUser.id || '-'}`;

        if (profileImg && currentUser.profile_image_url) {
            profileImg.style.backgroundImage = `url(${currentUser.profile_image_url})`;
            profileImg.style.backgroundSize = 'cover';
            profileImg.style.backgroundPosition = 'center';
            profileImg.textContent = '';
        }
    }

    function bindTabs(uid) {
        const navBtns = document.querySelectorAll('.nav-btn');
        const tabs = document.querySelectorAll('.mypage-tab');

        navBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                navBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                tabs.forEach((tab) => tab.classList.remove('active'));
                document.getElementById(target)?.classList.add('active');

                if (target === 'tabFriends') {
                    loadFriends(uid);
                }
            });
        });
    }
});

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}

function friendName(item) {
    return String(item?.nickname || item?.name || item?.username || item?.display_name || item?.friend_id || item?.requester_id || '알 수 없음').trim() || '알 수 없음';
}

function friendMeta(item) {
    return String(item?.email || item?.username || '').trim();
}

function friendInitial(item) {
    const label = friendName(item);
    return label ? label.slice(0, 1).toUpperCase() : '?';
}

function friendAvatarStyle(item, gradient) {
    const avatar = String(item?.profile_image_url || item?.profile_image || '').trim();
    return avatar
        ? `background-image:url(${avatar}); background-size:cover; background-position:center;`
        : `background:${gradient};`;
}

function renderFriendCard(item, mode) {
    const name = escapeHtml(friendName(item));
    const meta = escapeHtml(friendMeta(item));
    const dateLabel = mode === 'pending' ? '요청일' : '친구일';
    const dateValue = mode === 'pending' ? item.created_at : (item.accepted_at || item.created_at);
    const cardClass = mode === 'pending' ? 'friend-card friend-card-pending' : 'friend-card';
    const gradient = mode === 'pending'
        ? 'linear-gradient(135deg, #ff9f43 0%, #ff7a18 100%)'
        : 'linear-gradient(135deg, #4f7cff 0%, #6dd3ff 100%)';

    if (mode === 'pending') {
        return `
            <article class="${cardClass}">
                <div class="friend-avatar" style="${friendAvatarStyle(item, gradient)}">${friendInitial(item)}</div>
                <div class="friend-info">
                    <div class="friend-name-row">
                        <strong>${name}</strong>
                        <span class="friend-status-pill">대기</span>
                    </div>
                    <p>${meta || '친구 요청이 도착했습니다.'}</p>
                    <div class="friend-meta-row">
                        <span>${dateLabel} ${escapeHtml(formatDate(dateValue))}</span>
                        ${item.username ? `<span>@${escapeHtml(item.username)}</span>` : ''}
                    </div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action accept" data-friend-accept="${escapeHtml(item.requester_id)}">수락</button>
                    <button class="friend-action reject" data-friend-reject="${escapeHtml(item.requester_id)}">거절</button>
                </div>
            </article>
        `;
    }

    return `
        <article class="${cardClass}">
            <div class="friend-avatar" style="${friendAvatarStyle(item, gradient)}">${friendInitial(item)}</div>
            <div class="friend-info">
                <div class="friend-name-row">
                    <strong>${name}</strong>
                    <span class="friend-status-pill success">친구</span>
                </div>
                <p>${meta || '연결된 친구입니다.'}</p>
                <div class="friend-meta-row">
                    <span>${dateLabel} ${escapeHtml(formatDate(dateValue))}</span>
                    ${item.username ? `<span>@${escapeHtml(item.username)}</span>` : ''}
                </div>
            </div>
            <div class="friend-actions">
                <button class="friend-action message" data-friend-message="${escapeHtml(item.friend_id)}" title="메시지"><i class="fa-solid fa-comment"></i> 메시지 보내기</button>
                <button class="friend-action remove" data-friend-remove="${escapeHtml(item.friend_id)}" title="삭제"><i class="fa-solid fa-user-minus"></i> 친구 삭제</button>
            </div>
        </article>
    `;
}

async function loadDashboard(userId, isOperator) {
    const dashPassCount = document.getElementById('dashPassCount');
    const dashClassCount = document.getElementById('dashClassCount');
    const dashChatCount = document.getElementById('dashChatCount');
    const dashRecentClass = document.getElementById('dashRecentClass');

    if (isOperator) {
        if (dashPassCount) dashPassCount.textContent = '-';
        if (dashClassCount) dashClassCount.textContent = '전체';
        if (dashChatCount) dashChatCount.textContent = '전체';
        if (dashRecentClass) {
            dashRecentClass.innerHTML = '<div class="empty-state">운영자 모드에서는 전체 대시보드를 관리합니다.</div>';
        }
        return;
    }

    try {
        const [enrollRes, passRes, classRes] = await Promise.all([
            window.BSQ.api(`/api/enrollments?user_id=${encodeURIComponent(userId)}`),
            window.BSQ.api(`/api/user-passes?user_id=${encodeURIComponent(userId)}`),
            window.BSQ.api(`/api/classes?instructor_id=${encodeURIComponent(userId)}`),
        ]);

        const enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];
        const passes = passRes?.success ? (passRes.data || []) : [];
        const myClasses = classRes?.success ? (classRes.data || []) : [];

        const totalPasses = passes.reduce((sum, pass) => sum + (Number(pass.remaining_count || 0) > 0 ? Number(pass.remaining_count || 0) : 0), 0);

        if (dashPassCount) dashPassCount.textContent = `${totalPasses}개`;
        if (dashClassCount) dashClassCount.textContent = `${enrollments.length + myClasses.length}개`;
        if (dashChatCount) dashChatCount.textContent = `${enrollments.length}개`;

        if (!dashRecentClass) return;

        const recentEnrolls = enrollments.slice(0, 3);
        if (recentEnrolls.length > 0) {
            dashRecentClass.innerHTML = recentEnrolls.map((item) => `
                <div class="my-class-card" onclick="location.href='../class_view/class_view.html?id=${escapeHtml(item.class_id)}'" style="cursor:pointer;">
                    <div class="class-thumb ${item.image_url ? '' : 'placeholder-orange'}">
                        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                    </div>
                    <div class="class-info">
                        <h4>${escapeHtml(item.title || item.name || '클래스 이름')}</h4>
                        <p style="font-size:0.9rem;color:#888;">${escapeHtml(item.category || '기타')} · ${item.enrolled_at ? escapeHtml(formatDate(item.enrolled_at)) : '-'}</p>
                    </div>
                </div>
            `).join('');
            return;
        }

        if (myClasses.length > 0) {
            dashRecentClass.innerHTML = myClasses.slice(0, 3).map((item) => `
                <div class="my-class-card" onclick="location.href='../class_view/class_view.html?id=${escapeHtml(item.id)}'" style="cursor:pointer;">
                    <div class="class-thumb ${item.image_url ? '' : 'placeholder-orange'}">
                        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                    </div>
                    <div class="class-info">
                        <h4>${escapeHtml(item.title || '클래스 이름')}</h4>
                        <p style="font-size:0.9rem;color:#888;">${escapeHtml(item.category || '기타')} · 개설 클래스</p>
                    </div>
                </div>
            `).join('');
            return;
        }

        dashRecentClass.innerHTML = '<div class="empty-state">아직 수강 중인 클래스가 없습니다.<br><a href="../class/class_list.html" style="color:#6e8efb;">클래스를 둘러보기</a></div>';
    } catch (error) {
        console.error('[MyPage] dashboard load failed:', error);
        if (dashRecentClass) dashRecentClass.innerHTML = '<div class="empty-state">데이터를 불러오지 못했습니다.</div>';
    }
}
