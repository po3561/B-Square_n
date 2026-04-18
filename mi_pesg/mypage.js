function showMypageNotice(type, title, message, duration = 3000) {
    const host = document.getElementById('mypageNotice');
    if (!host) return;

    const notice = document.createElement('div');
    notice.className = `mypage-notice ${type || 'info'}`;
    notice.innerHTML = `
        <div class="mypage-notice-title">${escapeHtml(title || '')}</div>
        <div class="mypage-notice-message">${escapeHtml(message || '')}</div>
    `;

    host.replaceChildren(notice);

    if (duration > 0) {
        window.setTimeout(() => {
            if (notice.isConnected) notice.remove();
        }, duration);
    }
}

window.showMypageNotice = showMypageNotice;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}

function formatMoney(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString('ko-KR')}원`;
}

function countText(value, suffix = '개') {
    return `${Number(value || 0).toLocaleString('ko-KR')}${suffix}`;
}

function loginHref() {
    return `../login/login.html?redirect=${encodeURIComponent(window.location.href)}`;
}

function goLogin() {
    window.location.href = loginHref();
}

function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getBootCache() {
    return window.__BSQ_MYPAGE_CACHE__ || {};
}

function setBootCache(patch) {
    window.__BSQ_MYPAGE_CACHE__ = {
        ...getBootCache(),
        ...(patch || {}),
    };
    return window.__BSQ_MYPAGE_CACHE__;
}

function setAuthState(state) {
    document.body.dataset.authState = state;
}

function applyOperatorToggle(user, isOperatorEligible) {
    const opBtn = document.getElementById('operatorModeToggle');
    if (!opBtn) return;

    if (!isOperatorEligible) {
        opBtn.hidden = true;
        return;
    }

    opBtn.hidden = false;
    const enabled = localStorage.getItem('bsq_operator_view_mode') === '1';
    opBtn.textContent = enabled ? '일반 모드' : '운영자 모드';
    opBtn.onclick = () => {
        localStorage.setItem('bsq_operator_view_mode', enabled ? '0' : '1');
        window.location.reload();
    };
}

function updateDashboardProfileCard(currentUser, { guest = false, isOperatorEligible = false } = {}) {
    const avatarEl = document.getElementById('dashProfileAvatar');
    const nameEl = document.getElementById('dashProfileName');
    const usernameEl = document.getElementById('dashProfileUsername');
    const emailEl = document.getElementById('dashProfileEmail');
    const roleEl = document.getElementById('dashProfileRole');
    const referrerCodeEl = document.getElementById('displayReferrerCode');

    const profile = currentUser || {};
    const displayLabel = guest ? '로그인이 필요합니다' : (profile.name || profile.username || '사용자');
    const usernameLabel = guest ? 'ID: -' : `ID: ${profile.username || profile.id || '-'}`;
    const emailLabel = guest
        ? '로그인 후 확인'
        : (profile.email || '이메일 정보 없음');
    const roleLabel = guest
        ? '게스트'
        : (profile.role || (isOperatorEligible ? '운영자' : '일반 회원'));

    if (avatarEl) {
        const imageUrl = String(profile.profile_image_url || '').trim();
        if (imageUrl) {
            avatarEl.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
        } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = '👤';
        }
    }

    if (nameEl) nameEl.textContent = guest ? '게스트 모드' : `${displayLabel} 님`;
    if (usernameEl) usernameEl.textContent = usernameLabel;
    if (emailEl) emailEl.textContent = emailLabel;
    if (roleEl) roleEl.textContent = roleLabel;
    if (referrerCodeEl) {
        const referrerLabel = guest ? '' : String(profile.referrer_code || profile.referrerCode || '').trim();
        if (referrerLabel) {
            referrerCodeEl.hidden = false;
            referrerCodeEl.textContent = `추천인 코드: ${referrerLabel}`;
        } else {
            referrerCodeEl.hidden = true;
            referrerCodeEl.textContent = '';
        }
    }

    window.__BSQ_MYPAGE_PROFILE_STATE__ = {
        ...(window.__BSQ_MYPAGE_PROFILE_STATE__ || {}),
        ...(profile || {}),
        guest,
        isOperatorEligible,
    };
}

window.updateDashboardProfileCard = updateDashboardProfileCard;

function bindSidebarProfile(currentUser, { guest = false, isOperatorEligible = false } = {}) {
    document.body.dataset.authState = guest ? 'guest' : 'member';

    const nickname = document.getElementById('displayNickname');
    const displayName = document.getElementById('displayName');
    const email = document.getElementById('displayEmail');
    const username = document.getElementById('displayUsername');
    const referrerCode = document.getElementById('displayReferrerCode');
    const profileImg = document.getElementById('profileImg');
    const guestGate = document.getElementById('guestGate');
    const logoutButton = document.getElementById('logoutButton');
    const guestLoginButton = document.getElementById('guestLoginButton');
    const guestGateLoginButton = document.getElementById('guestGateLoginButton');
    const sessionNavButton = document.getElementById('sessionNavButton');

    if (guestGate) {
        guestGate.hidden = !guest;
    }

    const displayLabel = currentUser?.name || currentUser?.username || '사용자';
    if (nickname) nickname.textContent = guest ? '로그인이 필요합니다' : `${displayLabel} 님`;
    if (displayName) displayName.textContent = guest ? '-' : displayLabel;
    if (email) email.textContent = guest ? '로그인 후 이메일 정보를 확인할 수 있습니다.' : (currentUser?.email || '');
    if (username) username.textContent = guest ? 'ID: -' : `ID: ${currentUser?.username || currentUser?.id || '-'}`;
    if (referrerCode) {
        const referrerLabel = guest ? '' : String(currentUser?.referrer_code || currentUser?.referrerCode || '').trim();
        if (referrerLabel) {
            referrerCode.hidden = false;
            referrerCode.textContent = `추천인 코드: ${referrerLabel}`;
        } else {
            referrerCode.hidden = true;
            referrerCode.textContent = '';
        }
    }

    if (profileImg) {
        if (!guest && currentUser?.profile_image_url) {
            profileImg.style.backgroundImage = `url("${String(currentUser.profile_image_url).replace(/"/g, '%22')}")`;
            profileImg.style.backgroundSize = 'cover';
            profileImg.style.backgroundPosition = 'center';
            profileImg.textContent = '';
        } else {
            profileImg.style.backgroundImage = '';
            profileImg.textContent = '👤';
        }
    }

    if (guestLoginButton) {
        guestLoginButton.hidden = !guest;
        guestLoginButton.style.display = guest ? 'inline-flex' : 'none';
    }
    if (guestGateLoginButton) guestGateLoginButton.onclick = goLogin;

    if (logoutButton) {
        logoutButton.hidden = guest;
        logoutButton.style.display = guest ? 'none' : 'inline-flex';
        logoutButton.onclick = async () => {
            if (window.handleGlobalLogout) {
                await window.handleGlobalLogout();
                return;
            }
            goLogin();
        };
    }

    if (sessionNavButton) {
        const icon = sessionNavButton.querySelector('.nav-icon i');
        const label = sessionNavButton.querySelector('.nav-label');
        if (guest) {
            if (icon) icon.className = 'fa-solid fa-right-to-bracket';
            if (label) label.textContent = '로그인';
            sessionNavButton.onclick = goLogin;
        } else {
            if (icon) icon.className = 'fa-solid fa-right-from-bracket';
            if (label) label.textContent = '로그아웃';
            sessionNavButton.onclick = async () => {
                if (window.handleGlobalLogout) {
                    await window.handleGlobalLogout();
                    return;
                }
                goLogin();
            };
        }
    }

    applyOperatorToggle(currentUser, isOperatorEligible);
    updateDashboardProfileCard(currentUser, { guest, isOperatorEligible });
}

function bindNav() {
    const navButtons = Array.from(document.querySelectorAll('.nav-btn[data-target]'));
    const tabs = Array.from(document.querySelectorAll('.mypage-tab'));
    const editTab = document.getElementById('tabEditClass');

    function setActive(targetId, scrollTarget = '') {
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        document.body.dataset.currentMypageTab = targetId;

        navButtons.forEach((btn) => {
            const active = btn.dataset.target === targetId;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) btn.setAttribute('aria-current', 'page');
            else btn.removeAttribute('aria-current');
        });

        tabs.forEach((tab) => {
            const active = tab.id === targetId;
            tab.classList.toggle('active', active);
            if (tab.id === 'tabEditClass') {
                tab.hidden = !active;
            }
        });

        if (targetId !== 'tabEditClass' && editTab) {
            editTab.hidden = true;
        }

        localStorage.setItem('bsq-mypage-target-tab', targetId);

        if (scrollTarget) {
            window.setTimeout(() => {
                document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        } else {
            window.setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    }

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            setActive(btn.dataset.target);
        });
    });

    document.querySelectorAll('[data-open-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.openTab;
            if (!targetId) return;
            setActive(targetId, button.dataset.scrollTarget || '');
        });
    });

    const requestedTab = localStorage.getItem('bsq-mypage-target-tab');
    if (requestedTab) {
        localStorage.removeItem('bsq-mypage-target-tab');
        window.setTimeout(() => setActive(requestedTab), 0);
    }

    return { setActive };
}

function getCurrentMypageUserId() {
    return window.__BSQ_MYPAGE_CURRENT_USER_ID__ || window.__BSQ_MYPAGE_CACHE__?.userId || '';
}

function getDashboardDetailState() {
    const cache = window.__BSQ_MYPAGE_CACHE__ || {};
    const detail = cache.detail || {};

    const passes = Array.isArray(cache.passes) && cache.passes.length
        ? cache.passes
        : Array.isArray(detail.passes) && detail.passes.length
            ? detail.passes
            : [];

    const enrollments = Array.isArray(cache.enrollments) && cache.enrollments.length
        ? cache.enrollments
        : Array.isArray(detail.ongoing_classes) && detail.ongoing_classes.length
            ? detail.ongoing_classes
            : Array.isArray(cache.classes?.ongoing) && cache.classes.ongoing.length
                ? cache.classes.ongoing
                : [];

    const friends = Array.isArray(cache.friends) ? cache.friends : [];
    const pendingFriends = Array.isArray(cache.pendingFriends) ? cache.pendingFriends : [];

    return {
        passes,
        enrollments,
        friends,
        pendingFriends,
    };
}

function normalizeDashboardPassItem(item) {
    const remaining = safeNumber(item?.remaining_count ?? item?.remaining);
    const total = safeNumber(item?.total_count ?? item?.total);

    return {
        remaining,
        total,
        title: String(item?.class_title || item?.title || '클래스').trim(),
        category: String(item?.class_category || item?.category || '미분류').trim(),
        passType: String(item?.pass_type || item?.type || '').trim(),
        status: String(item?.status || '').trim() || (remaining > 0 ? '사용 가능' : '소진'),
        expiresAt: item?.expires_at || item?.expiresAt || '',
    };
}

function normalizeDashboardClassItem(item) {
    return {
        id: String(item?.class_id || item?.id || item?.reference_id || '').trim(),
        title: String(item?.title || item?.class_title || '제목 없음').trim(),
        category: String(item?.category || item?.class_category || '미분류').trim(),
        imageUrl: String(item?.image_url || item?.thumbnail_url || item?.cover_url || '').trim(),
        enrolledAt: item?.enrolled_at || item?.created_at || item?.joined_at || '',
    };
}

function buildDashboardPassDetailMarkup(passes = []) {
    if (!passes.length) {
        return '<div class="empty-state compact">보유 중인 수강권이 없습니다.</div>';
    }

    const availableCount = passes.filter((item) => safeNumber(item?.remaining_count ?? item?.remaining) > 0).length;
    const remainingTotal = passes.reduce((sum, item) => sum + safeNumber(item?.remaining_count ?? item?.remaining), 0);

    return `
        <div class="dashboard-detail-stats">
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(passes.length, '개'))}</strong>
                    <p>전체 수강권</p>
                </div>
                <span class="commerce-badge accent">총계</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(availableCount, '개'))}</strong>
                    <p>사용 가능</p>
                </div>
                <span class="commerce-badge accent">활성</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(remainingTotal, '회'))}</strong>
                    <p>잔여 횟수</p>
                </div>
                <span class="commerce-badge">누적</span>
            </article>
        </div>
        <div class="dashboard-detail-list">
            ${passes.map((item) => {
                const pass = normalizeDashboardPassItem(item);
                const ratio = pass.total > 0 ? `${pass.remaining}/${pass.total}` : `${pass.remaining}개`;
                const meta = [];
                if (pass.passType) meta.push(`유형 ${pass.passType}`);
                if (pass.expiresAt) meta.push(`만료 ${formatDate(pass.expiresAt)}`);

                return `
                    <article class="dashboard-detail-item">
                        <div class="dashboard-detail-item-top">
                            <div class="dashboard-detail-item-copy">
                                <strong>${escapeHtml(pass.title)}</strong>
                                <p>${escapeHtml(pass.category)}</p>
                            </div>
                            <span class="commerce-badge accent">${escapeHtml(ratio)}</span>
                        </div>
                        <div class="dashboard-detail-item-meta">
                            <span>${escapeHtml(pass.status)}</span>
                            ${meta.length ? `<span>${escapeHtml(meta.join(' · '))}</span>` : ''}
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function buildDashboardClassDetailMarkup(enrollments = [], passes = []) {
    if (!enrollments.length) {
        return '<div class="empty-state compact">수강 중인 클래스가 없습니다.</div>';
    }

    const linkedCount = enrollments.filter((enroll) => {
        const classId = String(enroll?.class_id || enroll?.id || enroll?.reference_id || '').trim();
        if (!classId) return false;
        return passes.some((pass) => String(pass?.class_id || '').trim() === classId);
    }).length;
    const passTotal = passes.reduce((sum, item) => sum + safeNumber(item?.remaining_count ?? item?.remaining), 0);

    return `
        <div class="dashboard-detail-stats">
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(enrollments.length, '개'))}</strong>
                    <p>수강 중인 클래스</p>
                </div>
                <span class="commerce-badge accent">현재</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(linkedCount, '개'))}</strong>
                    <p>수강권 연결</p>
                </div>
                <span class="commerce-badge accent">연결</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(passTotal, '회'))}</strong>
                    <p>잔여 횟수</p>
                </div>
                <span class="commerce-badge">총합</span>
            </article>
        </div>
        <div class="dashboard-detail-list">
            ${enrollments.map((item) => {
                const enroll = normalizeDashboardClassItem(item);
                const classId = enroll.id;
                const classPasses = classId
                    ? passes.filter((pass) => String(pass?.class_id || '').trim() === classId)
                    : [];
                const remaining = classPasses.reduce((sum, pass) => sum + safeNumber(pass?.remaining_count ?? pass?.remaining), 0);
                const passBadge = classPasses.length
                    ? `<span class="commerce-badge accent">수강권 ${escapeHtml(countText(remaining, '회'))}</span>`
                    : '<span class="commerce-badge">참여 중</span>';
                const tags = [enroll.category ? `<span class="commerce-badge accent">${escapeHtml(enroll.category)}</span>` : ''];
                const hasMonthlyPass = classPasses.some((pass) => String(pass?.pass_type || '').toLowerCase() === 'monthly' && String(pass?.status || '').toLowerCase() === 'active');
                if (hasMonthlyPass) tags.push('<span class="commerce-badge warm">정기 구독 중</span>');
                const classHref = classId ? `../class_view/class_view.html?id=${encodeURIComponent(classId)}` : '';
                const chatHref = classId ? `${classHref}#tabChat` : '';

                return `
                    <article class="my-class-card compact dashboard-detail-class-card">
                        <div class="my-class-cover ${enroll.imageUrl ? '' : 'placeholder-orange'}">
                            ${enroll.imageUrl ? `<img src="${escapeHtml(enroll.imageUrl)}" alt="${escapeHtml(enroll.title)}" loading="lazy">` : '<span>CLASS</span>'}
                        </div>
                        <div class="my-class-body">
                            <div class="my-class-head">
                                <div class="dashboard-detail-item-copy">
                                    <strong>${escapeHtml(enroll.title)}</strong>
                                    <p>${enroll.enrolledAt ? `수강일 ${escapeHtml(formatDate(enroll.enrolledAt))}` : '수강 정보 없음'}</p>
                                </div>
                                ${passBadge}
                            </div>
                            <div class="my-class-tags">
                                ${tags.filter(Boolean).join('')}
                            </div>
                            <div class="my-class-actions">
                                ${chatHref ? `<a class="btn-chat-link" href="${escapeHtml(chatHref)}">클래스 채널</a>` : ''}
                                ${classHref ? `<a class="btn-chat-link subtle" href="${escapeHtml(classHref)}">클래스 보기</a>` : ''}
                            </div>
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function buildDashboardFriendDetailMarkup(pending = [], friends = []) {
    const communityButton = '<button type="button" class="btn-chat-link" data-dashboard-detail-action="community">커뮤니티 가기</button>';

    return `
        <div class="dashboard-detail-stats">
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(pending.length, '건'))}</strong>
                    <p>받은 친구 요청</p>
                </div>
                <span class="commerce-badge accent">대기</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(friends.length, '명'))}</strong>
                    <p>내 친구</p>
                </div>
                <span class="commerce-badge accent">연결</span>
            </article>
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${escapeHtml(countText(pending.length + friends.length, '명'))}</strong>
                    <p>전체 연결</p>
                </div>
                <span class="commerce-badge">합계</span>
            </article>
        </div>
        <section class="dashboard-detail-section">
            <div class="friends-panel friends-panel-pending">
                <div class="friends-panel-head">
                    <h3>받은 친구 요청 <span>${escapeHtml(countText(pending.length, '건'))}</span></h3>
                </div>
                <div class="friends-panel-body dashboard-detail-friend-list">
                    ${pending.length
                        ? pending.map((item) => renderFriendCard(item, 'pending')).join('')
                        : '<div class="empty-state compact friends-empty">받은 요청이 없습니다.</div>'}
                </div>
            </div>
        </section>
        <section class="dashboard-detail-section">
            <div class="friends-panel">
                <div class="friends-panel-head friends-panel-head-inline">
                    <h3>내 친구 <span>${escapeHtml(countText(friends.length, '명'))}</span></h3>
                    ${communityButton}
                </div>
                <div class="friends-panel-body dashboard-detail-friend-list">
                    ${friends.length
                        ? friends.map((item) => renderFriendCard(item, 'accepted')).join('')
                        : '<div class="empty-state compact friends-empty">친구가 없습니다. 클래스 채널에서 먼저 연결을 만들어보세요.</div>'}
                </div>
            </div>
        </section>
    `;
}

function bindFriendActions(root, userId) {
    if (!root || !userId) return;

    root.querySelectorAll('[data-friend-accept]').forEach((button) => {
        button.addEventListener('click', async () => {
            await window.BSQ.api('/api/friends', {
                method: 'POST',
                body: JSON.stringify({ action: 'accept', user_id: userId, friend_id: button.dataset.friendAccept }),
            });
            await loadFriends(userId);
            refreshDashboardDetailModal();
        });
    });

    root.querySelectorAll('[data-friend-reject]').forEach((button) => {
        button.addEventListener('click', async () => {
            await window.BSQ.api('/api/friends', {
                method: 'POST',
                body: JSON.stringify({ action: 'reject', user_id: userId, friend_id: button.dataset.friendReject }),
            });
            await loadFriends(userId);
            refreshDashboardDetailModal();
        });
    });

    root.querySelectorAll('[data-friend-message]').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = `../community/community.html?dm=${encodeURIComponent(button.dataset.friendMessage)}`;
        });
    });

    root.querySelectorAll('[data-friend-remove]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (button.dataset.armed !== '1') {
                button.dataset.armed = '1';
                showMypageNotice('info', '친구 삭제 확인', '같은 버튼을 5초 안에 다시 누르면 친구가 삭제됩니다.');
                window.setTimeout(() => {
                    if (button.isConnected) button.dataset.armed = '';
                }, 5000);
                return;
            }

            button.dataset.armed = '';
            await window.BSQ.api('/api/friends', {
                method: 'POST',
                body: JSON.stringify({ action: 'remove', user_id: userId, friend_id: button.dataset.friendRemove }),
            });
            await loadFriends(userId);
            refreshDashboardDetailModal();
        });
    });

    root.querySelectorAll('[data-dashboard-detail-action="community"]').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = '../community/community.html';
        });
    });
}

function renderDashboardDetailModal(kind) {
    const modal = document.getElementById('dashboardDetailModal');
    const titleEl = document.getElementById('dashboardDetailTitle');
    const eyebrowEl = document.getElementById('dashboardDetailEyebrow');
    const descEl = document.getElementById('dashboardDetailDescription');
    const bodyEl = document.getElementById('dashboardDetailBody');
    if (!modal || !titleEl || !bodyEl) return;

    const resolvedKind = ['pass', 'class', 'friend'].includes(kind) ? kind : 'pass';
    const state = getDashboardDetailState();
    const metadata = {
        pass: {
            eyebrow: '수강권 상세보기',
            title: '보유 수강권',
            description: '남은 횟수와 상태를 한 번에 확인할 수 있습니다.',
        },
        class: {
            eyebrow: '클래스 상세보기',
            title: '수강 중인 클래스',
            description: '수강 중인 클래스와 바로가기를 한 화면에서 확인할 수 있습니다.',
        },
        friend: {
            eyebrow: '친구 목록보기',
            title: '내 친구',
            description: '받은 친구 요청과 연결된 친구 목록을 확인할 수 있습니다.',
        },
    }[resolvedKind];

    modal.dataset.detailKind = resolvedKind;
    titleEl.textContent = metadata.title;
    if (eyebrowEl) eyebrowEl.textContent = metadata.eyebrow;
    if (descEl) descEl.textContent = metadata.description;

    if (resolvedKind === 'pass') {
        bodyEl.innerHTML = buildDashboardPassDetailMarkup(state.passes);
    } else if (resolvedKind === 'class') {
        bodyEl.innerHTML = buildDashboardClassDetailMarkup(state.enrollments, state.passes);
    } else {
        bodyEl.innerHTML = buildDashboardFriendDetailMarkup(state.pendingFriends, state.friends);
    }

    bindFriendActions(bodyEl, getCurrentMypageUserId());
}

function refreshDashboardDetailModal() {
    const modal = document.getElementById('dashboardDetailModal');
    if (!modal || modal.hidden) return;
    renderDashboardDetailModal(modal.dataset.detailKind || 'pass');
}

async function openDashboardDetailModal(kind) {
    const modal = document.getElementById('dashboardDetailModal');
    const bodyEl = document.getElementById('dashboardDetailBody');
    if (!modal || !bodyEl) return;

    const resolvedKind = ['pass', 'class', 'friend'].includes(kind) ? kind : 'pass';
    modal.hidden = false;
    modal.classList.add('is-open');
    modal.dataset.detailKind = resolvedKind;
    document.body.classList.add('modal-open');
    bodyEl.innerHTML = '<div class="empty-state compact">상세 정보를 불러오는 중입니다.</div>';

    try {
        if (window.__BSQ_MYPAGE_BOOT_PROMISE__) {
            await window.__BSQ_MYPAGE_BOOT_PROMISE__;
        }
    } catch (error) {
        console.warn('[mypage] dashboard detail warmup failed:', error);
    }

    renderDashboardDetailModal(resolvedKind);
    window.requestAnimationFrame(() => {
        modal.querySelector('[data-close-dashboard-detail]')?.focus();
    });
}

function closeDashboardDetailModal() {
    const modal = document.getElementById('dashboardDetailModal');
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-open');
    delete modal.dataset.detailKind;
    document.body.classList.remove('modal-open');
}

function bindDashboardDetailModal() {
    document.querySelectorAll('[data-dashboard-detail]').forEach((button) => {
        button.addEventListener('click', () => {
            openDashboardDetailModal(button.dataset.dashboardDetail);
        });
    });

    document.querySelectorAll('[data-close-dashboard-detail]').forEach((button) => {
        button.addEventListener('click', closeDashboardDetailModal);
    });

    const modal = document.getElementById('dashboardDetailModal');
    modal?.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-close-dashboard-detail]')) {
            closeDashboardDetailModal();
        }
    });
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

function renderPassList(passes = []) {
    const host = document.getElementById('dashboardPassList');
    if (!host) return;

    if (!passes.length) {
        host.innerHTML = '<div class="empty-state compact">보유 중인 수강권이 없습니다.</div>';
        return;
    }

    host.innerHTML = passes.map((item) => {
        const remaining = safeNumber(item.remaining_count);
        const total = safeNumber(item.total_count);
        const ratio = total > 0 ? `${remaining}/${total}` : `${remaining}개`;
        const title = escapeHtml(item.class_title || '클래스');
        const category = escapeHtml(item.class_category || '미분류');
        return `
            <article class="dashboard-summary-item">
                <div class="dashboard-summary-copy">
                    <strong>${title}</strong>
                    <p>${category}</p>
                </div>
                <span class="commerce-badge accent">${escapeHtml(ratio)}</span>
            </article>
        `;
    }).join('');
}

async function loadFriends(userId) {
    const pendingArea = document.getElementById('pendingFriendList');
    const friendArea = document.getElementById('friendListArea');
    const pendingCount = document.getElementById('pendingCount');
    const friendCount = document.getElementById('friendCount');
    const dashFriendCount = document.getElementById('dashFriendCount');
    if (!pendingArea || !friendArea) return;

    pendingArea.innerHTML = '<div class="friend-loading">받은 요청을 불러오는 중...</div>';
    friendArea.innerHTML = '<div class="friend-loading">친구 목록을 불러오는 중...</div>';

    try {
        const [pendingRes, friendRes] = await Promise.all([
            window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(userId)}&pending=1`),
            window.BSQ.api(`/api/friends?user_id=${encodeURIComponent(userId)}`),
        ]);

        const pending = pendingRes?.success ? (pendingRes.data || []) : [];
        const friends = friendRes?.success ? (friendRes.data || []) : [];

        if (pendingCount) pendingCount.textContent = String(pending.length);
        if (friendCount) friendCount.textContent = String(friends.length);
        if (dashFriendCount) dashFriendCount.textContent = countText(friends.length, '명');

        pendingArea.innerHTML = pending.length
            ? pending.map((item) => renderFriendCard(item, 'pending')).join('')
            : '<div class="empty-state compact friends-empty">받은 요청이 없습니다.</div>';

        friendArea.innerHTML = friends.length
            ? friends.map((item) => renderFriendCard(item, 'accepted')).join('')
            : '<div class="empty-state compact friends-empty">친구가 없습니다. 클래스 채널에서 먼저 연결을 만들어보세요.</div>';

        bindFriendActions(pendingArea, userId);
        bindFriendActions(friendArea, userId);

        window.__BSQ_MYPAGE_CACHE__ = {
            ...(window.__BSQ_MYPAGE_CACHE__ || {}),
            friends,
            pendingFriends: pending,
            updatedAt: Date.now(),
        };
        refreshDashboardDetailModal();
    } catch (error) {
        console.error('[MyPage] friends load failed:', error);
        if (pendingCount) pendingCount.textContent = '0';
        if (friendCount) friendCount.textContent = '0';
        if (dashFriendCount) dashFriendCount.textContent = '0명';
        pendingArea.innerHTML = '<div class="empty-state compact friends-empty error">받은 요청을 불러오지 못했습니다.</div>';
        friendArea.innerHTML = '<div class="empty-state compact friends-empty error">친구 목록을 불러오지 못했습니다.</div>';
        showMypageNotice('error', '친구 목록을 불러오지 못했습니다', '네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
    }
}

window.loadMypageFriends = loadFriends;

async function loadDashboard(userId, isOperator) {
    const passCountEl = document.getElementById('dashPassCount');
    const classCountEl = document.getElementById('dashClassCount');
    const paymentSummaryCount = document.getElementById('paymentSummaryCount');
    const paymentSummarySubtotal = document.getElementById('paymentSummarySubtotal');
    const paymentSummaryDiscount = document.getElementById('paymentSummaryDiscount');
    const paymentSummaryTotal = document.getElementById('paymentSummaryTotal');
    const guestGate = document.getElementById('guestGate');

    if (guestGate) guestGate.hidden = true;

    if (isOperator) {
        if (passCountEl) passCountEl.textContent = '-';
        if (classCountEl) classCountEl.textContent = '전체';
        if (paymentSummaryCount) paymentSummaryCount.textContent = '전체';
        if (paymentSummarySubtotal) paymentSummarySubtotal.textContent = '-';
        if (paymentSummaryDiscount) paymentSummaryDiscount.textContent = '-';
        if (paymentSummaryTotal) paymentSummaryTotal.textContent = '-';
        return;
    }

    try {
        const detailRes = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`);
        if (!detailRes?.success || !detailRes.data) {
            throw new Error(detailRes?.error || '사용자 정보를 불러오지 못했습니다.');
        }

        const detail = detailRes.data;
        const passes = Array.isArray(detail.passes) ? detail.passes : [];
        const summary = detail.summary || {};

        window.__BSQ_MYPAGE_CACHE__ = {
            ...(window.__BSQ_MYPAGE_CACHE__ || {}),
            userId,
            detail,
            passes,
            classes: {
                subscribed: Array.isArray(detail.subscribed_classes) ? detail.subscribed_classes : [],
                ongoing: Array.isArray(detail.ongoing_classes) ? detail.ongoing_classes : [],
                instructor: Array.isArray(detail.instructor_classes) ? detail.instructor_classes : [],
            },
            payments: Array.isArray(detail.payments) ? detail.payments : [],
            updatedAt: Date.now(),
        };

        if (passCountEl) {
            passCountEl.textContent = countText(summary.pass_remaining_count ?? passes.reduce((sum, item) => sum + safeNumber(item.remaining_count), 0));
        }
        if (classCountEl) {
            classCountEl.textContent = countText(summary.ongoing_class_count ?? summary.subscribed_class_count ?? 0);
        }

        renderPassList(passes);
        await loadFriends(userId);
        syncPaymentSummaryFromCache();
        renderClassBanner().catch(() => {});
        refreshDashboardDetailModal();
    } catch (error) {
        console.error('[MyPage] dashboard load failed:', error);
        if (passCountEl) passCountEl.textContent = '0개';
        if (classCountEl) classCountEl.textContent = '0개';
        const passList = document.getElementById('dashboardPassList');
        if (passList) passList.innerHTML = '<div class="empty-state compact">데이터를 불러오지 못했습니다.</div>';
        showMypageNotice('error', '대시보드 정보를 불러오지 못했습니다', '상세보기를 눌러 다시 시도해 주세요.');
    }
}

function syncPaymentSummaryFromCache() {
    const cache = getBootCache();
    const cart = Array.isArray(cache.cart) ? cache.cart : [];
    const subtotal = cart.reduce((sum, item) => {
        const price = safeNumber(item.price || item.class_price || item.sale_price || 0);
        const quantity = Math.max(1, safeNumber(item.quantity || 1));
        return sum + (price * quantity);
    }, 0);
    const discount = safeNumber(cache.checkoutPreview?.discount_total || cache.checkoutPreview?.discount_amount || cache.paymentDraft?.discount_amount || 0);
    const total = Math.max(0, subtotal - discount);

    setText('paymentSummaryCount', countText(cart.length));
    setText('paymentSummarySubtotal', formatMoney(subtotal));
    setText('paymentSummaryDiscount', discount > 0 ? `-${formatMoney(discount)}` : '0원');
    setText('paymentSummaryTotal', formatMoney(total));

    const btn = document.getElementById('btnCheckoutNow');
    if (btn) btn.disabled = cart.length === 0;
}

async function renderClassBanner() {
    const track = document.getElementById('classTabBannerTrack');
    if (!track) return;

    const settings = window.__BSQ_SITE_SETTINGS__ || (window.BSQ?.siteSettingsReady?.then ? await window.BSQ.siteSettingsReady.catch(() => null) : null);
    const banners = Array.isArray(settings?.bottom_banners) ? settings.bottom_banners : [];
    const first = banners.find((item) => String(item?.imgUrl || item?.image || item?.src || '').trim());
    if (!first) return;

    const img = String(first.imgUrl || first.image || first.src || '').trim();
    const link = String(first.linkUrl || first.link || '').trim();
    const alt = String(first.alt || first.title || '하단 배너').trim();

    track.innerHTML = link
        ? `<a class="home-banner-slide is-active" href="${escapeHtml(link)}" aria-label="${escapeHtml(alt)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async"></a>`
        : `<div class="home-banner-slide is-active"><img src="${escapeHtml(img)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async"></div>`;
}

async function loadCheckoutPreview(options = {}) {
    const cache = getBootCache();
    const items = Array.isArray(cache.cart) ? cache.cart : [];
    const listHost = document.getElementById('checkoutModalList');
    if (listHost) {
        listHost.innerHTML = items.length
            ? items.map((item) => {
                const quantity = Math.max(1, safeNumber(item.quantity || 1));
                const price = safeNumber(item.price || item.class_price || item.sale_price || 0);
                const lineTotal = price * quantity;
                return `
                    <article class="checkout-item">
                        <div class="checkout-item-thumb"${item.imageUrl ? ` style="background-image:url('${escapeHtml(item.imageUrl)}')"` : ''}></div>
                        <div class="checkout-item-body">
                            <strong>${escapeHtml(item.title || item.class_title || '클래스')}</strong>
                            <p>${escapeHtml(item.subtitle || item.category || item.class_category || '')}${quantity > 1 ? ` · 수량 ${quantity}` : ''}</p>
                        </div>
                        <div class="checkout-item-price">${escapeHtml(formatMoney(lineTotal))}</div>
                    </article>
                `;
            }).join('')
            : '<div class="empty-state compact">장바구니가 비어 있습니다.</div>';
    }

    const couponCode = String(options.coupon_code || document.getElementById('checkoutCouponCode')?.value || '').trim();
    const payMethod = String(options.pay_method || document.getElementById('checkoutPaymentMethod')?.value || 'card').trim();
    const selectedIds = Array.isArray(options.selected_ids) && options.selected_ids.length
        ? options.selected_ids
        : items.map((item) => item.id || item.referenceId || item.class_id).filter(Boolean);

    try {
        const res = await window.BSQ.api('/api/cart/checkout', {
            method: 'POST',
            body: JSON.stringify({
                dry_run: true,
                coupon_code: couponCode || null,
                pay_method: payMethod || 'card',
                selected_ids: selectedIds,
            }),
        });

        if (res?.success && res.data) {
            setBootCache({ checkoutPreview: res.data });
            setText('checkoutModalCount', countText(res.data.item_count || selectedIds.length));
            setText('checkoutModalSubtotal', formatMoney(res.data.subtotal || 0));
            setText('checkoutModalDiscount', res.data.discount_total > 0 ? `-${formatMoney(res.data.discount_total)}` : '0원');
            setText('checkoutModalTotal', formatMoney(res.data.total || 0));
            syncPaymentSummaryFromCache();
        }
    } catch (error) {
        console.warn('[MyPage] checkout preview failed:', error);
    }
}

function openCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('modal-open');
    loadCheckoutPreview().catch(() => {});
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

function bindCheckoutModal() {
    document.querySelectorAll('[data-close-checkout]').forEach((button) => {
        button.addEventListener('click', closeCheckoutModal);
    });

    document.getElementById('btnCheckoutNow')?.addEventListener('click', openCheckoutModal);

    document.getElementById('checkoutCouponCode')?.addEventListener('input', () => {
        window.clearTimeout(window.__BSQ_CHECKOUT_PREVIEW_TIMER__);
        window.__BSQ_CHECKOUT_PREVIEW_TIMER__ = window.setTimeout(() => {
            loadCheckoutPreview().catch(() => {});
        }, 220);
    });

    document.getElementById('checkoutPaymentMethod')?.addEventListener('change', () => {
        loadCheckoutPreview().catch(() => {});
    });

    document.getElementById('checkoutSubmit')?.addEventListener('click', async () => {
        const cache = getBootCache();
        const items = Array.isArray(cache.cart) ? cache.cart : [];
        const selectedIds = items.map((item) => item.id || item.referenceId || item.class_id).filter(Boolean);
        const couponCode = document.getElementById('checkoutCouponCode')?.value.trim();
        const payMethod = document.getElementById('checkoutPaymentMethod')?.value || 'card';
        const message = document.getElementById('checkoutModalMessage');
        const submitBtn = document.getElementById('checkoutSubmit');

        if (!selectedIds.length) {
            if (message) {
                message.textContent = '장바구니가 비어 있습니다.';
                message.className = 'commerce-message error';
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '처리 중...';
        }

        try {
            const res = await window.BSQ.api('/api/cart/checkout', {
                method: 'POST',
                body: JSON.stringify({
                    selected_ids: selectedIds,
                    coupon_code: couponCode || null,
                    pay_method: payMethod,
                    dry_run: false,
                }),
            });

            if (!res?.success) throw new Error(res?.error || '결제에 실패했습니다.');

            if (message) {
                message.textContent = '결제가 완료되었습니다.';
                message.className = 'commerce-message success';
            }

            setBootCache({ cart: [], checkoutPreview: null, paymentDraft: null });
            closeCheckoutModal();
            window.BSQ.triggerSync('cart');
            window.BSQ.triggerSync('enroll');
            window.BSQ.triggerSync('checkout');
            window.loadEnrolledClasses?.(true);
            window.loadMyClasses?.(true);
            syncPaymentSummaryFromCache();
            showMypageNotice('success', '결제 완료', '장바구니 결제가 완료되었습니다.');
        } catch (error) {
            if (message) {
                message.textContent = error.message || '결제 실패';
                message.className = 'commerce-message error';
            }
            showMypageNotice('error', '결제 실패', error.message || '장바구니 결제 처리 중 오류가 발생했습니다.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '결제하기';
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const dashboardModal = document.getElementById('dashboardDetailModal');
        if (dashboardModal && !dashboardModal.hidden) {
            closeDashboardDetailModal();
            return;
        }
        if (!document.getElementById('checkoutModal')?.hidden) {
            closeCheckoutModal();
        }
    });
}

function bindSyncListeners(userId) {
    if (window.__BSQ_MYPAGE_SYNC_LISTENER_BOUND__) return;
    window.__BSQ_MYPAGE_SYNC_LISTENER_BOUND__ = true;

    window.addEventListener('bsq_sync', (event) => {
        const type = event.detail?.type;
        if (type === 'cart' || type === 'coupon_wallet' || type === 'coupon' || type === 'payment_methods' || type === 'checkout') {
            syncPaymentSummaryFromCache();
        }
        if (type === 'class-categories') {
            window.dispatchEvent(new CustomEvent('bsq_refresh_categories', { detail: { userId } }));
        }
        if (type === 'enroll') {
            window.loadEnrolledClasses?.(true);
            window.loadMyClasses?.(true);
            syncPaymentSummaryFromCache();
        }
    });

    window.addEventListener('storage', (event) => {
        if (event.key === `bsq-cart:${userId}`) {
            syncPaymentSummaryFromCache();
        }
    });
}

function initGuestMode() {
    document.body.dataset.authState = 'guest';
    const guestGate = document.getElementById('guestGate');
    if (guestGate) guestGate.hidden = false;
    bindSidebarProfile(null, { guest: true, isOperatorEligible: false });
    showMypageNotice('info', '로그인이 필요합니다', '로그인 후 마이페이지를 이용할 수 있습니다.');
    syncPaymentSummaryFromCache();
}

function bindGlobalActions() {
    document.getElementById('guestLoginButton')?.addEventListener('click', goLogin);
    document.getElementById('guestGateLoginButton')?.addEventListener('click', goLogin);

    const guestGate = document.getElementById('guestGate');
    if (guestGate) guestGate.querySelectorAll('button').forEach((button) => {
        if (button.id === 'guestGateLoginButton') button.onclick = goLogin;
    });
}

function waitForSessionReady(timeoutMs = 1500) {
    const currentSession = window.BSQ?.session || null;
    if (currentSession?.user) return Promise.resolve(currentSession);

    return new Promise((resolve) => {
        let settled = false;
        let timer = null;

        const finish = (value) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('bsq_session', onSession);
            window.clearTimeout(timer);
            resolve(value || window.BSQ?.session || null);
        };

        const onSession = (event) => {
            if (event.detail?.user) {
                finish(event.detail.session || window.BSQ?.session || event.detail);
            }
        };

        window.addEventListener('bsq_session', onSession);
        timer = window.setTimeout(() => finish(window.BSQ?.session || null), timeoutMs);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    let session = window.BSQ?.session || null;
    let isOperator = !!window.__BSQ_DEV_MODE__;

    if (!session && !isOperator && window.BSQ?.ready?.then) {
        try {
            await window.BSQ.ready;
        } catch {
            // ignore auth bootstrap errors and fall through with the current state
        }
        session = window.BSQ?.session || null;
        isOperator = !!window.__BSQ_DEV_MODE__;
    }

    if (!session && !isOperator) {
        session = await waitForSessionReady(1500);
        isOperator = !!window.__BSQ_DEV_MODE__;
    }

    bindGlobalActions();
    const { setActive } = bindNav();
    bindDashboardDetailModal();
    bindCheckoutModal();
    bindSyncListeners(session?.user?.id || 'guest');

    const guest = !session && !isOperator;
    if (guest) {
        initGuestMode();
        renderClassBanner().catch(() => {});
        return;
    }

    const user = isOperator
        ? (window.__BSQ_OPERATOR_PROFILE__ || { name: '운영자', email: 'operator@b-square.kr', username: 'operator' })
        : session.user;
    const userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    window.__BSQ_MYPAGE_CURRENT_USER_ID__ = userId;

    document.body.dataset.authState = 'member';
    const operatorEligible = isOperator || ['operator', 'admin', 'super_admin'].includes(String(user?.role || '').toLowerCase());
    bindSidebarProfile(user, { guest: false, isOperatorEligible: operatorEligible });
    renderClassBanner().catch(() => {});

    window.__BSQ_MYPAGE_CACHE__ = window.__BSQ_MYPAGE_CACHE__ || {};
    window.__BSQ_MYPAGE_BOOT_PROMISE__ = loadDashboard(userId, isOperator).catch((error) => {
        console.error('[MyPage] dashboard boot failed:', error);
        showMypageNotice('error', '대시보드 정보를 불러오지 못했습니다', '상세보기를 눌러 다시 시도해 주세요.');
        return null;
    });
    void window.__BSQ_MYPAGE_BOOT_PROMISE__;

    if (typeof window.initClassesTab === 'function') window.initClassesTab(null, userId);
    if (typeof window.initProfileTab === 'function') window.initProfileTab(userId, user);
    if (typeof window.initSecurityTab === 'function') window.initSecurityTab(userId);
    if (typeof window.initPaymentMethodsTab === 'function') window.initPaymentMethodsTab(userId);
    else if (typeof window.initChatSubTab === 'function') window.initChatSubTab(userId);

    const requestedTab = localStorage.getItem('bsq-mypage-target-tab');
    if (requestedTab) {
        localStorage.removeItem('bsq-mypage-target-tab');
        setActive(requestedTab);
    }

    syncPaymentSummaryFromCache();
});
