// Admin member management tab

const USER_DETAIL_MODAL_ID = 'userDetailModal';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR');
}

function formatDateOnly(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ko-KR');
}

function formatMoney(value) {
  const num = Number(value || 0);
  return `${num.toLocaleString('ko-KR')}원`;
}

function ensureUsersToolbar() {
  const usersHeader = document.querySelector('#tabUsers .card-header');
  if (usersHeader && !document.getElementById('searchInputUsers')) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-left:auto;';
    wrapper.innerHTML = `
      <input type="text" id="searchInputUsers" class="admin-form-input" placeholder="닉네임, 이름, 이메일, 연락처 검색" style="width:260px; margin:0;">
      <button type="button" id="btnReloadUsers" class="btn-small outline">새로고침</button>
    `;
    usersHeader.appendChild(wrapper);
  }

  const sectionTitle = document.querySelector('#tabUsers .section-title');
  if (sectionTitle) sectionTitle.textContent = '가입 회원';

  const sectionDescription = document.querySelector('#tabUsers .card-header p');
  if (sectionDescription) {
    sectionDescription.textContent = '전체 가입 회원 목록을 확인하고 관리합니다.';
  }

  const thead = document.querySelector('#tabUsers thead');
  if (thead && !thead.dataset.usersHeaderReady) {
    thead.innerHTML = `
      <tr>
        <th>닉네임</th>
        <th>이름</th>
        <th>연락처</th>
        <th>메일</th>
        <th>생년월일</th>
        <th>가입일자</th>
        <th>블랙리스트</th>
      </tr>
    `;
    thead.dataset.usersHeaderReady = '1';
  }

  const loadingCell = document.querySelector('#allUsersTableBody td[colspan]');
  if (loadingCell && loadingCell.colSpan !== 7) {
    loadingCell.colSpan = 7;
  }
}

function ensureUserDetailModal() {
  let modal = document.getElementById(USER_DETAIL_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = USER_DETAIL_MODAL_ID;
  modal.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2100',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'background:rgba(15,23,42,0.58)',
    'backdrop-filter:blur(8px)',
    'padding:1rem',
  ].join(';');

  modal.innerHTML = `
    <div style="width:min(980px, 100%); max-height:92vh; background:#fff; border-radius:22px; box-shadow:0 30px 80px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.5rem; border-bottom:1px solid #e5e7eb;">
        <div>
          <div style="font-size:0.85rem; color:#64748b;">회원 상세 정보</div>
          <h3 id="userDetailTitle" style="margin:0.2rem 0 0; font-size:1.15rem;">-</h3>
        </div>
        <button type="button" id="userDetailCloseBtn" class="btn-small outline">닫기</button>
      </div>
      <div id="userDetailBody" style="padding:1.5rem; overflow:auto;"></div>
    </div>
  `;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeUserDetail();
  });
  modal.querySelector('#userDetailCloseBtn')?.addEventListener('click', closeUserDetail);
  document.body.appendChild(modal);
  return modal;
}

function closeUserDetail() {
  const modal = document.getElementById(USER_DETAIL_MODAL_ID);
  if (modal) modal.style.display = 'none';
}

function renderEmptyState(message, colspan = 7) {
  return `<tr><td colspan="${colspan}" style="text-align:center; padding:2rem; color:var(--admin-text-muted);">${escapeHtml(message)}</td></tr>`;
}

function renderUserRow(user) {
  const nickname = user.username || user.nickname || '-';
  const name = user.name || '-';
  const phone = user.phone || '-';
  const email = user.email || '-';
  const birthdate = user.birthdate || [user.birth_year, user.birth_month, user.birth_day].filter(Boolean).join('-') || '-';
  const signupDate = user.signup_date || user.created_at || '-';
  const isBlacklisted = !!user.is_blacklisted;

  return `
    <tr data-user-row="1" data-user-id="${escapeHtml(user.id)}" style="cursor:pointer;">
      <td><strong>${escapeHtml(nickname)}</strong></td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(birthdate)}</td>
      <td>${escapeHtml(formatDateOnly(signupDate))}</td>
      <td>
        <button type="button"
          class="btn-small ${isBlacklisted ? 'outline' : 'primary'}"
          data-blacklist-btn="1"
          data-user-id="${escapeHtml(user.id)}"
          data-is-blacklisted="${isBlacklisted ? '1' : '0'}">
          ${isBlacklisted ? '해제' : '등록'}
        </button>
      </td>
    </tr>
  `;
}

function renderList(users) {
  const tbody = document.getElementById('allUsersTableBody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = renderEmptyState('가입된 회원이 없습니다.');
    return;
  }
  tbody.innerHTML = users.map(renderUserRow).join('');
}

async function loadAdminUsers() {
  const tbody = document.getElementById('allUsersTableBody');
  if (!tbody) return;

  if (window.BSQ?.ready) await window.BSQ.ready;

  const searchTerm = document.getElementById('searchInputUsers')?.value?.trim() || '';
  tbody.innerHTML = renderEmptyState('회원 정보를 불러오는 중입니다...');

  try {
    const qs = new URLSearchParams();
    if (searchTerm) qs.set('search', searchTerm);
    qs.set('limit', '1000');

    const res = await window.BSQ.api(`/api/users?${qs.toString()}`);
    if (!res?.success) throw new Error(res?.error || '회원 목록을 불러오지 못했습니다.');

    const users = Array.isArray(res.data) ? res.data : [];
    renderList(users);
  } catch (err) {
    console.error('[Admin Users] load failed:', err);
    tbody.innerHTML = renderEmptyState(`데이터 로딩 실패: ${err.message}`);
  }
}

function sectionBlock(title, content) {
  return `
    <section style="display:grid; gap:0.75rem; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
      <h4 style="margin:0; font-size:0.98rem;">${escapeHtml(title)}</h4>
      ${content}
    </section>
  `;
}

function renderItemList(items, emptyMessage, formatter) {
  if (!items || !items.length) {
    return `<div style="padding:1rem; color:var(--admin-text-muted); text-align:center; border:1px dashed #dbe4f0; border-radius:14px;">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div style="display:grid; gap:0.75rem;">
      ${items.map((item) => formatter(item)).join('')}
    </div>
  `;
}

function renderClassItem(item) {
  return `
    <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">${escapeHtml(item.class_title || item.title || '-')}</div>
          <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.class_category || item.category || '')}</div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          ${item.status ? `<span class="admin-badge muted">${escapeHtml(item.status)}</span>` : ''}
          ${item.pay_method ? `<span class="admin-badge primary">${escapeHtml(item.pay_method)}</span>` : ''}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
        <div><div style="color:#64748b; font-size:0.75rem;">수강일</div><div>${escapeHtml(formatDate(item.enrolled_at || item.created_at))}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoney(item.amount || item.final_amount || 0))}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">수업방식</div><div>${escapeHtml(item.operating_mode || item.class_type || '-')}</div></div>
      </div>
    </div>
  `;
}

function renderPassItem(item) {
  return `
    <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">${escapeHtml(item.class_title || '-')}</div>
          <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.class_category || '')}</div>
        </div>
        <span class="admin-badge ${item.status === 'active' ? 'primary' : 'muted'}">${escapeHtml(item.status || 'active')}</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
        <div><div style="color:#64748b; font-size:0.75rem;">잔여 수강권</div><div>${escapeHtml(String(item.remaining_count ?? 0))}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">총 수강권</div><div>${escapeHtml(String(item.total_count ?? 0))}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">유형</div><div>${escapeHtml(item.pass_type || '-')}</div></div>
      </div>
    </div>
  `;
}

async function openUserDetail(userId) {
  if (window.BSQ?.ready) await window.BSQ.ready;
  const modal = ensureUserDetailModal();
  const body = modal.querySelector('#userDetailBody');
  const title = modal.querySelector('#userDetailTitle');

  body.innerHTML = '<div style="padding:2rem; text-align:center; color:#64748b;">회원 상세 정보를 불러오는 중입니다...</div>';
  modal.style.display = 'flex';

  try {
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`);
    if (!res?.success || !res.data) throw new Error(res?.error || '회원 상세 정보를 가져오지 못했습니다.');

    const detail = res.detail || res.data || {};
    const user = detail.user || res.data;
    const summary = detail.summary || {};
    const subscribedClasses = detail.subscribed_classes || [];
    const ongoingClasses = detail.ongoing_classes || [];
    const payments = detail.payments || [];
    const passes = detail.passes || [];

    title.textContent = `${user.username || user.name || user.email || user.id} 회원 상세`;

    body.innerHTML = `
      <div style="display:grid; gap:1rem;">
        <section style="display:grid; grid-template-columns:110px 1fr; gap:1rem; align-items:start; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
          <img src="${escapeHtml(user.profile_image_url || '/assets/default-avatar.svg')}" alt="" style="width:110px; height:110px; border-radius:24px; object-fit:cover; background:#f8fafc;">
          <div style="display:grid; gap:0.75rem;">
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
              <span class="admin-badge primary">${escapeHtml(user.role || 'user')}</span>
              <span class="admin-badge muted">${escapeHtml(user.membership_level || 'Free')}</span>
              ${user.is_blacklisted ? '<span class="admin-badge danger">블랙리스트</span>' : '<span class="admin-badge muted">정상</span>'}
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem;">
              <div><div style="font-size:0.75rem; color:#64748b;">닉네임</div><div style="font-weight:600;">${escapeHtml(user.username || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">이름</div><div style="font-weight:600;">${escapeHtml(user.name || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">연락처</div><div style="font-weight:600;">${escapeHtml(user.phone || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">메일</div><div style="font-weight:600;">${escapeHtml(user.email || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">생년월일</div><div style="font-weight:600;">${escapeHtml(user.birthdate || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">가입일자</div><div style="font-weight:600;">${escapeHtml(formatDate(user.signup_date || user.created_at))}</div></div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:0.75rem;">
              <div><div style="font-size:0.75rem; color:#64748b;">총 결제금액</div><div style="font-weight:600;">${escapeHtml(formatMoney(summary.total_paid_amount || 0))}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">수강 클래스</div><div style="font-weight:600;">${escapeHtml(String(summary.subscribed_class_count || 0))}개</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">현재 수강 중</div><div style="font-weight:600;">${escapeHtml(String(summary.ongoing_class_count || 0))}개</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">잔여 수강권</div><div style="font-weight:600;">${escapeHtml(String(summary.pass_remaining_count || 0))}개</div></div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" class="btn-small ${user.is_blacklisted ? 'outline' : 'primary'}" onclick="toggleUserBlacklist('${escapeJsString(user.id)}', ${user.is_blacklisted ? 'true' : 'false'})">
                ${user.is_blacklisted ? '블랙리스트 해제' : '블랙리스트 등록'}
              </button>
              <button type="button" class="btn-small outline" onclick="closeUserDetail()">닫기</button>
            </div>
          </div>
        </section>

        ${sectionBlock('계정 상태', `
          <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; font-size:0.9rem;">
            <div><div style="color:#64748b; font-size:0.75rem;">회원 구분</div><div>${escapeHtml(user.role || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">운영자 순번</div><div>${escapeHtml(user.operator_seq ? `#${user.operator_seq}` : '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">회원등급</div><div>${escapeHtml(user.membership_level || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">성별</div><div>${escapeHtml(user.gender || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">국적</div><div>${escapeHtml(user.nationality || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">선호 카테고리</div><div>${escapeHtml(user.preferred_category || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">SNS 링크</div><div>${escapeHtml(user.sns_link || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">역할 수정자</div><div>${escapeHtml(user.role_updated_by || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">역할 수정일</div><div>${escapeHtml(formatDate(user.role_updated_at || '-'))}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 처리일</div><div>${escapeHtml(formatDate(user.blacklisted_at || '-'))}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 처리자</div><div>${escapeHtml(user.blacklisted_by || '-')}</div></div>
            <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 사유</div><div>${escapeHtml(user.blacklist_reason || '-')}</div></div>
          </div>
        `)}

        ${sectionBlock('가입한 클래스', renderItemList(subscribedClasses, '가입한 클래스가 없습니다.', renderClassItem))}
        ${sectionBlock('현재 수강 중인 클래스', renderItemList(ongoingClasses, '현재 수강 중인 클래스가 없습니다.', renderClassItem))}
        ${sectionBlock('결제 내역', renderItemList(payments, '결제 내역이 없습니다.', (item) => `
          <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
              <div>
                <div style="font-weight:700;">${escapeHtml(item.class_title || '결제 내역')}</div>
                <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.order_id || '')}</div>
              </div>
              <span class="admin-badge muted">${escapeHtml(item.status || '-')}</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
              <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoney(item.final_amount || item.amount || 0))}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">할인금액</div><div>${escapeHtml(formatMoney(item.discount_amount || 0))}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">결제수단</div><div>${escapeHtml(item.pay_method || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">결제일</div><div>${escapeHtml(formatDate(item.paid_at || item.created_at))}</div></div>
            </div>
          </div>
        `))}
        ${sectionBlock('수강권', renderItemList(passes, '보유 수강권이 없습니다.', renderPassItem))}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--admin-danger);">상세 정보를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
  }
}

async function toggleUserBlacklist(userId, currentState) {
  const enable = !currentState;
  const reason = enable
    ? prompt('블랙리스트 사유를 입력하세요. 비워두면 저장됩니다.')
    : prompt('블랙리스트 해제 사유를 입력하세요. 비워두면 저장됩니다.');

  if (reason === null) return;

  try {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: {
        blacklisted: enable,
        blacklist_reason: reason || '',
      },
    });

    if (!res?.success) throw new Error(res?.error || '블랙리스트 상태 변경 실패');

    await loadAdminUsers();
    if (document.getElementById(USER_DETAIL_MODAL_ID)?.style.display === 'flex') {
      await openUserDetail(userId);
    }
    alert(enable ? '블랙리스트에 등록했습니다.' : '블랙리스트를 해제했습니다.');
  } catch (err) {
    alert(`블랙리스트 변경 실패: ${err.message}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureUsersToolbar();

  const tabUsers = document.getElementById('tabUsers');
  if (tabUsers && tabUsers.classList.contains('active')) {
    loadAdminUsers();
  }

  window.addEventListener('adminTabChanged', (e) => {
    if (e.detail?.tabId === 'tabUsers') {
      ensureUsersToolbar();
      loadAdminUsers();
    }
  });

  document.addEventListener('click', (event) => {
    const reloadBtn = event.target.closest('#btnReloadUsers');
    if (reloadBtn) {
      loadAdminUsers();
      return;
    }

    const blacklistBtn = event.target.closest('[data-blacklist-btn="1"]');
    if (blacklistBtn) {
      event.preventDefault();
      event.stopPropagation();
      const userId = blacklistBtn.dataset.userId;
      const isBlacklisted = blacklistBtn.dataset.isBlacklisted === '1';
      toggleUserBlacklist(userId, isBlacklisted);
      return;
    }

    const row = event.target.closest('#allUsersTableBody tr[data-user-row="1"]');
    if (row) {
      openUserDetail(row.dataset.userId);
    }
  });

  document.getElementById('searchInputUsers')?.addEventListener('input', () => {
    loadAdminUsers();
  });

  window.loadAdminUsers = loadAdminUsers;
  window.showUserDetail = openUserDetail;
  window.toggleUserBlacklist = toggleUserBlacklist;
  window.closeUserDetail = closeUserDetail;
});

if (!window.__BSQ_ADMIN_USERS_CLEAN__) {
  window.__BSQ_ADMIN_USERS_CLEAN__ = true;

  const formatMoneyClean = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const formatDateClean = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ko-KR');
  };
  const formatDateOnlyClean = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('ko-KR');
  };

  function ensureUsersToolbarClean() {
    const usersHeader = document.querySelector('#tabUsers .card-header');
    if (usersHeader && !document.getElementById('searchInputUsers')) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-left:auto;';
      wrapper.innerHTML = `
        <input type="text" id="searchInputUsers" class="admin-form-input" placeholder="닉네임, 이름, 이메일, 연락처 검색" style="width:260px; margin:0;">
        <button type="button" id="btnReloadUsers" class="btn-small outline">새로고침</button>
      `;
      usersHeader.appendChild(wrapper);
    }

    const sectionTitle = document.querySelector('#tabUsers .section-title');
    if (sectionTitle) sectionTitle.textContent = '가입 회원';

    const sectionDescription = document.querySelector('#tabUsers .card-header p');
    if (sectionDescription) {
      sectionDescription.textContent = '전체 가입 회원 목록을 확인하고 관리합니다.';
    }

    const thead = document.querySelector('#tabUsers thead');
    if (thead && !thead.dataset.usersHeaderClean) {
      thead.innerHTML = `
        <tr>
          <th>닉네임</th>
          <th>이름</th>
          <th>연락처</th>
          <th>메일</th>
          <th>생년월일</th>
          <th>가입일자</th>
          <th>블랙리스트</th>
        </tr>
      `;
      thead.dataset.usersHeaderClean = '1';
    }

    const loadingCell = document.querySelector('#allUsersTableBody td[colspan]');
    if (loadingCell && loadingCell.colSpan !== 7) {
      loadingCell.colSpan = 7;
    }
  }

  function ensureUserDetailModalClean() {
    let modal = document.getElementById(USER_DETAIL_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = USER_DETAIL_MODAL_ID;
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2100',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(15,23,42,0.58)',
      'backdrop-filter:blur(8px)',
      'padding:1rem',
    ].join(';');

    modal.innerHTML = `
      <div style="width:min(980px, 100%); max-height:92vh; background:#fff; border-radius:22px; box-shadow:0 30px 80px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.5rem; border-bottom:1px solid #e5e7eb;">
          <div>
            <div style="font-size:0.85rem; color:#64748b;">회원 상세 정보</div>
            <h3 id="userDetailTitle" style="margin:0.2rem 0 0; font-size:1.15rem;">-</h3>
          </div>
          <button type="button" id="userDetailCloseBtn" class="btn-small outline">닫기</button>
        </div>
        <div id="userDetailBody" style="padding:1.5rem; overflow:auto;"></div>
      </div>
    `;

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeUserDetailClean();
    });
    modal.querySelector('#userDetailCloseBtn')?.addEventListener('click', closeUserDetailClean);
    document.body.appendChild(modal);
    return modal;
  }

  function closeUserDetailClean() {
    const modal = document.getElementById(USER_DETAIL_MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function renderUserRowClean(user) {
    const nickname = user.username || user.nickname || '-';
    const name = user.name || '-';
    const phone = user.phone || '-';
    const email = user.email || '-';
    const birthdate = user.birthdate || [user.birth_year, user.birth_month, user.birth_day].filter(Boolean).join('-') || '-';
    const signupDate = user.signup_date || user.created_at || '-';
    const isBlacklisted = !!user.is_blacklisted;

    return `
      <tr data-user-row="1" data-user-id="${escapeHtml(user.id)}" style="cursor:pointer;">
        <td><strong>${escapeHtml(nickname)}</strong></td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(phone)}</td>
        <td>${escapeHtml(email)}</td>
        <td>${escapeHtml(birthdate)}</td>
        <td>${escapeHtml(formatDateOnlyClean(signupDate))}</td>
        <td>
          <button type="button"
            class="btn-small ${isBlacklisted ? 'outline' : 'primary'}"
            data-blacklist-btn="1"
            data-user-id="${escapeHtml(user.id)}"
            data-is-blacklisted="${isBlacklisted ? '1' : '0'}">
            ${isBlacklisted ? '해제' : '등록'}
          </button>
        </td>
      </tr>
    `;
  }

  function buildUserSectionBlock(title, content) {
    return `
      <section style="display:grid; gap:0.75rem; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
        <h4 style="margin:0; font-size:0.98rem;">${escapeHtml(title)}</h4>
        ${content}
      </section>
    `;
  }

  function renderUserItemList(items, emptyMessage, formatter) {
    if (!items || !items.length) {
      return `<div style="padding:1rem; color:var(--admin-text-muted); text-align:center; border:1px dashed #dbe4f0; border-radius:14px;">${escapeHtml(emptyMessage)}</div>`;
    }

    return `
      <div style="display:grid; gap:0.75rem;">
        ${items.map((item) => formatter(item)).join('')}
      </div>
    `;
  }

  function renderClassCard(item) {
    return `
      <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">${escapeHtml(item.class_title || item.title || '-')}</div>
            <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.class_category || item.category || '')}</div>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${item.status ? `<span class="admin-badge muted">${escapeHtml(item.status)}</span>` : ''}
            ${item.pay_method ? `<span class="admin-badge primary">${escapeHtml(item.pay_method)}</span>` : ''}
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
          <div><div style="color:#64748b; font-size:0.75rem;">수강일</div><div>${escapeHtml(formatDateClean(item.enrolled_at || item.created_at))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoneyClean(item.amount || item.final_amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">수강 방식</div><div>${escapeHtml(item.operating_mode || item.class_type || '-')}</div></div>
        </div>
      </div>
    `;
  }

  function renderPassCard(item) {
    return `
      <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">${escapeHtml(item.class_title || '-')}</div>
            <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.class_category || '')}</div>
          </div>
          <span class="admin-badge ${item.status === 'active' ? 'primary' : 'muted'}">${escapeHtml(item.status || 'active')}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
          <div><div style="color:#64748b; font-size:0.75rem;">남은 수강권</div><div>${escapeHtml(String(item.remaining_count ?? 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">총 수강권</div><div>${escapeHtml(String(item.total_count ?? 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">유형</div><div>${escapeHtml(item.pass_type || '-')}</div></div>
        </div>
      </div>
    `;
  }

  loadAdminUsers = async function loadAdminUsersClean() {
    const tbody = document.getElementById('allUsersTableBody');
    if (!tbody) return;

    ensureUsersToolbarClean();

    if (window.BSQ?.ready) await window.BSQ.ready;
    const searchTerm = document.getElementById('searchInputUsers')?.value?.trim() || '';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--admin-text-muted);">회원 정보를 불러오는 중입니다...</td></tr>`;

    try {
      const qs = new URLSearchParams();
      if (searchTerm) qs.set('search', searchTerm);
      qs.set('limit', '1000');

      const res = await window.BSQ.api(`/api/users?${qs.toString()}`);
      if (!res?.success) throw new Error(res?.error || '회원 목록을 불러오지 못했습니다.');

      const users = Array.isArray(res.data) ? res.data : [];
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--admin-text-muted);">가입된 회원이 없습니다.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(renderUserRowClean).join('');
    } catch (err) {
      console.error('[Admin Users] load failed:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--admin-danger);">데이터 로딩 실패: ${escapeHtml(err.message)}</td></tr>`;
    }
  };

  openUserDetail = async function openUserDetailClean(userId) {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const modal = ensureUserDetailModalClean();
    const body = modal.querySelector('#userDetailBody');
    const title = modal.querySelector('#userDetailTitle');

    body.innerHTML = '<div style="padding:2rem; text-align:center; color:#64748b;">회원 상세 정보를 불러오는 중입니다...</div>';
    modal.style.display = 'flex';

    try {
      const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`);
      if (!res?.success || !res.data) throw new Error(res?.error || '회원 상세 정보를 가져오지 못했습니다.');

      const detail = res.detail || res.data || {};
      const user = detail.user || res.data;
      const summary = detail.summary || {};
      const subscribedClasses = detail.subscribed_classes || [];
      const ongoingClasses = detail.ongoing_classes || [];
      const payments = detail.payments || [];
      const passes = detail.passes || [];

      title.textContent = `${user.username || user.name || user.email || user.id} 회원 상세`;

      body.innerHTML = `
        <div style="display:grid; gap:1rem;">
          <section style="display:grid; grid-template-columns:110px 1fr; gap:1rem; align-items:start; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
            <img src="${escapeHtml(user.profile_image_url || '/assets/default-avatar.svg')}" alt="" style="width:110px; height:110px; border-radius:24px; object-fit:cover; background:#f8fafc;">
            <div style="display:grid; gap:0.75rem;">
              <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                <span class="admin-badge primary">${escapeHtml(user.role || 'user')}</span>
                <span class="admin-badge muted">${escapeHtml(user.membership_level || '일반')}</span>
                ${user.is_blacklisted ? '<span class="admin-badge danger">블랙리스트</span>' : '<span class="admin-badge muted">정상</span>'}
              </div>
              <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem;">
                <div><div style="font-size:0.75rem; color:#64748b;">닉네임</div><div style="font-weight:600;">${escapeHtml(user.username || '-')}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">이름</div><div style="font-weight:600;">${escapeHtml(user.name || '-')}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">연락처</div><div style="font-weight:600;">${escapeHtml(user.phone || '-')}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">메일</div><div style="font-weight:600;">${escapeHtml(user.email || '-')}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">생년월일</div><div style="font-weight:600;">${escapeHtml(user.birthdate || '-')}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">가입일자</div><div style="font-weight:600;">${escapeHtml(formatDateClean(user.signup_date || user.created_at))}</div></div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:0.75rem;">
                <div><div style="font-size:0.75rem; color:#64748b;">총 결제금액</div><div style="font-weight:600;">${escapeHtml(formatMoneyClean(summary.total_paid_amount || 0))}</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">수강 클래스</div><div style="font-weight:600;">${escapeHtml(String(summary.subscribed_class_count || 0))}개</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">현재 수강 중</div><div style="font-weight:600;">${escapeHtml(String(summary.ongoing_class_count || 0))}개</div></div>
                <div><div style="font-size:0.75rem; color:#64748b;">보유 수강권</div><div style="font-weight:600;">${escapeHtml(String(summary.pass_remaining_count || 0))}개</div></div>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button type="button" class="btn-small ${user.is_blacklisted ? 'outline' : 'primary'}" onclick="toggleUserBlacklist('${escapeJsString(user.id)}', ${user.is_blacklisted ? 'true' : 'false'})">
                  ${user.is_blacklisted ? '블랙리스트 해제' : '블랙리스트 등록'}
                </button>
                <button type="button" class="btn-small outline" onclick="closeUserDetail()">닫기</button>
              </div>
            </div>
          </section>

          ${buildUserSectionBlock('계정 상태', `
            <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; font-size:0.9rem;">
              <div><div style="color:#64748b; font-size:0.75rem;">회원 구분</div><div>${escapeHtml(user.role || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">운영자 순번</div><div>${escapeHtml(user.operator_seq ? `#${user.operator_seq}` : '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">회원등급</div><div>${escapeHtml(user.membership_level || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">성별</div><div>${escapeHtml(user.gender || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">국적</div><div>${escapeHtml(user.nationality || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">선호 카테고리</div><div>${escapeHtml(user.preferred_category || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">SNS 링크</div><div>${escapeHtml(user.sns_link || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">역할 수정자</div><div>${escapeHtml(user.role_updated_by || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">역할 수정일</div><div>${escapeHtml(formatDateClean(user.role_updated_at || '-'))}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 처리일</div><div>${escapeHtml(formatDateClean(user.blacklisted_at || '-'))}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 처리자</div><div>${escapeHtml(user.blacklisted_by || '-')}</div></div>
              <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 사유</div><div>${escapeHtml(user.blacklist_reason || '-')}</div></div>
            </div>
          `)}

          ${buildUserSectionBlock('가입한 클래스', renderUserItemList(subscribedClasses, '가입한 클래스가 없습니다.', renderClassCard))}
          ${buildUserSectionBlock('현재 수강 중인 클래스', renderUserItemList(ongoingClasses, '현재 수강 중인 클래스가 없습니다.', renderClassCard))}
          ${buildUserSectionBlock('결제 내역', renderUserItemList(payments, '결제 내역이 없습니다.', (item) => `
            <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                <div>
                  <div style="font-weight:700;">${escapeHtml(item.class_title || '결제 내역')}</div>
                  <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.order_id || '')}</div>
                </div>
                <span class="admin-badge muted">${escapeHtml(item.status || '-')}</span>
              </div>
              <div style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
                <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoneyClean(item.final_amount || item.amount || 0))}</div></div>
                <div><div style="color:#64748b; font-size:0.75rem;">할인금액</div><div>${escapeHtml(formatMoneyClean(item.discount_amount || 0))}</div></div>
                <div><div style="color:#64748b; font-size:0.75rem;">결제수단</div><div>${escapeHtml(item.pay_method || '-')}</div></div>
                <div><div style="color:#64748b; font-size:0.75rem;">결제일</div><div>${escapeHtml(formatDateClean(item.paid_at || item.created_at))}</div></div>
              </div>
            </div>
          `))}
          ${buildUserSectionBlock('보유 수강권', renderUserItemList(passes, '보유 수강권이 없습니다.', renderPassCard))}
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--admin-danger);">상세 정보를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
    }
  };

  toggleUserBlacklist = async function toggleUserBlacklistClean(userId, currentState) {
    const enable = !currentState;
    const reason = enable
      ? prompt('블랙리스트 등록 사유를 입력하세요. 비워두면 등록할 수 없습니다.')
      : prompt('블랙리스트 해제 사유를 입력하세요. 비워두면 해제할 수 없습니다.');

    if (reason === null) return;

    try {
      if (window.BSQ?.ready) await window.BSQ.ready;
      const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: {
          blacklisted: enable,
          blacklist_reason: reason || '',
        },
      });

      if (!res?.success) throw new Error(res?.error || '블랙리스트 상태 변경 실패');

      await loadAdminUsers();
      if (document.getElementById(USER_DETAIL_MODAL_ID)?.style.display === 'flex') {
        await openUserDetail(userId);
      }
      alert(enable ? '블랙리스트에 등록했습니다.' : '블랙리스트를 해제했습니다.');
    } catch (err) {
      alert(`블랙리스트 변경 실패: ${err.message}`);
    }
  };

  closeUserDetail = closeUserDetailClean;
  ensureUsersToolbar = ensureUsersToolbarClean;

  window.loadAdminUsers = loadAdminUsers;
  window.showUserDetail = openUserDetail;
  window.toggleUserBlacklist = toggleUserBlacklist;
  window.closeUserDetail = closeUserDetail;
}
