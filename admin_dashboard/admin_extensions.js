// Admin dashboard extensions
(function () {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

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

  const ROLE_META = {
    user: { label: '일반수강생', badge: 'muted' },
    instructor: { label: '강사', badge: 'info' },
    operator: { label: '운영관리자', badge: 'warning' },
    admin: { label: '총괄운영관리자', badge: 'danger' },
    super_admin: { label: '총괄운영관리자', badge: 'danger' },
  };

  const MENU_AUDIENCE_LABEL = {
    all: '전체',
    operator: '운영자',
    instructor: '강사',
    admin: '총괄운영자',
  };

  let operatorSearchTimer = null;
  let operatorRows = [];
  let operatorSummary = { total: 0, superAdmin: 0, operator: 0, instructor: 0, user: 0 };
  let currentMenus = [];

  function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
    if (['manager', 'operator_admin', 'ops'].includes(value)) return 'operator';
    if (['teacher', 'lecturer'].includes(value)) return 'instructor';
    if (value in ROLE_META) return value;
    return 'user';
  }

  function getRoleInfo(role) {
    return ROLE_META[normalizeRole(role)] || ROLE_META.user;
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString('ko-KR') : '-';
  }

  function formatBirthdate(user) {
    const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
    return parts.length ? parts.join('-') : '-';
  }

  function classLabelFromItem(item) {
    if (!item) return '';
    const title = escapeHtml(item.title || item.class_title || '-');
    const type = item.type || 'main';
    return type === 'main' ? `주강사: ${title}` : `부강사: ${title}`;
  }

  function formatClassSummary(mainClasses = [], subClasses = []) {
    const parts = [
      ...mainClasses.slice(0, 2).map((item) => classLabelFromItem({ ...item, type: 'main' })),
      ...subClasses.slice(0, 2).map((item) => classLabelFromItem({ ...item, type: 'sub' })),
    ].filter(Boolean);

    if (!parts.length) return '-';

    const remaining = Math.max(0, (mainClasses.length + subClasses.length) - parts.length);
    return remaining > 0 ? `${parts.join('<br>')}<br>외 ${remaining}개` : parts.join('<br>');
  }

  function ensureOperatorsLayout() {
    const section = document.getElementById('tabOperators');
    if (!section || section.dataset.operatorLayoutReady === '1') return;

    const theadRow = section.querySelector('thead tr');
    if (theadRow) {
      theadRow.innerHTML = `
        <th style="width:44px;"><input type="checkbox" disabled></th>
        <th>닉네임 / 이름</th>
        <th>연락처</th>
        <th>이메일</th>
        <th>생년월일</th>
        <th>가입일자</th>
        <th>강사정보</th>
        <th>운영자 상태</th>
        <th>관리</th>
      `;
    }

    const headerButtons = section.querySelectorAll('.card-header .btn-primary');
    const operatorBtn = headerButtons[0];
    const instructorBtn = headerButtons[1];
    const searchInput = section.querySelector('input[type="text"]');

    if (operatorBtn && !operatorBtn.dataset.bound) {
      operatorBtn.dataset.bound = '1';
      operatorBtn.addEventListener('click', () => {
        quickAssignRole('operator');
      });
    }

    if (instructorBtn && !instructorBtn.dataset.bound) {
      instructorBtn.dataset.bound = '1';
      instructorBtn.addEventListener('click', () => {
        quickAssignRole('instructor');
      });
    }

    if (searchInput && !searchInput.dataset.operatorSearchBound) {
      searchInput.dataset.operatorSearchBound = '1';
      searchInput.addEventListener('input', () => {
        clearTimeout(operatorSearchTimer);
        operatorSearchTimer = setTimeout(() => {
          loadOperators({ search: searchInput.value.trim() });
        }, 250);
      });
    }

    section.dataset.operatorLayoutReady = '1';
  }

  async function quickAssignRole(targetRole) {
    const keyword = prompt(`${getRoleInfo(targetRole).label} 후보를 찾을 키워드를 입력하세요. 이름, 닉네임, 이메일, 연락처 검색 가능`);
    if (keyword === null) return;

    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('limit', '20');

      const res = await BSQ.api(`/api/admin/operators${params.toString() ? `?${params.toString()}` : ''}`);
      const items = Array.isArray(res.data) ? res.data : [];

      if (!items.length) {
        alert('검색 결과가 없습니다.');
        return;
      }

      if (items.length === 1) {
        await updateOperatorRole(items[0].id, targetRole);
        return;
      }

      alert('검색 결과가 여러 명입니다. 목록에서 직접 선택해 주세요.');
      loadOperators({ search: keyword.trim(), role: targetRole === 'instructor' ? 'instructor' : '' });
    } catch (err) {
      alert(err.message);
    }
  }

  function renderOperatorsTable(items) {
    const body = document.getElementById('operatorsTableBody');
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#aaa;">등록된 운영자 / 강사 / 회원이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = items.map((user) => {
      const roleInfo = getRoleInfo(user.role);
      const mainClasses = Array.isArray(user.main_classes) ? user.main_classes : [];
      const subClasses = Array.isArray(user.sub_classes) ? user.sub_classes : [];
      const classSummary = formatClassSummary(mainClasses, subClasses);
      const avatar = user.profile_image_url || '/assets/default-avatar.svg';
      const normalizedRole = normalizeRole(user.role);

      return `
        <tr data-user-id="${escapeHtml(user.id)}">
          <td><input type="checkbox" data-operator-row-check="${escapeHtml(user.id)}"></td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${escapeHtml(avatar)}" alt="" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
              <div>
                <div style="font-weight:700;">${escapeHtml(user.username || '-')}</div>
                <div style="font-size:0.85rem; color:#6b7280;">${escapeHtml(user.name || '-')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(user.phone || '-')}</td>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${escapeHtml(formatBirthdate(user))}</td>
          <td>${escapeHtml(formatDate(user.signup_date || user.created_at))}</td>
          <td style="font-size:0.82rem; line-height:1.5;">
            <div><strong>주 강사:</strong> ${escapeHtml(mainClasses.length ? `${mainClasses.length}개` : '없음')}</div>
            <div><strong>부 강사:</strong> ${escapeHtml(subClasses.length ? `${subClasses.length}개` : '없음')}</div>
            <div style="color:#6b7280; margin-top:4px;">${classSummary === '-' ? '-' : classSummary}</div>
          </td>
          <td><span class="badge ${roleInfo.badge}">${escapeHtml(roleInfo.label)}</span></td>
          <td>
            <div style="display:flex; flex-direction:column; gap:0.4rem; min-width:180px;">
              <select class="admin-form-input" data-role-select="${escapeHtml(user.id)}" style="margin:0; padding:0.35rem 0.5rem;">
                <option value="user" ${normalizedRole === 'user' ? 'selected' : ''}>일반수강생</option>
                <option value="instructor" ${normalizedRole === 'instructor' ? 'selected' : ''}>강사</option>
                <option value="operator" ${normalizedRole === 'operator' ? 'selected' : ''}>운영관리자</option>
                <option value="admin" ${normalizedRole === 'admin' || normalizedRole === 'super_admin' ? 'selected' : ''}>총괄운영관리자</option>
              </select>
              <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                <button class="btn-small outline" onclick="updateOperatorRoleBySelect('${escapeJsString(user.id)}')">저장</button>
                <button class="btn-small outline" onclick="updateOperatorRole('${escapeJsString(user.id)}', 'instructor')">강사</button>
                <button class="btn-small outline" onclick="updateOperatorRole('${escapeJsString(user.id)}', 'operator')">운영자</button>
                <button class="btn-small danger" onclick="removeOperator('${escapeJsString(user.id)}')">해제</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadOperators(options = {}) {
    try {
      ensureOperatorsLayout();

      const searchInput = document.querySelector('#tabOperators input[type="text"]');
      const search = String(options.search ?? searchInput?.value ?? '').trim();
      const role = String(options.role || '').trim();

      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (role && role !== 'all') params.set('role', role);

      const res = await BSQ.api(`/api/admin/operators${params.toString() ? `?${params.toString()}` : ''}`);
      const items = Array.isArray(res.data) ? res.data : [];
      operatorRows = items;
      operatorSummary = res.summary || operatorSummary;

      renderOperatorsTable(items);

      const countAllOps = document.getElementById('countAllOps');
      const countAdmins = document.getElementById('countAdmins');
      const countInsts = document.getElementById('countInsts');
      if (countAllOps) countAllOps.textContent = `전체 ${operatorSummary.total ?? items.length}명`;
      if (countAdmins) countAdmins.textContent = `총괄 ${operatorSummary.superAdmin ?? 0}명`;
      if (countInsts) countInsts.textContent = `강사 ${operatorSummary.instructor ?? 0}명`;
    } catch (err) {
      console.error('[Operators] Error:', err);
      const body = document.getElementById('operatorsTableBody');
      if (body) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444;">운영자 목록을 불러오지 못했습니다: ${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  async function updateOperatorRole(userId, newRole) {
    if (!userId) return;
    const label = getRoleInfo(newRole).label;
    if (!confirm(`이 사용자의 역할을 "${label}"로 변경할까요?`)) return;

    try {
      const res = await BSQ.api('/api/admin/operators', {
        method: 'PUT',
        body: { user_id: userId, role: newRole },
      });

      if (!res?.success) throw new Error(res?.error || '권한 변경 실패');
      await loadOperators();
      alert('권한이 변경되었습니다.');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  window.updateOperatorRole = updateOperatorRole;
  window.updateOperatorRoleBySelect = async function (userId) {
    const select = document.querySelector(`[data-role-select="${CSS.escape(userId)}"]`);
    if (!select) return;
    await updateOperatorRole(userId, select.value);
  };
  window.removeOperator = async function (userId) {
    await updateOperatorRole(userId, 'user');
  };

  const NOTICE_EDITOR_TOOLBAR = [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean'],
  ];

  let globalNoticeEditor = null;
  let currentGlobalNotice = null;

  function getItemId(item) {
    return String(item?.id || item?.push_key || item?.notice_id || '').trim();
  }

  function normalizeHtmlContent(value) {
    const html = String(value ?? '').trim();
    if (!html || html === '<p><br></p>') return '';
    return html;
  }

  function stripHtml(value) {
    const html = String(value ?? '');
    if (!html) return '';
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function truncateText(value, limit = 72) {
    const text = stripHtml(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1))}...`;
  }

  function formatLongDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR');
  }

  function getNoticeTypeLabel(item) {
    return item?.type === 'important' ? '중요' : '일반';
  }

  function getNoticeTypeBadgeClass(item) {
    return item?.type === 'important' ? 'danger' : 'muted';
  }

  function getClassNoticeRoleMeta(item) {
    const explicitLabel = String(item?.author_role_label || item?.author_kind_label || '').trim();
    const rawRole = String(item?.author_role || item?.author_type || item?.writer_role || '').trim().toLowerCase();

    if (explicitLabel) {
      return {
        label: explicitLabel,
        className: rawRole.includes('sub') ? 'board-role-badge--sub' : rawRole.includes('main') ? 'board-role-badge--main' : 'board-role-badge--staff',
      };
    }

    if (rawRole.includes('main') || rawRole === 'creator' || rawRole === 'primary' || item?.is_main_instructor) {
      return { label: '메인 강사', className: 'board-role-badge--main' };
    }

    if (rawRole.includes('sub') || rawRole === 'assistant' || item?.is_sub_instructor) {
      return { label: '서브 강사', className: 'board-role-badge--sub' };
    }

    if (rawRole === 'operator' || rawRole === 'admin' || rawRole === 'super_admin') {
      return { label: '운영자', className: 'board-role-badge--staff' };
    }

    return { label: item?.author_name ? '강사' : '-', className: 'board-role-badge--staff' };
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function getGlobalNoticeEditor() {
    const container = document.getElementById('globalNoticeEditor');
    if (!container || !window.Quill) return null;

    if (!globalNoticeEditor) {
      globalNoticeEditor = new Quill('#globalNoticeEditor', {
        theme: 'snow',
        placeholder: '공지 내용을 입력하세요...',
        modules: { toolbar: NOTICE_EDITOR_TOOLBAR },
      });
    }

    return globalNoticeEditor;
  }

  function setGlobalNoticeEditorContent(html = '') {
    const editor = getGlobalNoticeEditor();
    const fallback = document.getElementById('globalNoticeEditorFallback');
    const normalized = normalizeHtmlContent(html);

    if (editor) {
      editor.setText('');
      if (normalized) editor.clipboard.dangerouslyPasteHTML(normalized);
    }

    if (fallback) fallback.value = normalized;
  }

  function getGlobalNoticeEditorContent() {
    const editor = getGlobalNoticeEditor();
    if (editor) return normalizeHtmlContent(editor.root.innerHTML);
    const fallback = document.getElementById('globalNoticeEditorFallback');
    return normalizeHtmlContent(fallback?.value || '');
  }

  function renderNoticeViewerComments(comments = []) {
    const container = document.getElementById('globalNoticeViewerComments');
    if (!container) return;

    const items = Array.isArray(comments) ? comments : [];
    if (!items.length) {
      container.innerHTML = '<div class="board-empty-state">관련 댓글이 없습니다.</div>';
      return;
    }

    container.innerHTML = items.map((comment) => `
      <article class="board-comment-card">
        <div class="board-comment-meta">
          <strong>${escapeHtml(comment.user_name || comment.author_name || '사용자')}</strong>
          <span>${escapeHtml(formatLongDate(comment.created_at))}</span>
        </div>
        <p>${escapeHtml(comment.content || '').replace(/\n/g, '<br>')}</p>
      </article>
    `).join('');
  }

  function populateNoticeViewer(detail) {
    if (!detail) return;

    currentGlobalNotice = detail;
    document.getElementById('globalNoticeViewerTitle').textContent = detail.title || '공지 상세';

    const typeBadge = document.getElementById('globalNoticeViewerType');
    if (typeBadge) {
      typeBadge.textContent = getNoticeTypeLabel(detail);
      typeBadge.className = `board-view-badge admin-badge ${getNoticeTypeBadgeClass(detail)}`;
    }

    document.getElementById('globalNoticeViewerAuthor').textContent = `작성자: ${detail.author_name || '관리자'}`;
    document.getElementById('globalNoticeViewerDate').textContent = `작성일: ${formatLongDate(detail.created_at)}`;
    document.getElementById('globalNoticeViewerViews').textContent = `조회수: ${fmt(detail.views || 0)}`;
    document.getElementById('globalNoticeViewerLikeCount').textContent = `좋아요: ${fmt(detail.like_count || 0)}`;
    document.getElementById('globalNoticeViewerCommentCount').textContent = `댓글: ${fmt((detail.comments || []).length)}`;
    document.getElementById('globalNoticeViewerHidden').textContent = `노출 상태: ${Number(detail.is_hidden || 0) ? '숨김' : '노출'}`;

    const contentEl = document.getElementById('globalNoticeViewerContent');
    if (contentEl) {
      contentEl.innerHTML = detail.content || '<div class="board-empty-state" style="padding:0;">내용이 없습니다.</div>';
    }

    renderNoticeViewerComments(detail.comments || []);
  }

  async function fetchGlobalNoticeDetail(id) {
    if (!id) return null;
    const res = await BSQ.api(`/api/notices?id=${encodeURIComponent(id)}&include_hidden=1`);
    if (!res?.success || !res.data) throw new Error(res?.error || '공지 상세 정보를 불러오지 못했습니다.');
    return res.data;
  }

  function openGlobalNoticeEditor(item = null) {
    currentGlobalNotice = item || null;
    document.getElementById('globalNoticeEditorTitle').textContent = item ? '공지사항 수정' : '새 공지사항 작성';
    document.getElementById('globalNoticeEditorId').value = getItemId(item);
    document.getElementById('globalNoticeTitle').value = item?.title || '';
    document.getElementById('globalNoticeTypeImportant').checked = item?.type === 'important';
    document.getElementById('globalNoticeTypeNormal').checked = item?.type !== 'important';
    document.getElementById('globalNoticeHidden').checked = Number(item?.is_hidden || 0) === 1;
    setGlobalNoticeEditorContent(item?.content || '');
    openModal('globalNoticeEditorModal');

    const titleInput = document.getElementById('globalNoticeTitle');
    window.setTimeout(() => titleInput?.focus(), 50);
  }

  async function openGlobalNoticeViewer(idOrItem) {
    const id = typeof idOrItem === 'string' ? idOrItem : getItemId(idOrItem);
    if (!id) return;

    try {
      const detail = (typeof idOrItem === 'object' && idOrItem?.comments)
        ? idOrItem
        : await fetchGlobalNoticeDetail(id);
      populateNoticeViewer(detail);
      openModal('globalNoticeViewerModal');
    } catch (error) {
      console.error('[Boards] detail load failed:', error);
      alert(error.message || '공지 상세를 불러오지 못했습니다.');
    }
  }

  async function saveGlobalNotice() {
    const id = document.getElementById('globalNoticeEditorId')?.value?.trim() || '';
    const title = document.getElementById('globalNoticeTitle')?.value.trim() || '';
    const content = getGlobalNoticeEditorContent();
    const type = document.getElementById('globalNoticeTypeImportant')?.checked ? 'important' : 'normal';
    const isHidden = document.getElementById('globalNoticeHidden')?.checked || false;

    if (!title) {
      alert('공지 제목을 입력하세요.');
      return;
    }

    if (!stripHtml(content)) {
      alert('공지 내용을 입력하세요.');
      return;
    }

    const btn = document.getElementById('btnGlobalNoticeSave');
    const previousText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '저장 중...';
    }

    try {
      const payload = {
        id: id || undefined,
        title,
        content,
        type,
        is_hidden: isHidden,
      };

      const res = await BSQ.api('/api/notices', {
        method: 'POST',
        body: payload,
      });

      if (!res?.success) throw new Error(res?.error || '공지 저장에 실패했습니다.');

      closeModal('globalNoticeEditorModal');
      await loadGlobalBoards();

      if (payload.id) {
        try {
          const refreshed = await fetchGlobalNoticeDetail(payload.id);
          populateNoticeViewer(refreshed);
          openModal('globalNoticeViewerModal');
        } catch {
          // ignore refresh failures after save
        }
      }

      alert('공지사항이 저장되었습니다.');
    } catch (error) {
      console.error('[Boards] save failed:', error);
      alert(`공지 저장 실패: ${error.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = previousText || '저장';
      }
    }
  }

  async function removeGlobalNotice(id) {
    if (!id) return;
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;

    try {
      const res = await BSQ.api(`/api/notices?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res?.success) throw new Error(res?.error || '공지 삭제 실패');
      if (currentGlobalNotice && getItemId(currentGlobalNotice) === id) {
        closeModal('globalNoticeViewerModal');
        currentGlobalNotice = null;
      }
      await loadGlobalBoards();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function getClassNoticeMoveUrl(item) {
    const classId = String(item?.class_id || '').trim();
    if (!classId) return '';
    return `../class_view/class_view.html?id=${encodeURIComponent(classId)}&tab=notice`;
  }

  loadGlobalBoards = async function loadGlobalBoardsClean() {
    try {
      const res = await BSQ.api('/api/notices?include_hidden=1');
      const body = document.getElementById('globalBoardsTableBody');
      if (!body) return;

      const notices = Array.isArray(res.data) ? [...res.data] : [];
      notices.sort((a, b) => {
        if (a.type === 'important' && b.type !== 'important') return -1;
        if (a.type !== 'important' && b.type === 'important') return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      if (!notices.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#aaa;">등록된 공지가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = notices.map((n) => `
        <tr data-notice-id="${escapeHtml(getItemId(n))}" style="cursor:pointer;">
          <td>
            <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
              <span class="admin-badge ${getNoticeTypeBadgeClass(n)}">${escapeHtml(getNoticeTypeLabel(n))}</span>
              ${Number(n.is_hidden || 0) ? '<span class="admin-badge danger">숨김</span>' : ''}
            </div>
          </td>
          <td style="text-align:left;">
            <strong>${escapeHtml(n.title || '-')}</strong>
            ${truncateText(n.content || '') ? `<div style="margin-top:0.35rem; color:#6b7280; font-size:0.82rem;">${escapeHtml(truncateText(n.content || '', 64))}</div>` : ''}
          </td>
          <td>${escapeHtml(n.author_name || '-')}</td>
          <td>${escapeHtml(formatDate(n.created_at))}</td>
          <td>${fmt(n.views || 0)}</td>
          <td>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <button class="btn-small outline" type="button" onclick="event.stopPropagation(); openGlobalNoticeViewer('${escapeJsString(getItemId(n))}')">보기</button>
              <button class="btn-small outline" type="button" onclick="event.stopPropagation(); openGlobalNoticeEditorById('${escapeJsString(getItemId(n))}')">수정</button>
              <button class="btn-small danger" type="button" onclick="event.stopPropagation(); deleteGlobalNotice('${escapeJsString(getItemId(n))}')">삭제</button>
            </div>
          </td>
        </tr>
      `).join('');

      body.querySelectorAll('tr[data-notice-id]').forEach((row) => {
        row.addEventListener('click', () => {
          const noticeId = row.dataset.noticeId;
          if (noticeId) openGlobalNoticeViewer(noticeId);
        });
      });
    } catch (err) {
      console.error('[Boards] Error:', err);
    }
  };

  window.openGlobalNoticeViewer = openGlobalNoticeViewer;
  window.openGlobalNoticeEditor = openGlobalNoticeEditor;
  window.openGlobalNoticeEditorById = async function (id) {
    if (!id) {
      openGlobalNoticeEditor(null);
      return;
    }
    try {
      const detail = await fetchGlobalNoticeDetail(id);
      openGlobalNoticeEditor(detail);
    } catch (error) {
      alert(error.message || '공지 데이터를 불러오지 못했습니다.');
    }
  };

  window.deleteGlobalNotice = async function (id) {
    await removeGlobalNotice(id);
  };

  loadClassBoards = async function loadClassBoardsClean() {
    try {
      const res = await BSQ.api('/api/class-notices');
      const body = document.getElementById('classBoardsTableBody');
      if (!body) return;

      const notices = Array.isArray(res.data) ? [...res.data] : [];
      notices.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      if (!notices.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#aaa;">등록된 클래스 공지가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = notices.map((n) => {
        const roleMeta = getClassNoticeRoleMeta(n);
        const classTitle = n.class_title || n.class_name || n.class_id || '-';
        return `
          <tr>
            <td>${escapeHtml(classTitle)}</td>
            <td>
              <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-start;">
                <span class="board-role-badge ${roleMeta.className}">${escapeHtml(roleMeta.label)}</span>
                <span style="font-size:0.82rem; color:#6b7280;">${escapeHtml(n.author_name || '-')}</span>
              </div>
            </td>
            <td style="text-align:left;">${escapeHtml(n.title || '-')}</td>
            <td>${escapeHtml(formatDate(n.created_at))}</td>
            <td>
              <button class="btn-small outline" type="button" onclick="openClassNoticeTarget('${escapeJsString(getItemId(n))}', '${escapeJsString(n.class_id || '')}')">이동</button>
            </td>
            <td>
              <button class="btn-small danger" type="button" onclick="deleteClassNotice('${escapeJsString(getItemId(n))}')">삭제</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[ClassBoards] Error:', err);
    }
  };

  window.openClassNoticeTarget = function (noticeId, classId) {
    const targetClassId = String(classId || '').trim();
    if (!targetClassId) return;
    const url = getClassNoticeMoveUrl({ class_id: targetClassId });
    if (url) window.open(url, '_blank', 'noopener');
  };

  window.deleteClassNotice = async function (id) {
    if (!confirm('이 클래스 공지를 삭제하시겠습니까?')) return;
    try {
      const res = await BSQ.api(`/api/class-notices?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res?.success) throw new Error(res?.error || '클래스 공지 삭제 실패');
      await loadClassBoards();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const writeNoticeBtnOverride = document.getElementById('btnWriteGlobalNotice');
  if (writeNoticeBtnOverride) {
    writeNoticeBtnOverride.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGlobalNoticeEditor(null);
    }, true);
  }

  document.getElementById('btnGlobalNoticeSave')?.addEventListener('click', saveGlobalNotice);
  document.getElementById('btnGlobalNoticeEdit')?.addEventListener('click', () => {
    if (!currentGlobalNotice) return;
    openGlobalNoticeEditor(currentGlobalNotice);
  });
  document.getElementById('btnGlobalNoticeDelete')?.addEventListener('click', async () => {
    const id = getItemId(currentGlobalNotice);
    if (!id) return;
    await removeGlobalNotice(id);
  });

  document.querySelectorAll('[data-action="close-global-notice-editor"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal('globalNoticeEditorModal'));
  });

  document.querySelectorAll('[data-action="close-global-notice-viewer"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal('globalNoticeViewerModal'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeModal('globalNoticeEditorModal');
    closeModal('globalNoticeViewerModal');
  });

  async function loadCoupons() {
    try {
      const res = await BSQ.api('/api/admin/coupons');
      const body = document.getElementById('couponsTableBody');
      if (!body) return;

      const coupons = Array.isArray(res.data) ? res.data : [];
      if (!coupons.length) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#aaa;">등록된 쿠폰이 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = coupons.map((c) => `
        <tr>
          <td><strong>${escapeHtml(c.code)}</strong></td>
          <td>${escapeHtml(c.name || '')}</td>
          <td>${c.type === 'percent' ? `${fmt(c.amount)}%` : `${fmt(c.amount)}원`}</td>
          <td>${fmt(c.min_order_amount)}원</td>
          <td>${fmt(c.used_count)} / ${c.max_issue_count === 0 ? '무제한' : fmt(c.max_issue_count)}</td>
          <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString('ko-KR') : '-'}</td>
          <td><span class="badge ${c.is_active ? 'info' : 'danger'}">${c.is_active ? '활성' : '만료'}</span></td>
          <td><button class="btn-small danger" onclick="deleteCoupon('${escapeJsString(c.code)}')">삭제</button></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('[Coupons] Error:', err);
    }
  }

  window.createCoupon = async function () {
    const code = prompt('쿠폰 코드를 입력하세요. 예: SPRING2024');
    if (!code) return;
    const amount = prompt('할인 금액 또는 할인율을 숫자로 입력하세요. 예: 20');
    if (!amount) return;
    const isPercent = confirm('퍼센트 할인인가요? 확인을 누르면 % 할인, 취소하면 정액 할인입니다.');

    try {
      const payload = {
        code: code.toUpperCase(),
        name: `${code} 쿠폰`,
        type: isPercent ? 'percent' : 'fixed',
        amount: parseInt(amount, 10) || 0,
        max_issue_count: 0,
      };

      const res = await BSQ.api('/api/admin/coupons', {
        method: 'POST',
        body: payload,
      });

      if (!res?.success) throw new Error(res?.error || 'Coupon creation failed');
      alert('쿠폰이 생성되었습니다.');
      loadCoupons();
    } catch (err) {
      alert(`쿠폰 생성 실패: ${err.message}`);
    }
  };

  window.deleteCoupon = async function (code) {
    if (!confirm('이 쿠폰을 삭제할까요?')) return;
    try {
      await BSQ.api(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      loadCoupons();
    } catch (err) {
      alert(err.message);
    }
  };

  function renderMenus() {
    const body = document.getElementById('menuSettingsBody');
    if (!body) return;

    if (!currentMenus.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">등록된 메뉴가 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = currentMenus.map((m, i) => `
      <tr>
        <td><input type="text" value="${escapeHtml(m.label || '')}" class="admin-form-input" onchange="updateMenu(${i}, 'label', this.value)" style="margin:0;"></td>
        <td><input type="text" value="${escapeHtml(m.href || '')}" class="admin-form-input" onchange="updateMenu(${i}, 'href', this.value)" style="margin:0;"></td>
        <td>
          <select class="admin-form-input" style="margin:0;" onchange="updateMenu(${i}, 'target', this.value)">
            <option value="_self" ${m.target !== '_blank' ? 'selected' : ''}>현재 창</option>
            <option value="_blank" ${m.target === '_blank' ? 'selected' : ''}>새 창</option>
          </select>
        </td>
        <td><input type="checkbox" ${m.visible ? 'checked' : ''} onchange="updateMenu(${i}, 'visible', this.checked)"> 표시</td>
        <td><button class="btn-small danger" onclick="removeMenu(${i})">삭제</button></td>
      </tr>
    `).join('');
  }

  async function loadMenuSettings() {
    try {
      const res = await BSQ.api('/api/admin/menus');
      currentMenus = Array.isArray(res.data) ? res.data : [];
      renderMenus();
    } catch (err) {
      console.error('[Menus] Error:', err);
    }
  }

  window.updateMenu = function (idx, key, val) {
    if (currentMenus[idx]) {
      currentMenus[idx][key] = key === 'visible' ? (val ? 1 : 0) : val;
    }
  };

  window.addMenuRow = function () {
    currentMenus.push({
      id: `menu_${Date.now()}`,
      label: '새 메뉴',
      href: '/',
      target: '_self',
      visible: 1,
      sort_order: currentMenus.length,
      audience: 'all',
    });
    renderMenus();
  };

  window.removeMenu = function (idx) {
    currentMenus.splice(idx, 1);
    renderMenus();
  };

  window.saveMenuSettings = async function () {
    try {
      currentMenus.forEach((m, i) => { m.sort_order = i; });
      const res = await BSQ.api('/api/admin/menus', {
        method: 'PUT',
        body: currentMenus,
      });
      if (!res?.success) throw new Error(res?.error || 'Save failed');
      alert('메뉴가 저장되었습니다.');
      loadMenuSettings();
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    }
  };

  window.searchPayments = async function () {
    const keyword = document.getElementById('paymentSearchInput')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const from = document.getElementById('paymentFromDate')?.value || '';
    const to = document.getElementById('paymentToDate')?.value || '';

    try {
      const params = new URLSearchParams();
      if (keyword) params.append('search', keyword);
      if (status) params.append('status', status);
      if (from) params.append('from', from);
      if (to) params.append('to', to);

      const res = await BSQ.api(`/api/admin/orders${params.toString() ? `?${params.toString()}` : ''}`);
      const body = document.getElementById('paymentsViewBody');
      if (!body) return;

      const items = Array.isArray(res.data) ? res.data : [];
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#aaa;">검색 결과가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = items.map((o) => `
        <tr>
          <td><strong>${escapeHtml(o.order_id || '-')}</strong></td>
          <td>${escapeHtml(o.class_title || o.order_type || '-')}</td>
          <td>${escapeHtml(o.user_name || '-')}</td>
          <td>${escapeHtml(o.pay_method || '-')}</td>
          <td>${fmt((o.amount || 0) + (o.discount_amount || 0))}원</td>
          <td>${o.coupon_code ? `[${escapeHtml(o.coupon_code)}] -${fmt(o.discount_amount || 0)}원` : '-'}</td>
          <td><strong>${fmt(o.final_amount || o.amount || 0)}원</strong></td>
          <td><span class="badge ${o.status === 'paid' ? 'info' : (o.status === 'refunded' ? 'danger' : 'warning')}">${escapeHtml(o.status || '-')}</span></td>
          <td>${o.status === 'paid' ? `<button class="btn-small danger" onclick="requestRefund('${escapeJsString(o.order_id)}')">환불</button>` : '-'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('[Payments] Error:', err);
    }
  };

  window.requestRefund = async function (orderId) {
    if (!confirm(`${orderId} 주문을 환불 처리할까요?`)) return;
    try {
      await BSQ.api('/api/admin/orders', {
        method: 'PUT',
        body: { order_id: orderId, action: 'refund', status: 'refunded' },
      });
      alert('환불이 완료되었습니다.');
      searchPayments();
    } catch (err) {
      alert(`환불 실패: ${err.message}`);
    }
  };

  async function loadFinancial() {
    try {
      const type = document.getElementById('finTypeFilter')?.value || '';
      let url = '/api/admin/financial';
      if (type) url += `?type=${encodeURIComponent(type)}`;

      const res = await BSQ.api(url);
      const summary = res.summary || (res.data && res.data.summary) || {};
      const records = Array.isArray(res.records) ? res.records : (Array.isArray(res.data) ? res.data : []);

      const setMoney = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${fmt(value)}원`;
      };

      setMoney('finIncome', summary.total_income ?? summary.target_income ?? 0);
      setMoney('finRefund', summary.total_refund ?? summary.target_refund ?? 0);
      setMoney('finSettlement', summary.total_settlement ?? summary.target_settlement ?? 0);
      setMoney('finNet', summary.net ?? summary.target_net ?? 0);

      const body = document.getElementById('financialRecordsBody');
      if (!body) return;

      if (!records.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">기록이 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = records.map((r) => `
        <tr>
          <td><span class="badge ${r.type === 'income' ? 'info' : (r.type === 'refund' ? 'danger' : 'warning')}">${escapeHtml(r.type || '-')}</span></td>
          <td>${fmt(r.amount || 0)}원</td>
          <td>${escapeHtml(r.description || '-')}</td>
          <td>${escapeHtml(r.reference_id || r.related_order_id || r.related_settlement_id || '-')}</td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSettlementInfo() {
    try {
      const res = await BSQ.api('/api/admin/settlements?type=info');
      if (res.data && res.data.id === 'global') {
        const info = res.data;
        ['company_name', 'ceo_name', 'biz_num', 'address', 'biz_type', 'manager_email', 'bank_name', 'bank_account', 'bank_holder'].forEach((key) => {
          const el = document.getElementById(`si_${key}`);
          if (el) el.value = info[key] || '';
        });
      }
    } catch (err) {
      console.error('[SettlementInfo] Error:', err);
    }
  }

  window.saveSettlementInfo = async function () {
    try {
      const payload = {};
      ['company_name', 'ceo_name', 'biz_num', 'address', 'biz_type', 'manager_email', 'bank_name', 'bank_account', 'bank_holder'].forEach((key) => {
        const el = document.getElementById(`si_${key}`);
        if (el) payload[key] = el.value;
      });

      const res = await BSQ.api('/api/admin/settlements', {
        method: 'POST',
        body: { type: 'info', ...payload },
      });
      if (!res?.success) throw new Error(res?.error || 'Save failed');
      alert('정산 정보가 저장되었습니다.');
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    }
  };

  async function loadSettlementHistory() {
    try {
      const res = await BSQ.api('/api/admin/settlements');
      const body = document.getElementById('settlementHistoryBody');
      if (!body) return;

      const list = Array.isArray(res.data) ? res.data : [];
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#aaa;">정산 이력이 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = list.map((s) => `
        <tr>
          <td><strong>${escapeHtml(s.id)}</strong></td>
          <td>${escapeHtml(s.instructor_name || '-')}</td>
          <td>${escapeHtml(`${s.period_start || '-'} ~ ${s.period_end || '-'}`)}</td>
          <td>${fmt(s.total_revenue || 0)}원</td>
          <td>${fmt((s.platform_fee || 0) + (s.pg_fee || 0))}원</td>
          <td><strong style="color:#10b981;">${fmt(s.settlement_amount || 0)}원</strong></td>
          <td><span class="badge ${s.status === 'completed' ? 'info' : 'warning'}">${escapeHtml(s.status || '-')}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  window.addEventListener('adminTabChanged', (e) => {
    const tabId = e.detail?.tabId;
    if (tabId === 'tabOperators') loadOperators();
    if (tabId === 'tabBoards') loadGlobalBoards();
    if (tabId === 'tabClassBoards') loadClassBoards();
    if (tabId === 'tabCoupons') loadCoupons();
    if (tabId === 'tabMenuSettings') loadMenuSettings();
    if (tabId === 'tabPaymentsView') searchPayments();
    if (tabId === 'tabFinancial') loadFinancial();
    if (tabId === 'tabSettlementInfo') loadSettlementInfo();
    if (tabId === 'tabSettlementHistory') loadSettlementHistory();
  });

  const finTypeFilter = document.getElementById('finTypeFilter');
  if (finTypeFilter) {
    finTypeFilter.addEventListener('change', loadFinancial);
  }

  const btnDownloadTax = document.getElementById('btnDownloadTax');
  if (btnDownloadTax) {
    btnDownloadTax.addEventListener('click', async () => {
      try {
        const res = await BSQ.api('/api/admin/orders?status=paid&limit=500');
        const orders = Array.isArray(res.data) ? res.data : [];
        if (!orders.length) return alert('다운로드할 결제 기록이 없습니다.');

        const headers = ['주문번호', '회원명', '결제금액', '과세유형', '부가세'];
        const rows = orders.map((o) => [
          o.order_id,
          o.user_name || o.user_id || '',
          o.amount || 0,
          '과세',
          Math.floor((o.amount || 0) - ((o.amount || 0) / 1.1)),
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
          + headers.join(',') + '\n'
          + rows.map((row) => row.join(',')).join('\n');

        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', `tax_report_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  // Expose initial load helpers for buttons and other scripts
  window.loadOperators = loadOperators;
  window.loadMenuSettings = loadMenuSettings;
  window.loadFinancial = loadFinancial;

  // Clean overrides for the current admin UX
  function loadAllUsers() {
    return window.loadAdminUsers ? window.loadAdminUsers() : Promise.resolve();
  }

  function normalizeOperatorRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
    if (['manager', 'operator_admin', 'ops'].includes(value)) return 'operator';
    if (['teacher', 'lecturer'].includes(value)) return 'instructor';
    if (value === 'admin' || value === 'super_admin') return 'admin';
    return 'user';
  }

  function operatorRoleMeta(role) {
    const value = normalizeOperatorRole(role);
    if (value === 'admin') return { label: '총괄운영관리자', badge: 'danger' };
    if (value === 'operator') return { label: '운영관리자', badge: 'warning' };
    if (value === 'instructor') return { label: '강사', badge: 'info' };
    return { label: '일반수강생', badge: 'muted' };
  }

  function operatorClassSummary(mainClasses = [], subClasses = []) {
    const parts = [];
    if (mainClasses.length) {
      parts.push(`주강사 ${mainClasses.slice(0, 2).map((item) => escapeHtml(item.title || item.class_title || '-')).join(', ')}`);
    }
    if (subClasses.length) {
      parts.push(`서브강사 ${subClasses.slice(0, 2).map((item) => escapeHtml(item.title || item.class_title || '-')).join(', ')}`);
    }
    const remaining = Math.max(0, mainClasses.length + subClasses.length - 4);
    if (remaining > 0) parts.push(`외 ${remaining}개`);
    return parts.length ? parts.join('<br>') : '-';
  }

  function ensureOperatorsToolbarClean() {
    const section = document.getElementById('tabOperators');
    if (!section) return;

    const searchInput = section.querySelector('input[type="text"]');
    if (searchInput && !searchInput.dataset.cleanPlaceholder) {
      searchInput.placeholder = '닉네임, 이름, 이메일, 연락처 검색';
      searchInput.dataset.cleanPlaceholder = '1';
    }
  }

  function renderOperatorsTableClean(items) {
    const body = document.getElementById('operatorsTableBody');
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#aaa;">등록된 운영자 / 강사 / 회원이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = items.map((user) => {
      const roleMeta = operatorRoleMeta(user.role);
      const mainClasses = Array.isArray(user.main_classes) ? user.main_classes : [];
      const subClasses = Array.isArray(user.sub_classes) ? user.sub_classes : [];
      const avatar = user.profile_image_url || '/assets/default-avatar.svg';
      const normalizedRole = normalizeOperatorRole(user.role);
      const classSummary = operatorClassSummary(mainClasses, subClasses);

      return `
        <tr data-user-id="${escapeHtml(user.id)}">
          <td><input type="checkbox" data-operator-row-check="${escapeHtml(user.id)}"></td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${escapeHtml(avatar)}" alt="" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
              <div>
                <div style="font-weight:700;">${escapeHtml(user.username || '-')}</div>
                <div style="font-size:0.85rem; color:#6b7280;">${escapeHtml(user.name || '-')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(user.phone || '-')}</td>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${escapeHtml(formatBirthdate(user))}</td>
          <td>${escapeHtml(formatDate(user.signup_date || user.created_at))}</td>
          <td style="font-size:0.82rem; line-height:1.5;">${classSummary}</td>
          <td><span class="badge ${roleMeta.badge}">${escapeHtml(roleMeta.label)}</span></td>
          <td>
            <div style="display:flex; flex-direction:column; gap:0.4rem; min-width:180px;">
              <select class="admin-form-input" data-role-select="${escapeHtml(user.id)}" style="margin:0; padding:0.35rem 0.5rem;">
                <option value="user" ${normalizedRole === 'user' ? 'selected' : ''}>일반수강생</option>
                <option value="instructor" ${normalizedRole === 'instructor' ? 'selected' : ''}>강사</option>
                <option value="operator" ${normalizedRole === 'operator' ? 'selected' : ''}>운영관리자</option>
                <option value="admin" ${normalizedRole === 'admin' ? 'selected' : ''}>총괄운영관리자</option>
              </select>
              <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                <button class="btn-small outline" onclick="updateOperatorRoleBySelect('${escapeJsString(user.id)}')">적용</button>
                <button class="btn-small outline" onclick="updateOperatorRole('${escapeJsString(user.id)}', 'instructor')">강사</button>
                <button class="btn-small outline" onclick="updateOperatorRole('${escapeJsString(user.id)}', 'operator')">운영자</button>
                <button class="btn-small danger" onclick="removeOperator('${escapeJsString(user.id)}')">삭제</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  loadOperators = async function loadOperatorsClean(options = {}) {
    try {
      ensureOperatorsToolbarClean();

      const searchInput = document.querySelector('#tabOperators input[type="text"]');
      const search = String(options.search ?? searchInput?.value ?? '').trim();
      const role = String(options.role || '').trim();

      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (role && role !== 'all') params.set('role', role);

      const res = await BSQ.api(`/api/admin/operators${params.toString() ? `?${params.toString()}` : ''}`);
      const items = Array.isArray(res.data) ? res.data : [];
      operatorRows = items;
      operatorSummary = res.summary || operatorSummary;

      renderOperatorsTableClean(items);

      const countAllOps = document.getElementById('countAllOps');
      const countAdmins = document.getElementById('countAdmins');
      const countInsts = document.getElementById('countInsts');
      if (countAllOps) countAllOps.textContent = `전체 ${operatorSummary.total ?? items.length}명`;
      if (countAdmins) countAdmins.textContent = `총괄운영자 ${operatorSummary.superAdmin ?? 0}명`;
      if (countInsts) countInsts.textContent = `강사 ${operatorSummary.instructor ?? 0}명`;
    } catch (err) {
      console.error('[Operators] Error:', err);
      const body = document.getElementById('operatorsTableBody');
      if (body) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444;">운영자 목록을 불러오지 못했습니다. ${escapeHtml(err.message)}</td></tr>`;
      }
    }
  };

  updateOperatorRole = async function updateOperatorRoleClean(userId, newRole) {
    if (!userId) return;
    const label = operatorRoleMeta(newRole).label;
    if (!confirm(`해당 사용자의 권한을 "${label}"로 변경할까요?`)) return;

    try {
      const res = await BSQ.api('/api/admin/operators', {
        method: 'PUT',
        body: { user_id: userId, role: newRole },
      });

      if (!res?.success) throw new Error(res?.error || '권한 변경 실패');
      await loadOperators();
      alert('권한이 변경되었습니다.');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  window.loadAllUsers = loadAllUsers;
  window.loadOperators = loadOperators;
  window.updateOperatorRole = updateOperatorRole;
  window.updateOperatorRoleBySelect = async function (userId) {
    const select = document.querySelector(`[data-role-select="${CSS.escape(userId)}"]`);
    if (!select) return;
    await updateOperatorRole(userId, select.value);
  };
  window.removeOperator = async function (userId) {
    await updateOperatorRole(userId, 'user');
  };
})();
