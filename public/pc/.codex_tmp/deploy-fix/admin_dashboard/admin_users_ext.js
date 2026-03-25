// admin_users_ext.js - member management extensions

(function () {
  if (window.__BSQ_ADMIN_USERS_EXT__) return;
  window.__BSQ_ADMIN_USERS_EXT__ = true;

  const USER_DETAIL_MODAL_ID = 'userDetailModal';
  const BLACKLIST_MODAL_ID = 'userBlacklistModal';
  const REFUND_MODAL_ID = 'userRefundModal';

  const BLACKLIST_REASONS = [
    '허위 정보 / 도용 의심',
    '욕설 / 비매너 / 분쟁 유발',
    '스팸 / 광고 / 도배',
    '반복 노쇼 / 무단 취소',
    '결제 / 환불 악용',
    '약관 위반 / 운영 방해',
    '기타',
  ];

  const REFUND_REASONS = [
    '수강 전 취소',
    '중복 결제',
    '클래스 취소 / 일정 변경',
    '서비스 불만',
    '결제 오류',
    '기타',
  ];

  const ROLE_META = {
    user: { label: '일반회원', badge: 'muted' },
    member: { label: '일반회원', badge: 'muted' },
    student: { label: '일반회원', badge: 'muted' },
    instructor: { label: '강사 회원', badge: 'primary' },
    operator: { label: '운영자', badge: 'success' },
    admin: { label: '운영자', badge: 'success' },
    super_admin: { label: '총괄운영자', badge: 'danger' },
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJs(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  }

  function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (!value) return 'user';
    if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
    if (['teacher', 'lecturer'].includes(value)) return 'instructor';
    return value in ROLE_META ? value : 'user';
  }

  function getRoleMeta(role) {
    return ROLE_META[normalizeRole(role)] || ROLE_META.user;
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

  function parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (Array.isArray(value) || typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (_err) {
      return fallback;
    }
  }

  function toTagList(value) {
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function avatarUrl(user) {
    const src = user?.profile_image_url;
    if (src && String(src).trim()) return src;
    const name = encodeURIComponent(user?.name || user?.username || user?.email || 'U');
    return `https://ui-avatars.com/api/?name=${name}&background=random&color=fff`;
  }

  function getUserDisplayName(user) {
    return user?.username || user?.nickname || user?.name || user?.email || user?.id || '-';
  }

  function countText(value, suffix = '개') {
    return `${Number(value || 0).toLocaleString('ko-KR')}${suffix}`;
  }

  function formatApiError(result, fallback) {
    const parts = [];
    if (result?.error) parts.push(result.error);
    if (result?.detail && result.detail !== result.error) parts.push(result.detail);
    return parts.length ? parts.join(' / ') : fallback;
  }

  function ensureUsersToolbar() {
    const usersHeader = document.querySelector('#tabUsers .card-header');
    if (usersHeader && !document.getElementById('searchInputUsers')) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-left:auto;';
      wrapper.innerHTML = `
        <input type="text" id="searchInputUsers" class="admin-form-input" placeholder="닉네임, 이름, 이메일, 연락처 검색" style="width:320px; margin:0;">
        <button type="button" id="btnReloadUsers" class="btn-small outline">새로고침</button>
      `;
      usersHeader.appendChild(wrapper);
    }

    const sectionTitle = document.querySelector('#tabUsers .section-title');
    if (sectionTitle) sectionTitle.textContent = '가입 회원';

    const sectionDescription = document.querySelector('#tabUsers .card-header p');
    if (sectionDescription) {
      sectionDescription.textContent = '전체 가입 회원 목록을 빠르게 확인하고 상태를 관리합니다.';
    }

    const thead = document.querySelector('#tabUsers thead');
    if (thead && !thead.dataset.bsqUsersHeaderReady) {
      thead.innerHTML = `
        <tr>
          <th>회원</th>
          <th>이름</th>
          <th>연락처</th>
          <th>메일</th>
          <th>생년월일</th>
          <th>가입일</th>
          <th>회원상태</th>
          <th>최근 수강 / 수강권</th>
          <th>관리</th>
        </tr>
      `;
      thead.dataset.bsqUsersHeaderReady = '1';
    }

    const loadingCell = document.querySelector('#allUsersTableBody td[colspan]');
    if (loadingCell && loadingCell.colSpan !== 9) {
      loadingCell.colSpan = 9;
    }
  }

  function emptyState(message) {
    return `<div style="padding:1rem; color:var(--admin-text-muted); text-align:center; border:1px dashed #dbe4f0; border-radius:14px;">${escapeHtml(message)}</div>`;
  }

  function listWrap(items, emptyMessage, renderer) {
    if (!items || !items.length) return emptyState(emptyMessage);
    return `<div style="display:grid; gap:0.75rem;">${items.map((item) => renderer(item)).join('')}</div>`;
  }

  function sectionBlock(title, content, extra = '') {
    return `
      <section style="display:grid; gap:0.75rem; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
          <h4 style="margin:0; font-size:0.98rem;">${escapeHtml(title)}</h4>
          ${extra}
        </div>
        ${content}
      </section>
    `;
  }

  function userSummaryLabel(label, value) {
    return `
      <div style="padding:0.8rem 0.9rem; border:1px solid #eef2f7; border-radius:14px; background:#f8fafc;">
        <div style="color:#64748b; font-size:0.75rem; margin-bottom:0.2rem;">${escapeHtml(label)}</div>
        <div style="font-weight:700;">${value}</div>
      </div>
    `;
  }

  function renderChecklist(prefix, items, type) {
    return `
      <div style="display:grid; gap:0.55rem;">
        ${items.map((label) => `
          <label style="display:flex; align-items:flex-start; gap:0.65rem; padding:0.75rem 0.85rem; border:1px solid #e5e7eb; border-radius:12px; background:#fff; cursor:pointer;">
            <input type="checkbox" data-checklist-item="1" data-type="${escapeHtml(type)}" data-prefix="${escapeHtml(prefix)}" value="${escapeHtml(label)}" style="margin-top:0.2rem;">
            <span style="font-size:0.88rem; line-height:1.5;">${escapeHtml(label)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderUserRow(user) {
    const role = getRoleMeta(user.role);
    const nickname = getUserDisplayName(user);
    const recentClass = user.recent_class_title || '최근 수강 없음';
    const passCount = Number(user.active_pass_count || 0);
    const isBlacklisted = !!user.is_blacklisted;

    return `
      <tr data-user-row="1" data-user-id="${escapeHtml(user.id)}" style="cursor:pointer;">
        <td>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:36px; height:36px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb; background:#f8fafc;">
            <div>
              <div style="font-weight:700; line-height:1.25;">${escapeHtml(nickname)}</div>
              <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(user.username || user.nickname || user.id || '')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(user.name || '-')}</td>
        <td>${escapeHtml(user.phone || '-')}</td>
        <td>${escapeHtml(user.email || '-')}</td>
        <td>${escapeHtml(user.birthdate || [user.birth_year, user.birth_month, user.birth_day].filter(Boolean).join('-') || '-')}</td>
        <td>${escapeHtml(formatDateOnly(user.signup_date || user.created_at))}</td>
        <td><span class="admin-badge ${role.badge}">${escapeHtml(role.label)}</span></td>
        <td>
          <div style="display:grid; gap:0.2rem; font-size:0.82rem;">
            <div style="font-weight:600;">${escapeHtml(recentClass)}</div>
            <div style="color:#64748b;">수강권 ${escapeHtml(countText(passCount))}</div>
          </div>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <button type="button"
              class="btn-small ${isBlacklisted ? 'outline' : 'primary'}"
              data-blacklist-btn="1"
              data-user-id="${escapeHtml(user.id)}"
              data-is-blacklisted="${isBlacklisted ? '1' : '0'}">
              ${isBlacklisted ? '해제' : '등록'}
            </button>
          </div>
        </td>
      </tr>
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
          <div><div style="color:#64748b; font-size:0.75rem;">수강일</div><div>${escapeHtml(formatDate(item.enrolled_at || item.created_at))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoney(item.amount || item.final_amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">수강방식</div><div>${escapeHtml(item.operating_mode || item.class_type || '-')}</div></div>
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

  function ensureSpecialTabShell() {
    const section = $('tabRoles');
    if (!section || section.dataset.bsqSpecialReady === '1') return section;

    section.innerHTML = `
      <div class="admin-card">
        <div class="card-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:1rem;">
          <div>
            <h3 class="section-title">회원 특이사항관리</h3>
            <p style="font-size:0.85rem; color:var(--mac-text-muted); margin-left:1rem; margin-top:0.3rem;">
              블랙리스트와 환불 내역을 분리해서 확인하고 바로 상세로 이동합니다.
            </p>
          </div>
          <button type="button" id="btnReloadSpecialMembers" class="btn-small outline">새로고침</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1rem; padding:1rem 0 0;">
          <section style="display:grid; gap:0.85rem; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff; box-shadow:0 10px 28px rgba(15,23,42,0.04);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
              <h4 style="margin:0; font-size:1rem;">블랙리스트</h4>
              <span id="specialBlacklistCount" class="admin-badge danger">0건</span>
            </div>
            <div id="specialBlacklistList" style="display:grid; gap:0.75rem;"></div>
          </section>
          <section style="display:grid; gap:0.85rem; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff; box-shadow:0 10px 28px rgba(15,23,42,0.04);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
              <h4 style="margin:0; font-size:1rem;">환불내역관리</h4>
              <span id="specialRefundCount" class="admin-badge primary">0건</span>
            </div>
            <div id="specialRefundList" style="display:grid; gap:0.75rem;"></div>
          </section>
        </div>
      </div>
    `;

    section.dataset.bsqSpecialReady = '1';
    return section;
  }

  function ensureDetailModal() {
    let modal = $(USER_DETAIL_MODAL_ID);
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
      <div style="width:min(1120px, 100%); max-height:92vh; background:#fff; border-radius:22px; box-shadow:0 30px 80px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.2rem 1.5rem; border-bottom:1px solid #e5e7eb;">
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
    const modal = $(USER_DETAIL_MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function ensureBlacklistModal() {
    let modal = $(BLACKLIST_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = BLACKLIST_MODAL_ID;
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2200',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(15,23,42,0.62)',
      'backdrop-filter:blur(8px)',
      'padding:1rem',
    ].join(';');

    modal.innerHTML = `
      <div style="width:min(860px, 100%); max-height:92vh; background:#fff; border-radius:22px; box-shadow:0 30px 80px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.25rem 1.5rem; border-bottom:1px solid #e5e7eb;">
          <div>
            <div style="font-size:0.85rem; color:#64748b;">블랙리스트 등록</div>
            <h3 id="blacklistModalTitle" style="margin:0.2rem 0 0; font-size:1.15rem;">-</h3>
          </div>
          <button type="button" class="btn-small outline" data-blacklist-close="1">닫기</button>
        </div>
        <div id="blacklistModalBody" style="padding:1.5rem; overflow:auto;"></div>
      </div>
    `;

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeBlacklistModal();
    });
    modal.querySelector('[data-blacklist-close="1"]')?.addEventListener('click', closeBlacklistModal);
    document.body.appendChild(modal);
    return modal;
  }

  function closeBlacklistModal() {
    const modal = $(BLACKLIST_MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function ensureRefundModal() {
    let modal = $(REFUND_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = REFUND_MODAL_ID;
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2250',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(15,23,42,0.62)',
      'backdrop-filter:blur(8px)',
      'padding:1rem',
    ].join(';');

    modal.innerHTML = `
      <div style="width:min(1080px, 100%); max-height:92vh; background:#fff; border-radius:22px; box-shadow:0 30px 80px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.25rem 1.5rem; border-bottom:1px solid #e5e7eb;">
          <div>
            <div style="font-size:0.85rem; color:#64748b;">환불 처리</div>
            <h3 id="refundModalTitle" style="margin:0.2rem 0 0; font-size:1.15rem;">-</h3>
          </div>
          <button type="button" class="btn-small outline" data-refund-close="1">닫기</button>
        </div>
        <div id="refundModalBody" style="padding:1.5rem; overflow:auto;"></div>
      </div>
    `;

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeRefundModal();
    });
    modal.querySelector('[data-refund-close="1"]')?.addEventListener('click', closeRefundModal);
    document.body.appendChild(modal);
    return modal;
  }

  function closeRefundModal() {
    const modal = $(REFUND_MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function renderPaymentCard(item, userId) {
    const refunded = ['refunded', 'partial_refunded'].includes(String(item.status || '').toLowerCase());
    return `
      <div style="padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">${escapeHtml(item.class_title || '결제 내역')}</div>
            <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(item.order_id || '')}</div>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
            <span class="admin-badge ${refunded ? 'danger' : 'muted'}">${escapeHtml(item.status || '-')}</span>
            <button type="button" class="btn-small outline" ${refunded ? 'disabled' : ''} onclick="openRefundModal('${escapeJs(userId)}', '${escapeJs(item.order_id || '')}')">환불</button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; font-size:0.9rem;">
          <div><div style="color:#64748b; font-size:0.75rem;">결제금액</div><div>${escapeHtml(formatMoney(item.final_amount || item.amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">할인금액</div><div>${escapeHtml(formatMoney(item.discount_amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">결제수단</div><div>${escapeHtml(item.pay_method || '-')}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">결제일</div><div>${escapeHtml(formatDate(item.paid_at || item.created_at))}</div></div>
        </div>
      </div>
    `;
  }

  function renderRefundCard(log) {
    const user = log.user || {};
    const role = getRoleMeta(user.role);
    const refundTypeLabel = log.refund_type === 'partial' ? '부분 환불' : '전액 환불';
    const reasonTags = toTagList(log.reason_tags);
    const tagsHtml = reasonTags.length
      ? `<div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.45rem;">${reasonTags.map((tag) => `<span class="admin-badge muted">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';

    return `
      <article data-special-user-id="${escapeHtml(user.id || log.user_id)}" style="display:grid; gap:0.8rem; padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:16px; background:#fff; cursor:pointer;" data-open-user-detail="1">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:42px; height:42px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb;">
            <div>
              <div style="font-weight:700;">${escapeHtml(getUserDisplayName(user))}</div>
              <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(log.class_title || log.order_id || '')}</div>
            </div>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <span class="admin-badge ${role.badge}">${escapeHtml(role.label)}</span>
            <span class="admin-badge primary">${escapeHtml(refundTypeLabel)}</span>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.75rem; font-size:0.85rem;">
          <div><div style="color:#64748b; font-size:0.75rem;">원 결제금액</div><div>${escapeHtml(formatMoney(log.original_amount || log.final_amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">환불금액</div><div>${escapeHtml(formatMoney(log.refund_amount || 0))}</div></div>
          <div><div style="color:#64748b; font-size:0.75rem;">주문상태</div><div>${escapeHtml(log.order_status || log.status || '-')}</div></div>
        </div>
        <div style="font-size:0.85rem; color:#334155; line-height:1.6;">
          <div style="font-weight:600; margin-bottom:0.25rem;">사유</div>
          <div>${escapeHtml(log.reason_note || '사유 없음')}</div>
          ${tagsHtml}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <span style="font-size:0.8rem; color:#64748b;">${escapeHtml(formatDate(log.processed_at || log.created_at || '-'))}</span>
          <button type="button" class="btn-small outline" data-open-user-detail="1">상세</button>
        </div>
      </article>
    `;
  }

  function renderBlacklistCard(log) {
    const user = log.user || {};
    const isActive = !!user.is_blacklisted || !!log.new_state;
    const role = getRoleMeta(user.role);
    const stateLabel = isActive ? '등록됨' : '해제됨';
    const stateTone = isActive ? 'danger' : 'muted';

    return `
      <article data-special-user-id="${escapeHtml(user.id || log.user_id)}" style="display:grid; gap:0.8rem; padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:16px; background:#fff; cursor:pointer;" data-open-user-detail="1">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:42px; height:42px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb;">
            <div>
              <div style="font-weight:700;">${escapeHtml(getUserDisplayName(user))}</div>
              <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(user.email || user.phone || user.id || '')}</div>
            </div>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <span class="admin-badge ${role.badge}">${escapeHtml(role.label)}</span>
            <span class="admin-badge ${stateTone}">${stateLabel}</span>
          </div>
        </div>
        <div style="font-size:0.85rem; color:#334155; line-height:1.6;">
          <div style="font-weight:600; margin-bottom:0.25rem;">사유</div>
          <div>${escapeHtml(log.reason || '사유 없음')}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <span style="font-size:0.8rem; color:#64748b;">${escapeHtml(formatDate(log.created_at || '-'))}</span>
          <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
            ${isActive ? `<button type="button" class="btn-small outline" data-unblacklist-btn="1" data-user-id="${escapeHtml(user.id || log.user_id)}" data-user-name="${escapeHtml(getUserDisplayName(user))}">해제</button>` : ''}
            <button type="button" class="btn-small outline" data-open-user-detail="1">상세</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderRefundForm(detail, state) {
    const user = detail.user || detail;
    const payments = detail.payments || [];
    const selectedOrderId = state.selectedOrderId || payments.find((item) => !['refunded', 'partial_refunded'].includes(String(item.status || '').toLowerCase()))?.order_id || payments[0]?.order_id || '';
    const selectedPayment = payments.find((item) => item.order_id === selectedOrderId) || payments[0] || null;
    const maxAmount = Number(selectedPayment?.final_amount || selectedPayment?.amount || 0);
    const refundType = state.refundType || 'full';

    return `
      <div style="display:grid; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.85rem; padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:16px; background:#f8fafc;">
          <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:54px; height:54px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb;">
          <div>
            <div style="font-weight:700; font-size:1rem;">${escapeHtml(getUserDisplayName(user))}</div>
            <div style="font-size:0.82rem; color:#64748b;">환불할 결제 클래스를 선택한 뒤 전액 / 부분 환불을 처리합니다.</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:minmax(280px, 1fr) minmax(0, 1.1fr); gap:1rem;">
          <section style="display:grid; gap:0.75rem; padding:1rem; border:1px solid #e5e7eb; border-radius:16px; background:#fff;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
              <strong>결제 클래스</strong>
              <span class="admin-badge muted">${escapeHtml(countText(payments.length))}</span>
            </div>
            <div style="display:grid; gap:0.6rem; max-height:340px; overflow:auto; padding-right:0.15rem;">
              ${payments.length ? payments.map((item) => {
                const itemStatus = String(item.status || '').toLowerCase();
                const disabled = ['refunded', 'partial_refunded'].includes(itemStatus);
                const active = item.order_id === selectedOrderId;
                return `
                  <label style="display:block; cursor:pointer;">
                    <input type="radio" name="refundTarget" value="${escapeHtml(item.order_id || '')}" ${active ? 'checked' : ''} style="display:none;">
                    <div data-refund-order-card="1" data-order-id="${escapeHtml(item.order_id || '')}" style="padding:0.9rem 1rem; border:1px solid ${active ? '#93c5fd' : '#e5e7eb'}; border-radius:14px; background:${active ? '#eff6ff' : '#f8fafc'}; opacity:${disabled ? '0.62' : '1'}; cursor:pointer;">
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
                        <div>
                          <div style="font-weight:700;">${escapeHtml(item.class_title || '결제 내역')}</div>
                          <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(item.order_id || '')}</div>
                        </div>
                        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                          <span class="admin-badge ${disabled ? 'danger' : 'muted'}">${escapeHtml(item.status || '-')}</span>
                          ${active ? '<span class="admin-badge primary">선택됨</span>' : ''}
                        </div>
                      </div>
                      <div style="margin-top:0.65rem; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:0.55rem; font-size:0.85rem;">
                        <div><span style="color:#64748b;">결제금액</span> ${escapeHtml(formatMoney(item.final_amount || item.amount || 0))}</div>
                        <div><span style="color:#64748b;">결제일</span> ${escapeHtml(formatDate(item.paid_at || item.created_at))}</div>
                      </div>
                      ${disabled ? '<div style="margin-top:0.45rem; color:#b91c1c; font-size:0.8rem;">이미 환불된 항목입니다.</div>' : ''}
                    </div>
                  </label>
                `;
              }).join('') : emptyState('결제 내역이 없습니다.')}
            </div>
          </section>

          <section style="display:grid; gap:0.85rem; padding:1rem; border:1px solid #e5e7eb; border-radius:16px; background:#fff;">
            <div>
              <strong>환불 방식</strong>
              <div style="display:flex; gap:0.65rem; flex-wrap:wrap; margin-top:0.55rem;">
                <label style="display:flex; align-items:center; gap:0.4rem;">
                  <input type="radio" name="refundType" value="full" ${refundType === 'full' ? 'checked' : ''}>
                  <span>전액 환불</span>
                </label>
                <label style="display:flex; align-items:center; gap:0.4rem;">
                  <input type="radio" name="refundType" value="partial" ${refundType === 'partial' ? 'checked' : ''}>
                  <span>부분 환불</span>
                </label>
              </div>
            </div>

            <div>
              <strong>환불 금액</strong>
              <input id="refundAmountInput" class="admin-form-input" type="number" min="0" max="${escapeHtml(String(maxAmount || 0))}" value="${escapeHtml(String(refundType === 'partial' ? (state.refundAmount || Math.max(Math.floor(maxAmount / 2), 0)) : maxAmount))}" placeholder="부분 환불 금액을 입력하세요" style="width:100%; margin-top:0.55rem;">
              <div style="margin-top:0.35rem; font-size:0.8rem; color:#64748b;">선택된 결제 기준 최대 금액: ${escapeHtml(formatMoney(maxAmount || 0))}</div>
            </div>

            <div>
              <strong>환불 사유 체크리스트</strong>
              <div style="margin-top:0.55rem;">${renderChecklist('refund', REFUND_REASONS, 'refund')}</div>
            </div>

            <div>
              <strong>상세 메모</strong>
              <textarea id="refundNoteInput" class="admin-form-input" rows="4" placeholder="환불 사유와 처리 메모를 입력하세요." style="width:100%; resize:vertical; margin-top:0.55rem;"></textarea>
            </div>
          </section>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.6rem; flex-wrap:wrap;">
          <button type="button" class="btn-small outline" data-refund-cancel="1">취소</button>
          <button type="button" class="btn-small primary" data-refund-submit="1">환불 처리</button>
        </div>
      </div>
    `;
  }

  function renderUserDetailExtras(detail) {
    const user = detail.user || detail;
    const summary = detail.summary || {};
    const subscribedClasses = detail.subscribed_classes || [];
    const ongoingClasses = detail.ongoing_classes || [];
    const payments = detail.payments || [];
    const passes = detail.passes || [];
    const instructorClasses = detail.instructor_classes || [];
    const blacklistLogs = detail.blacklist_logs || [];
    const refundLogs = detail.refund_logs || [];
    const role = getRoleMeta(user.role);
    const blacklisted = !!user.is_blacklisted;
    const userId = user.id || '';
    const recentClass = user.recent_class_title || subscribedClasses[0]?.class_title || '최근 수강 없음';
    const latestBlacklist = blacklistLogs[0] || null;

    const summaryCards = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:0.75rem;">
        ${userSummaryLabel('총 결제금액', formatMoney(summary.total_paid_amount || 0))}
        ${userSummaryLabel('수강 클래스', countText(summary.subscribed_class_count || 0))}
        ${userSummaryLabel('진행 클래스', countText(summary.ongoing_class_count || 0))}
        ${userSummaryLabel('환불 건수', countText(summary.refund_count || 0))}
        ${userSummaryLabel('보유 수강권', countText(summary.pass_remaining_count || 0))}
        ${userSummaryLabel('개설한 클래스', countText(summary.instructor_class_count || 0))}
      </div>
    `;

    const statusInfo = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:0.75rem; font-size:0.9rem;">
        <div><div style="color:#64748b; font-size:0.75rem;">회원 구분</div><div style="font-weight:600;">${escapeHtml(role.label)}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">원본 역할</div><div style="font-weight:600;">${escapeHtml(user.role || '-')}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">회원등급</div><div style="font-weight:600;">${escapeHtml(user.membership_level || '-')}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">운영자 번호</div><div style="font-weight:600;">${escapeHtml(user.operator_seq ? `#${user.operator_seq}` : '-')}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">최근 수강</div><div style="font-weight:600;">${escapeHtml(recentClass)}</div></div>
        <div><div style="color:#64748b; font-size:0.75rem;">블랙리스트 상태</div><div style="font-weight:600;">${blacklisted ? '<span class="admin-badge danger">블랙리스트</span>' : '<span class="admin-badge muted">정상</span>'}</div></div>
      </div>
    `;

    const blacklistInfo = `
      <div style="display:grid; gap:0.75rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
          <div>
            <h5 style="margin:0; font-size:0.95rem;">블랙리스트 정보</h5>
            <div style="font-size:0.82rem; color:#64748b;">등록 / 해제 이력을 확인합니다.</div>
          </div>
          ${blacklisted ? `<button type="button" class="btn-small outline" onclick="toggleUserBlacklist('${escapeJs(userId)}', true)">블랙리스트 해제</button>` : ''}
        </div>
        ${
          latestBlacklist
            ? `
              <div style="padding:0.95rem 1rem; border:1px solid #fee2e2; border-radius:14px; background:#fff7f7;">
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-bottom:0.55rem;">
                  <span class="admin-badge ${blacklisted ? 'danger' : 'muted'}">${blacklisted ? '등록됨' : '해제됨'}</span>
                  <span class="admin-badge muted">${escapeHtml(formatDate(latestBlacklist.created_at))}</span>
                </div>
                <div style="font-size:0.88rem; color:#334155; line-height:1.65;">${escapeHtml(latestBlacklist.reason || '사유 없음')}</div>
              </div>
            `
            : emptyState('블랙리스트 이력이 없습니다.')
        }
        ${listWrap(blacklistLogs, '블랙리스트 이력이 없습니다.', (item) => `
          <div style="padding:0.9rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
              <strong>${escapeHtml(item.new_state ? '등록' : '해제')}</strong>
              <span style="font-size:0.8rem; color:#64748b;">${escapeHtml(formatDate(item.created_at))}</span>
            </div>
            <div style="margin-top:0.45rem; font-size:0.88rem; color:#334155; line-height:1.65;">${escapeHtml(item.reason || '사유 없음')}</div>
          </div>
        `)}
      </div>
    `;

    const refundInfo = `
      <div style="display:grid; gap:0.75rem;">
        <div>
          <h5 style="margin:0; font-size:0.95rem;">환불 내역</h5>
          <div style="font-size:0.82rem; color:#64748b;">처리된 환불 기록입니다.</div>
        </div>
        ${listWrap(refundLogs, '환불 내역이 없습니다.', (item) => {
          const tags = toTagList(item.reason_tags);
          const tagsHtml = tags.length
            ? `<div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.45rem;">${tags.map((tag) => `<span class="admin-badge muted">${escapeHtml(tag)}</span>`).join('')}</div>`
            : '';
          return `
            <div style="padding:0.9rem 1rem; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
                <strong>${escapeHtml(item.refund_type === 'partial' ? '부분 환불' : '전액 환불')}</strong>
                <span style="font-size:0.8rem; color:#64748b;">${escapeHtml(formatDate(item.processed_at || item.created_at))}</span>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:0.65rem; margin-top:0.65rem; font-size:0.88rem;">
                <div><div style="color:#64748b; font-size:0.75rem;">클래스</div><div>${escapeHtml(item.class_title || '-')}</div></div>
                <div><div style="color:#64748b; font-size:0.75rem;">환불금액</div><div>${escapeHtml(formatMoney(item.refund_amount || 0))}</div></div>
                <div><div style="color:#64748b; font-size:0.75rem;">상태</div><div>${escapeHtml(item.status || '-')}</div></div>
              </div>
              <div style="margin-top:0.55rem; font-size:0.88rem; color:#334155; line-height:1.6;">${escapeHtml(item.reason_note || '사유 없음')}</div>
              ${tagsHtml}
            </div>
          `;
        })}
      </div>
    `;

    return `
      <div style="display:grid; gap:1rem;">
        <section style="display:grid; grid-template-columns:110px minmax(0, 1fr); gap:1rem; align-items:start; padding:1rem; border:1px solid #e5e7eb; border-radius:18px; background:#fff;">
          <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:110px; height:110px; border-radius:999px; object-fit:cover; background:#f8fafc; border:1px solid #e5e7eb;">
          <div style="display:grid; gap:0.85rem;">
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
              <span class="admin-badge ${role.badge}">${escapeHtml(role.label)}</span>
              <span class="admin-badge muted">${escapeHtml(user.membership_level || '일반')}</span>
              <span class="admin-badge ${blacklisted ? 'danger' : 'muted'}">${blacklisted ? '블랙리스트' : '정상'}</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:0.75rem;">
              <div><div style="font-size:0.75rem; color:#64748b;">닉네임</div><div style="font-weight:600;">${escapeHtml(user.username || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">이름</div><div style="font-weight:600;">${escapeHtml(user.name || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">연락처</div><div style="font-weight:600;">${escapeHtml(user.phone || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">이메일</div><div style="font-weight:600;">${escapeHtml(user.email || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">생년월일</div><div style="font-weight:600;">${escapeHtml(user.birthdate || '-')}</div></div>
              <div><div style="font-size:0.75rem; color:#64748b;">가입일</div><div style="font-weight:600;">${escapeHtml(formatDate(user.signup_date || user.created_at))}</div></div>
            </div>
            ${summaryCards}
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" class="btn-small primary" onclick="openRefundModal('${escapeJs(userId)}')">환불 처리</button>
              <button type="button" class="btn-small ${blacklisted ? 'outline' : 'primary'}" onclick="${blacklisted ? `toggleUserBlacklist('${escapeJs(userId)}', true)` : `openBlacklistModal('${escapeJs(userId)}')`}">
                ${blacklisted ? '블랙리스트 해제' : '블랙리스트 등록'}
              </button>
              <button type="button" class="btn-small outline" onclick="closeUserDetail()">닫기</button>
            </div>
          </div>
        </section>

        ${sectionBlock('계정 상태', statusInfo)}
        ${sectionBlock('블랙리스트 정보', blacklistInfo)}
        ${sectionBlock('환불 내역', refundInfo)}
        ${sectionBlock('개설한 클래스', listWrap(instructorClasses, '개설한 클래스가 없습니다.', renderClassCard))}
        ${sectionBlock('수강 내역', `
          <div style="display:grid; gap:0.9rem;">
            <div>
              <h5 style="margin:0 0 0.5rem; font-size:0.9rem; color:#334155;">신청 클래스</h5>
              ${listWrap(subscribedClasses, '수강한 클래스가 없습니다.', renderClassCard)}
            </div>
            <div>
              <h5 style="margin:0 0 0.5rem; font-size:0.9rem; color:#334155;">진행 중 클래스</h5>
              ${listWrap(ongoingClasses, '진행 중인 클래스가 없습니다.', renderClassCard)}
            </div>
          </div>
        `)}
        ${sectionBlock('결제 내역', listWrap(payments, '결제 내역이 없습니다.', (item) => renderPaymentCard(item, userId)))}
        ${sectionBlock('보유 수강권', listWrap(passes, '보유 수강권이 없습니다.', renderPassCard))}
      </div>
    `;
  }

  function applyDetailExtras(detail) {
    const modal = $(USER_DETAIL_MODAL_ID);
    const body = modal?.querySelector('#userDetailBody');
    if (!body) return;

    const existing = body.querySelector('[data-bsq-detail-extra="1"]');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.dataset.bsqDetailExtra = '1';
    wrapper.style.marginTop = '1rem';
    wrapper.innerHTML = renderUserDetailExtras(detail);
    body.appendChild(wrapper);
  }

  async function loadAdminUsers() {
    const tbody = $('allUsersTableBody');
    if (!tbody) return;

    ensureUsersToolbar();

    if (window.BSQ?.ready) await window.BSQ.ready;
    const searchTerm = $('searchInputUsers')?.value?.trim() || '';
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--admin-text-muted);">회원 정보를 불러오는 중입니다...</td></tr>`;

    try {
      const qs = new URLSearchParams();
      if (searchTerm) qs.set('search', searchTerm);
      qs.set('limit', '1000');

      const res = await window.BSQ.api(`/api/users?${qs.toString()}`);
      if (!res?.success) throw new Error(res?.error || '회원 목록을 불러오지 못했습니다.');

      const users = Array.isArray(res.data) ? res.data : [];
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--admin-text-muted);">가입된 회원이 없습니다.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(renderUserRow).join('');
    } catch (error) {
      console.error('[Admin Users] load failed:', error);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--admin-danger);">데이터 로딩 실패: ${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function fetchUserDetail(userId) {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`);
    if (!res?.success || !res.data) throw new Error(res?.error || '회원 상세 정보를 가져오지 못했습니다.');
    return res.detail || res.data || {};
  }

  async function openUserDetail(userId) {
    const modal = ensureDetailModal();
    const body = modal.querySelector('#userDetailBody');
    const title = modal.querySelector('#userDetailTitle');

    body.innerHTML = '<div style="padding:2rem; text-align:center; color:#64748b;">회원 상세 정보를 불러오는 중입니다...</div>';
    modal.style.display = 'flex';

    try {
      const detail = await fetchUserDetail(userId);
      window.__BSQ_CURRENT_USER_DETAIL__ = detail;
      const user = detail.user || detail;
      title.textContent = `${getUserDisplayName(user)} 회원 상세`;
      body.innerHTML = renderUserDetailExtras(detail);
    } catch (error) {
      body.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--admin-danger);">상세 정보를 불러오지 못했습니다. ${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveBlacklist(userId, enable, payload = {}) {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: {
        blacklisted: enable,
        blacklist_reason: payload.reason || payload.blacklist_reason || '',
      },
    });

    if (!res?.success) throw new Error(res?.error || '블랙리스트 상태 변경 실패');

    await loadAdminUsers();
    await loadMemberSpecials();
    if ($(USER_DETAIL_MODAL_ID)?.style.display === 'flex') {
      await openUserDetail(userId);
    }
    return res;
  }

  async function openBlacklistModal(userId) {
    const detail = await fetchUserDetail(userId);
    const user = detail.user || detail;
    const modal = ensureBlacklistModal();
    const title = modal.querySelector('#blacklistModalTitle');
    const body = modal.querySelector('#blacklistModalBody');

    title.textContent = `${getUserDisplayName(user)} 블랙리스트 등록`;
    body.innerHTML = `
      <div style="display:grid; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.85rem; padding:0.95rem 1rem; border:1px solid #e5e7eb; border-radius:16px; background:#f8fafc;">
          <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:54px; height:54px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb;">
          <div>
            <div style="font-weight:700; font-size:1rem;">${escapeHtml(getUserDisplayName(user))}</div>
            <div style="font-size:0.82rem; color:#64748b;">${escapeHtml(user.email || user.phone || user.id || '')}</div>
          </div>
        </div>

        <div style="display:grid; gap:0.7rem;">
          <div>
            <div style="font-weight:700; margin-bottom:0.55rem;">블랙리스트 사유 체크리스트</div>
            ${renderChecklist('blacklist', BLACKLIST_REASONS, 'blacklist')}
          </div>
          <div>
            <div style="font-weight:700; margin-bottom:0.55rem;">추가 메모</div>
            <textarea id="blacklistNoteInput" class="admin-form-input" rows="5" placeholder="차단 사유를 간단히 정리해 주세요." style="width:100%; resize:vertical;"></textarea>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.6rem; flex-wrap:wrap;">
          <button type="button" class="btn-small outline" data-blacklist-cancel="1">취소</button>
          <button type="button" class="btn-small danger" data-blacklist-submit="1">블랙리스트 등록</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    body.querySelector('[data-blacklist-cancel="1"]')?.addEventListener('click', closeBlacklistModal);
    body.querySelector('[data-blacklist-submit="1"]')?.addEventListener('click', async () => {
      const checkedTags = Array.from(body.querySelectorAll('[data-checklist-item="1"]:checked'))
        .map((el) => el.value.trim())
        .filter(Boolean);
      const note = body.querySelector('#blacklistNoteInput')?.value.trim() || '';
      if (!checkedTags.length && !note) {
        alert('사유 체크리스트 또는 메모를 입력해 주세요.');
        return;
      }
      try {
        const reasonText = checkedTags.join(', ') + (note ? ` | ${note}` : '');
        const detailVisible = $(USER_DETAIL_MODAL_ID)?.style.display === 'flex';
        await saveBlacklist(userId, true, { reason: reasonText });
        closeBlacklistModal();
        if (!detailVisible) {
          await openUserDetail(userId);
        }
        alert('블랙리스트에 등록했습니다.');
      } catch (error) {
        alert(`블랙리스트 등록 실패: ${error.message}`);
      }
    });
  }

  async function toggleUserBlacklist(userId, currentState) {
    if (currentState) {
      if (!confirm('블랙리스트를 해제할까요?')) return;
      try {
        await saveBlacklist(userId, false, { reason: '관리자 해제' });
        alert('블랙리스트를 해제했습니다.');
      } catch (error) {
        alert(`블랙리스트 해제 실패: ${error.message}`);
      }
      return;
    }

    await openBlacklistModal(userId);
  }

  function buildRefundState(detail, initialOrderId = '') {
    const payments = detail.payments || [];
    const eligible = payments.find((item) => item.order_id === initialOrderId) || payments.find((item) => !['refunded', 'partial_refunded'].includes(String(item.status || '').toLowerCase())) || payments[0] || null;
    return {
      selectedOrderId: eligible?.order_id || '',
      refundType: 'full',
      refundAmount: Number(eligible?.final_amount || eligible?.amount || 0) || 0,
    };
  }

  function bindRefundModalEvents(detail, state) {
    const modal = $(REFUND_MODAL_ID);
    if (!modal) return;
    const body = modal.querySelector('#refundModalBody');

    body.querySelector('[data-refund-cancel="1"]')?.addEventListener('click', closeRefundModal);

    body.querySelectorAll('[data-refund-order-card="1"]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedOrderId = card.dataset.orderId || '';
        const selected = (detail.payments || []).find((item) => item.order_id === state.selectedOrderId);
        state.refundAmount = Number(selected?.final_amount || selected?.amount || 0) || 0;
        state.refundType = 'full';
        body.innerHTML = renderRefundForm(detail, state);
        bindRefundModalEvents(detail, state);
      });
    });

    body.querySelectorAll('input[name="refundType"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.refundType = body.querySelector('input[name="refundType"]:checked')?.value || 'full';
        const selected = (detail.payments || []).find((item) => item.order_id === state.selectedOrderId);
        if (state.refundType === 'full') {
          state.refundAmount = Number(selected?.final_amount || selected?.amount || 0) || 0;
        }
        body.innerHTML = renderRefundForm(detail, state);
        bindRefundModalEvents(detail, state);
      });
    });

    body.querySelectorAll('input[name="refundTarget"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.selectedOrderId = input.value;
        const selected = (detail.payments || []).find((item) => item.order_id === state.selectedOrderId);
        state.refundAmount = Number(selected?.final_amount || selected?.amount || 0) || 0;
        body.innerHTML = renderRefundForm(detail, state);
        bindRefundModalEvents(detail, state);
      });
    });

    body.querySelector('[data-refund-submit="1"]')?.addEventListener('click', async () => {
      const selected = (detail.payments || []).find((item) => item.order_id === state.selectedOrderId);
      if (!selected) {
        alert('환불할 결제 항목을 선택해 주세요.');
        return;
      }
      if (['refunded', 'partial_refunded'].includes(String(selected.status || '').toLowerCase())) {
        alert('이미 환불 처리된 결제입니다.');
        return;
      }

      const refundType = body.querySelector('input[name="refundType"]:checked')?.value || 'full';
      const refundAmountInput = Number(body.querySelector('#refundAmountInput')?.value || 0);
      const note = body.querySelector('#refundNoteInput')?.value.trim() || '';
      const checkedTags = Array.from(body.querySelectorAll('[data-checklist-item="1"]:checked'))
        .map((el) => el.value.trim())
        .filter(Boolean);

      if (refundType === 'partial' && (!refundAmountInput || refundAmountInput <= 0)) {
        alert('부분 환불 금액을 입력해 주세요.');
        return;
      }

      try {
        if (window.BSQ?.ready) await window.BSQ.ready;
        const res = await window.BSQ.api('/api/admin/refunds', {
          method: 'POST',
          body: {
            user_id: detail.user?.id || detail.id || '',
            order_id: selected.order_id,
            refund_type: refundType,
            refund_amount: refundType === 'partial' ? refundAmountInput : Number(selected.final_amount || selected.amount || 0),
            reason_tags: checkedTags,
            reason_note: note,
          },
        });

        if (!res?.success) throw new Error(res?.error || '환불 처리 실패');

        closeRefundModal();
        await loadAdminUsers();
        await loadMemberSpecials();
        await openUserDetail(detail.user?.id || detail.id || '');
        alert('환불 처리가 완료되었습니다.');
      } catch (error) {
        alert(`환불 실패: ${error.message}`);
      }
    });
  }

  async function openRefundModal(userId, orderId = '') {
    const detail = window.__BSQ_CURRENT_USER_DETAIL__?.user?.id === userId ? window.__BSQ_CURRENT_USER_DETAIL__ : await fetchUserDetail(userId);
    const user = detail.user || detail;
    const modal = ensureRefundModal();
    const title = modal.querySelector('#refundModalTitle');
    const body = modal.querySelector('#refundModalBody');
    const state = buildRefundState(detail, orderId);

    title.textContent = `${getUserDisplayName(user)} 환불 처리`;
    body.innerHTML = renderRefundForm(detail, state);
    modal.style.display = 'flex';
    bindRefundModalEvents(detail, state);
  }

  function renderSpecialTab(data) {
    ensureSpecialTabShell();
    const blacklistList = $('specialBlacklistList');
    const refundList = $('specialRefundList');
    const blacklistCount = $('specialBlacklistCount');
    const refundCount = $('specialRefundCount');

    if (blacklistCount) blacklistCount.textContent = `${Number(data?.counts?.blacklist || 0).toLocaleString('ko-KR')}건`;
    if (refundCount) refundCount.textContent = `${Number(data?.counts?.refund || 0).toLocaleString('ko-KR')}건`;

    if (blacklistList) {
      const blacklistLogs = Array.isArray(data?.blacklist_logs) ? data.blacklist_logs : [];
      blacklistList.innerHTML = blacklistLogs.length
        ? blacklistLogs.map(renderBlacklistCard).join('')
        : emptyState('블랙리스트 내역이 없습니다.');
    }

    if (refundList) {
      const refundLogs = Array.isArray(data?.refund_logs) ? data.refund_logs : [];
      refundList.innerHTML = refundLogs.length
        ? refundLogs.map(renderRefundCard).join('')
        : emptyState('환불 내역이 없습니다.');
    }
  }

  async function loadMemberSpecials() {
    ensureSpecialTabShell();
    const blacklistList = $('specialBlacklistList');
    const refundList = $('specialRefundList');
    if (blacklistList) blacklistList.innerHTML = emptyState('불러오는 중입니다...');
    if (refundList) refundList.innerHTML = emptyState('불러오는 중입니다...');

    try {
      if (window.BSQ?.ready) await window.BSQ.ready;
      const res = await window.BSQ.api('/api/admin/member-specials?limit=30');
      if (!res?.success) throw new Error(res?.error || '특이사항 목록을 불러오지 못했습니다.');
      renderSpecialTab(res.data || {});
    } catch (error) {
      console.error('[Admin Users] special list load failed:', error);
      if (blacklistList) blacklistList.innerHTML = emptyState(error.message);
      if (refundList) refundList.innerHTML = emptyState(error.message);
    }
  }

  function bindSpecialTabEvents() {
    document.addEventListener('click', (event) => {
      const detailCard = event.target.closest('[data-open-user-detail="1"]');
      if (detailCard) {
        const userId = detailCard.dataset.specialUserId || detailCard.dataset.userId;
        if (userId) openUserDetail(userId);
        return;
      }

      const unblacklistBtn = event.target.closest('[data-unblacklist-btn="1"]');
      if (unblacklistBtn) {
        event.preventDefault();
        event.stopPropagation();
        const userId = unblacklistBtn.dataset.userId;
        if (userId) toggleUserBlacklist(userId, true);
        return;
      }

      const reloadSpecials = event.target.closest('#btnReloadSpecialMembers');
      if (reloadSpecials) {
        loadMemberSpecials();
      }
    });
  }

  function init() {
    ensureUsersToolbar();
    ensureSpecialTabShell();
    bindSpecialTabEvents();

    const tabRoles = $('tabRoles');
    if (tabRoles?.classList.contains('active')) loadMemberSpecials();

    window.addEventListener('adminTabChanged', (event) => {
      const tabId = event?.detail?.tabId;
      if (tabId === 'tabRoles') {
        ensureSpecialTabShell();
        loadMemberSpecials();
      }
    });
  }

  function formatApiError(result, fallback) {
    const parts = [];
    if (result?.error) parts.push(result.error);
    if (result?.detail && result.detail !== result.error) parts.push(result.detail);
    return parts.length ? parts.join(' / ') : fallback;
  }

  function ensureUsersToolbar() {
    const usersHeader = document.querySelector('#tabUsers .card-header');
    if (usersHeader && !document.getElementById('searchInputUsers')) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-left:auto;';
      wrapper.innerHTML = `
        <input type="text" id="searchInputUsers" class="admin-form-input" placeholder="닉네임, 이름, 이메일, 연락처 검색" style="width:320px; margin:0;">
        <button type="button" id="btnReloadUsers" class="btn-small outline">새로고침</button>
      `;
      usersHeader.appendChild(wrapper);
    }

    const sectionTitle = document.querySelector('#tabUsers .section-title');
    if (sectionTitle) sectionTitle.textContent = '가입 회원';

    const sectionDescription = document.querySelector('#tabUsers .card-header p');
    if (sectionDescription) {
      sectionDescription.textContent = '전체 가입 회원 목록을 빠르게 확인하고 상태를 관리합니다.';
    }

    const thead = document.querySelector('#tabUsers thead');
    if (thead && !thead.dataset.bsqUsersHeaderReady) {
      thead.innerHTML = `
        <tr>
          <th>회원</th>
          <th>이름</th>
          <th>연락처</th>
          <th>메일</th>
          <th>생년월일</th>
          <th>가입일</th>
          <th>회원상태</th>
          <th>최근 수강 / 수강권</th>
          <th>관리</th>
        </tr>
      `;
      thead.dataset.bsqUsersHeaderReady = '1';
    }

    const loadingCell = document.querySelector('#allUsersTableBody td[colspan]');
    if (loadingCell && loadingCell.colSpan !== 9) {
      loadingCell.colSpan = 9;
    }
  }

  function renderUserRow(user) {
    const role = getRoleMeta(user.role);
    const nickname = getUserDisplayName(user);
    const accountLabel = user.username || user.nickname || user.id || '';
    const recentClass = user.recent_class_title || '최근 수강 없음';
    const recentAt = user.recent_class_at ? formatDateOnly(user.recent_class_at) : '';
    const passCount = Number(user.active_pass_count || 0);
    const isBlacklisted = !!user.is_blacklisted;

    return `
      <tr data-user-row="1" data-user-id="${escapeHtml(user.id)}" style="cursor:pointer; vertical-align:middle;">
        <td style="min-width:0;">
          <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
            <img src="${escapeHtml(avatarUrl(user))}" alt="" style="width:42px; height:42px; border-radius:999px; object-fit:cover; border:1px solid #e5e7eb; background:#f8fafc; flex:0 0 auto;">
            <div style="min-width:0; display:grid; gap:0.28rem;">
              <div style="display:flex; align-items:center; gap:0.45rem; min-width:0; flex-wrap:wrap;">
                <div style="font-weight:700; line-height:1.25; min-width:0; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(nickname)}">${escapeHtml(nickname)}</div>
                <span class="admin-badge ${role.badge}" style="white-space:nowrap; flex:0 0 auto;">${escapeHtml(role.label)}</span>
              </div>
              <div style="font-size:0.75rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(accountLabel)}">@${escapeHtml(accountLabel)}</div>
            </div>
          </div>
        </td>
        <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(user.name || '-')}">${escapeHtml(user.name || '-')}</td>
        <td style="white-space:nowrap; font-variant-numeric:tabular-nums;">${escapeHtml(user.phone || '-')}</td>
        <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(user.email || '-')}">${escapeHtml(user.email || '-')}</td>
        <td style="white-space:nowrap; font-variant-numeric:tabular-nums;">${escapeHtml(user.birthdate || [user.birth_year, user.birth_month, user.birth_day].filter(Boolean).join('-') || '-')}</td>
        <td style="white-space:nowrap; font-variant-numeric:tabular-nums;">${escapeHtml(formatDateOnly(user.signup_date || user.created_at))}</td>
        <td><span class="admin-badge ${isBlacklisted ? 'danger' : 'muted'}" style="white-space:nowrap;">${isBlacklisted ? '블랙리스트' : '정상'}</span></td>
        <td>
          <div style="display:grid; gap:0.25rem; min-width:0;">
            <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(recentClass)}">${escapeHtml(recentClass)}</div>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; color:#64748b; font-size:0.78rem;">
              <span class="admin-badge muted" style="white-space:nowrap;">수강권 ${escapeHtml(countText(passCount))}</span>
              ${recentAt ? `<span style="white-space:nowrap;">최근 ${escapeHtml(recentAt)}</span>` : ''}
            </div>
          </div>
        </td>
        <td style="text-align:right;">
          <button type="button" class="btn-small ${isBlacklisted ? 'outline' : 'primary'}" data-blacklist-btn="1" data-user-id="${escapeHtml(user.id)}" data-is-blacklisted="${isBlacklisted ? '1' : '0'}">
            ${isBlacklisted ? '해제' : '등록'}
          </button>
        </td>
      </tr>
    `;
  }

  async function fetchUserDetail(userId) {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`);
    if (!res?.success || !res.data) {
      throw new Error(formatApiError(res, '회원 상세 정보를 가져오지 못했습니다.'));
    }
    return res.detail || res.data || {};
  }

  async function saveBlacklist(userId, enable, payload = {}) {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: {
        blacklisted: enable,
        blacklist_reason: payload.reason || payload.blacklist_reason || '',
      },
    });

    if (!res?.success) {
      throw new Error(formatApiError(res, '블랙리스트 상태 변경 실패'));
    }

    await loadAdminUsers();
    await loadMemberSpecials();
    if ($(USER_DETAIL_MODAL_ID)?.style.display === 'flex') {
      await openUserDetail(userId);
    }
    return res;
  }

  function bindSpecialTabEvents() {
    if (document.__bsqAdminUsersExtBound) return;
    document.__bsqAdminUsersExtBound = true;

    document.addEventListener('click', (event) => {
      const reloadUsers = event.target.closest('#btnReloadUsers');
      if (reloadUsers) {
        event.preventDefault();
        event.stopImmediatePropagation();
        loadAdminUsers();
        return;
      }

      const blacklistBtn = event.target.closest('[data-blacklist-btn="1"]');
      if (blacklistBtn) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const userId = blacklistBtn.dataset.userId;
        const isBlacklisted = blacklistBtn.dataset.isBlacklisted === '1';
        toggleUserBlacklist(userId, isBlacklisted);
        return;
      }

      const row = event.target.closest('#allUsersTableBody tr[data-user-row="1"]');
      if (row) {
        if (event.target.closest('button, input, a, textarea, select, label')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openUserDetail(row.dataset.userId);
        return;
      }

      const detailCard = event.target.closest('[data-open-user-detail="1"]');
      if (detailCard) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const userId = detailCard.dataset.specialUserId || detailCard.dataset.userId;
        if (userId) openUserDetail(userId);
        return;
      }

      const unblacklistBtn = event.target.closest('[data-unblacklist-btn="1"]');
      if (unblacklistBtn) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const userId = unblacklistBtn.dataset.userId;
        if (userId) toggleUserBlacklist(userId, true);
        return;
      }

      const reloadSpecials = event.target.closest('#btnReloadSpecialMembers');
      if (reloadSpecials) {
        event.preventDefault();
        event.stopImmediatePropagation();
        loadMemberSpecials();
      }
    }, true);

    const searchInput = $('searchInputUsers');
    if (searchInput && !searchInput.dataset.bsqExtBound) {
      searchInput.dataset.bsqExtBound = '1';
      searchInput.addEventListener('input', (event) => {
        event.stopImmediatePropagation();
        loadAdminUsers();
      }, true);
    }
  }

  function init() {
    ensureUsersToolbar();
    ensureSpecialTabShell();
    bindSpecialTabEvents();

    const searchInput = $('searchInputUsers');
    if (searchInput && !searchInput.dataset.bsqExtBound) {
      searchInput.dataset.bsqExtBound = '1';
      searchInput.addEventListener('input', () => loadAdminUsers(), true);
    }

    const tabUsers = $('tabUsers');
    if (tabUsers?.classList.contains('active')) loadAdminUsers();

    const tabRoles = $('tabRoles');
    if (tabRoles?.classList.contains('active')) loadMemberSpecials();

    window.addEventListener('adminTabChanged', (event) => {
      const tabId = event?.detail?.tabId;
      if (tabId === 'tabUsers') {
        event.stopImmediatePropagation();
        ensureUsersToolbar();
        loadAdminUsers();
      } else if (tabId === 'tabRoles') {
        event.stopImmediatePropagation();
        ensureSpecialTabShell();
        loadMemberSpecials();
      }
    }, true);
  }

  window.loadAdminUsers = loadAdminUsers;
  window.openUserDetail = openUserDetail;
  window.showUserDetail = openUserDetail;
  window.toggleUserBlacklist = toggleUserBlacklist;
  window.closeUserDetail = closeUserDetail;
  window.openBlacklistModal = openBlacklistModal;
  window.openRefundModal = openRefundModal;
  window.loadMemberSpecials = loadMemberSpecials;
  window.ensureUsersToolbar = ensureUsersToolbar;

  window.loadAdminUsers = loadAdminUsers;
  window.openUserDetail = openUserDetail;
  window.showUserDetail = openUserDetail;
  window.toggleUserBlacklist = toggleUserBlacklist;
  window.closeUserDetail = closeUserDetail;
  window.openBlacklistModal = openBlacklistModal;
  window.openRefundModal = openRefundModal;
  window.loadMemberSpecials = loadMemberSpecials;
  window.ensureUsersToolbar = ensureUsersToolbar;

  document.addEventListener('DOMContentLoaded', init);
})();
