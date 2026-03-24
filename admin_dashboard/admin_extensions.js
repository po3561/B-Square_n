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

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function paymentStatusBadge(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'paid' || value === 'completed' || value === 'success') return 'info';
    if (value === 'refunded' || value === 'partial_refunded') return 'danger';
    return 'warning';
  }

  function settlementStatusBadge(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'completed' || value === 'approved') return 'info';
    if (value === 'failed') return 'danger';
    return 'warning';
  }

  window.openPaymentDetail = async function (orderId) {
    if (!orderId) return;

    try {
      const res = await BSQ.api(`/api/admin/orders?order_id=${encodeURIComponent(orderId)}`);
      const order = res?.data || {};
      const refundLogs = Array.isArray(order.refund_logs) ? order.refund_logs : [];
      const financialRows = Array.isArray(order.financial_rows) ? order.financial_rows : [];
      const latestRefund = refundLogs[0] || null;
      const couponUsage = order.coupon_usage || null;
      const settlementBatch = order.settlement_batch || null;
      const settlementItem = order.settlement_item || null;

      const refundSummary = latestRefund
        ? `${latestRefund.refund_type || '-'} / ${fmt(latestRefund.refund_amount || 0)}원`
        : `${fmt(order.refund_amount || 0)}원`;

      document.getElementById('paymentDetailTitle').textContent = `${order.order_id || orderId} 결제 상세`;
      document.getElementById('paymentDetailBody').innerHTML = `
        <div class="detail-metric-grid">
          <article class="detail-metric-card"><span>결제금액</span><strong>${fmt(order.final_amount || order.amount || 0)}원</strong></article>
          <article class="detail-metric-card"><span>쿠폰 할인</span><strong>${fmt(order.discount_amount || 0)}원</strong></article>
          <article class="detail-metric-card"><span>환불금액</span><strong>${fmt(order.refund_amount || latestRefund?.refund_amount || 0)}원</strong></article>
          <article class="detail-metric-card"><span>정산상태</span><strong>${escapeHtml(order.settlement_status || '-')}</strong></article>
        </div>
        <div class="detail-content-box">
          <div style="display:grid; gap:0.75rem;">
            <div><strong>주문번호</strong><div>${escapeHtml(order.order_id || '-')}</div></div>
            <div><strong>회원</strong><div>${escapeHtml(order.user_name || order.user_id || '-')} ${order.user_email ? `(${escapeHtml(order.user_email)})` : ''}</div></div>
            <div><strong>클래스</strong><div>${escapeHtml(order.class_title || order.order_type || '-')}</div></div>
            <div><strong>결제수단</strong><div>${escapeHtml(order.pay_method || '-')}</div></div>
            <div><strong>결제상태</strong><div>${escapeHtml(order.status || '-')}</div></div>
            <div><strong>쿠폰</strong><div>${couponUsage ? `${escapeHtml(couponUsage.coupon_code || order.coupon_code || '-')}${couponUsage.discount_amount ? ` / -${fmt(couponUsage.discount_amount)}원` : ''}` : (order.coupon_code ? `${escapeHtml(order.coupon_code)} / -${fmt(order.discount_amount || 0)}원` : '-')}</div></div>
            <div><strong>환불 사유</strong><div>${escapeHtml(order.refund_reason_note || order.refund_reason || latestRefund?.reason_note || '-')}</div></div>
            <div><strong>환불 요약</strong><div>${escapeHtml(refundSummary)}</div></div>
            <div><strong>정산 배치</strong><div>${settlementBatch ? `${escapeHtml(settlementBatch.id || settlementBatch.batch_id || '-')}` : '-'}</div></div>
            <div><strong>정산 항목</strong><div>${settlementItem ? `${escapeHtml(settlementItem.id || settlementItem.item_id || '-')}` : '-'}</div></div>
            <div><strong>신청/결제 시각</strong><div>${escapeHtml((order.paid_at || order.created_at) ? new Date(order.paid_at || order.created_at).toLocaleString('ko-KR') : '-')}</div></div>
          </div>
        </div>
        <div class="detail-content-box" style="margin-top:1rem;">
          <strong>환불 이력</strong>
          <div style="display:grid; gap:0.5rem; margin-top:0.75rem;">
            ${refundLogs.length ? refundLogs.map((log) => `
              <div style="padding:0.75rem 0.9rem; border:1px solid var(--admin-border); border-radius:12px; background:rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                  <strong>${escapeHtml(log.refund_type || '-')}</strong>
                  <span>${fmt(log.refund_amount || 0)}원</span>
                </div>
                <div style="margin-top:0.35rem; color:#94a3b8;">${escapeHtml(log.reason_note || '-')}${log.reason_tags ? ` · ${escapeHtml(log.reason_tags)}` : ''}</div>
                <div style="margin-top:0.35rem; color:#94a3b8;">${escapeHtml(log.processed_at ? new Date(log.processed_at).toLocaleString('ko-KR') : log.created_at ? new Date(log.created_at).toLocaleString('ko-KR') : '-')}</div>
              </div>
            `).join('') : '<div style="color:#94a3b8;">등록된 환불 이력이 없습니다.</div>'}
          </div>
        </div>
        <div class="detail-content-box" style="margin-top:1rem;">
          <strong>정산/재무 기록</strong>
          <div style="display:grid; gap:0.5rem; margin-top:0.75rem;">
            ${financialRows.length ? financialRows.map((row) => `
              <div style="padding:0.75rem 0.9rem; border:1px solid var(--admin-border); border-radius:12px; background:rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                  <strong>${escapeHtml(row.type || '-')}</strong>
                  <span>${fmt(row.amount || 0)}원</span>
                </div>
                <div style="margin-top:0.35rem; color:#94a3b8;">${escapeHtml(row.description || '-')}</div>
                <div style="margin-top:0.35rem; color:#94a3b8;">${row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '-'}</div>
              </div>
            `).join('') : '<div style="color:#94a3b8;">재무 기록이 없습니다.</div>'}
          </div>
        </div>
      `;
      openModal('paymentDetailModal');
    } catch (err) {
      alert(err.message || '결제 상세를 불러오지 못했습니다.');
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
        body.innerHTML = '<tr><td colspan="11" style="text-align:center; color:#aaa;">검색 결과가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = items.map((o) => {
        const paymentAmount = Number(o.final_amount || o.amount || 0);
        const refundAmount = Number(o.refund_amount || o.latest_refund_amount || 0);
        const refundReason = o.refund_reason_note || o.refund_reason || o.latest_refund_reason_note || '';
        const settlementStatus = String(o.settlement_status || '-');
        const couponText = o.coupon_code ? `[${escapeHtml(o.coupon_code)}] -${fmt(o.discount_amount || 0)}원` : '-';
        const canRefund = ['paid', 'completed', 'success'].includes(String(o.status || '').toLowerCase()) && !['refunded', 'partial_refunded'].includes(String(o.status || '').toLowerCase());
        return `
        <tr>
          <td><strong>${escapeHtml(o.order_id || '-')}</strong></td>
          <td>${escapeHtml(o.class_title || o.order_type || '-')}</td>
          <td>${escapeHtml(o.user_name || '-')}</td>
          <td>${escapeHtml(o.paid_at ? new Date(o.paid_at).toLocaleString('ko-KR') : (o.created_at ? new Date(o.created_at).toLocaleString('ko-KR') : '-'))}</td>
          <td><span class="badge ${paymentStatusBadge(o.status)}">${escapeHtml(o.status || '-')}</span></td>
          <td>${escapeHtml(o.pay_method || '-')}</td>
          <td><strong>${fmt(paymentAmount)}원</strong></td>
          <td>${couponText}</td>
          <td>${refundAmount ? `<div><strong>${fmt(refundAmount)}원</strong></div><div style="font-size:0.78rem; color:#94a3b8;">${escapeHtml(refundReason || '-')}</div>` : '-'}</td>
          <td><span class="badge ${settlementStatusBadge(settlementStatus)}">${escapeHtml(settlementStatus)}</span></td>
          <td>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <button class="btn-small outline" type="button" onclick="openPaymentDetail('${escapeJsString(o.order_id)}')">상세</button>
              ${canRefund ? `<button class="btn-small danger" type="button" onclick="requestRefund('${escapeJsString(o.order_id)}')">환불</button>` : ''}
            </div>
          </td>
        </tr>
      `; }).join('');
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
      window.searchPayments();
    } catch (err) {
      alert(`환불 실패: ${err.message}`);
    }
  };

  const paymentSearchButton = document.getElementById('btnSearchPayments');
  if (paymentSearchButton) {
    paymentSearchButton.addEventListener('click', () => window.searchPayments());
  }

  document.getElementById('paymentSearchInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.searchPayments();
    }
  });

  document.getElementById('btnPaymentToday')?.addEventListener('click', () => {
    const now = new Date();
    const today = toDateInputValue(now);
    const from = document.getElementById('paymentFromDate');
    const to = document.getElementById('paymentToDate');
    if (from) from.value = today;
    if (to) to.value = today;
    window.searchPayments();
  });

  document.getElementById('btnPaymentThisMonth')?.addEventListener('click', () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fromInput = document.getElementById('paymentFromDate');
    const toInput = document.getElementById('paymentToDate');
    if (fromInput) fromInput.value = toDateInputValue(from);
    if (toInput) toInput.value = toDateInputValue(to);
    window.searchPayments();
  });

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

(function () {
  const $ = (id) => document.getElementById(id);
  const state = { reviews: [], coupons: [], couponImage: '' };
  const list = (res) => Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const date = (value) => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
  const datetime = (value) => value ? new Date(value).toLocaleString('ko-KR') : '-';
  const stars = (rating) => `${'★'.repeat(Math.max(0, Math.min(5, Number(rating || 0))))}${'☆'.repeat(Math.max(0, 5 - Number(rating || 0)))}`;
  const openModal = (id) => { const el = $(id); if (el) { el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); } };
  const closeModal = (id) => { const el = $(id); if (el) { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); } };

  function bindModalClose() {
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });
  }

  function reviewRows() {
    const keyword = String($('reviewSearchInput')?.value || '').trim().toLowerCase();
    const filter = $('reviewRatingFilter')?.value || '3';
    return state.reviews.filter((row) => {
      const ratingOk = filter === '1' ? row.rating === 1 : filter === '2' ? row.rating <= 2 : filter === '3_exact' ? row.rating === 3 : row.rating <= 3;
      if (!ratingOk) return false;
      if (!keyword) return true;
      return [row.class_name, row.instructor_name, row.nickname, row.name, row.phone, row.email, row.content].some((field) => String(field || '').toLowerCase().includes(keyword));
    });
  }

  function renderReviews() {
    const body = $('lowReviewsTableBody');
    if (!body) return;
    const rows = reviewRows();
    if ($('lowReviewMetricTotal')) $('lowReviewMetricTotal').textContent = `${rows.length.toLocaleString('ko-KR')}건`;
    if ($('lowReviewMetricCritical')) $('lowReviewMetricCritical').textContent = `${rows.filter((row) => row.rating === 1).length.toLocaleString('ko-KR')}건`;
    if ($('lowReviewMetricLatest')) $('lowReviewMetricLatest').textContent = rows[0]?.created_at ? date(rows[0].created_at) : '-';
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#94a3b8;">조건에 맞는 저평점 리뷰가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr>
        <td><span class="rating-chip">${esc(`${row.rating}점`)}</span></td>
        <td>${esc(row.class_name)}</td>
        <td>${esc(row.instructor_name)}</td>
        <td>${esc(row.nickname)}</td>
        <td>${esc(row.name)}</td>
        <td>${esc(row.phone)}</td>
        <td>${esc(row.email)}</td>
        <td><button class="btn-small outline" type="button" data-review-open="${esc(row.id)}">내용 보기</button></td>
        <td><button class="btn-small danger" type="button" data-review-delete="${esc(row.id)}">삭제</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('[data-review-open]').forEach((button) => button.addEventListener('click', () => {
      const row = state.reviews.find((item) => item.id === button.dataset.reviewOpen);
      if (!row) return;
      $('reviewDetailTitle').textContent = `${row.class_name} 리뷰`;
      $('reviewDetailBody').innerHTML = `
        <div class="detail-metric-grid">
          <article class="detail-metric-card"><span>별점</span><strong>${esc(stars(row.rating))} (${row.rating}점)</strong></article>
          <article class="detail-metric-card"><span>메인 강사</span><strong>${esc(row.instructor_name)}</strong></article>
          <article class="detail-metric-card"><span>작성자</span><strong>${esc(`${row.nickname} / ${row.name}`)}</strong></article>
          <article class="detail-metric-card"><span>연락처</span><strong>${esc(`${row.phone} / ${row.email}`)}</strong></article>
        </div>
        <div class="detail-content-box">${esc(row.content || '리뷰 내용이 없습니다.').replace(/\n/g, '<br>')}</div>
        <div style="margin-top:0.9rem; color:#64748b; font-size:0.84rem;">등록일 ${esc(datetime(row.created_at))}</div>`;
      openModal('reviewDetailModal');
    }));
    body.querySelectorAll('[data-review-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('이 리뷰를 삭제할까요?')) return;
      try {
        await window.BSQ.api(`/api/admin/reviews?id=${encodeURIComponent(button.dataset.reviewDelete)}`, { method: 'DELETE' });
        state.reviews = state.reviews.filter((item) => item.id !== button.dataset.reviewDelete);
        renderReviews();
      } catch (error) {
        alert(error.message || '리뷰 삭제 실패');
      }
    }));
  }

  async function loadReviews() {
    const body = $('lowReviewsTableBody');
    if (body) body.innerHTML = '<tr><td colspan="9" style="text-align:center;">리뷰를 불러오는 중입니다...</td></tr>';
    try {
      const res = await window.BSQ.api('/api/admin/reviews?rating_max=3&sort=rating_asc');
      state.reviews = list(res).map((row) => ({
        id: row.id || row.push_key || row.review_id || '',
        rating: Number(row.rating || 0),
        class_name: row.class_name || row.class_title || row.title || '-',
        instructor_name: row.instructor_name || row.main_instructor_name || row.creator_name || row.class_creator_name || '-',
        nickname: row.user_nickname || row.member_nickname || row.nickname || row.username || row.user_name || '-',
        name: row.user_name || row.member_name || row.name || '-',
        phone: row.user_phone || row.member_phone || row.phone || '-',
        email: row.user_email || row.member_email || row.email || '-',
        content: row.content || row.review || '',
        created_at: row.created_at || row.updated_at || '',
      })).filter((row) => row.rating <= 3).sort((a, b) => a.rating - b.rating || new Date(b.created_at || 0) - new Date(a.created_at || 0));
      renderReviews();
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444;">저평점 리뷰를 불러오지 못했습니다. ${esc(error.message)}</td></tr>`;
    }
  }

  function couponRows() {
    const keyword = String($('couponSearchInput')?.value || '').trim().toLowerCase();
    const status = $('couponStatusFilter')?.value || 'all';
    return state.coupons.filter((row) => {
      const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
      const active = row.is_active && !expired;
      const statusOk = status === 'active' ? active : status === 'inactive' ? !active && !expired : status === 'expired' ? expired : true;
      if (!statusOk) return false;
      if (!keyword) return true;
      return [row.code, row.name, row.description].some((field) => String(field || '').toLowerCase().includes(keyword));
    });
  }

  function renderCouponPreview() {
    const image = state.couponImage || $('eventCouponImageUrl')?.value.trim() || '';
    if ($('eventCouponImagePreview')) {
      $('eventCouponImagePreview').textContent = image ? '' : '이미지 미리보기';
      $('eventCouponImagePreview').style.backgroundImage = image ? `url('${image.replace(/'/g, "\\'")}')` : '';
    }
    if ($('eventCouponPreviewName')) $('eventCouponPreviewName').textContent = $('eventCouponName')?.value.trim() || '쿠폰명';
    if ($('eventCouponPreviewDesc')) $('eventCouponPreviewDesc').textContent = $('eventCouponDescription')?.value.trim() || '쿠폰 설명이 여기에 표시됩니다.';
  }

  function resetCouponForm() {
    state.couponImage = '';
    ['eventCouponCode', 'eventCouponName', 'eventCouponAmount', 'eventCouponMinOrder', 'eventCouponMaxIssue', 'eventCouponStartsAt', 'eventCouponExpiresAt', 'eventCouponDescription', 'eventCouponImageUrl'].forEach((id) => { if ($(id)) $(id).value = ''; });
    if ($('eventCouponType')) $('eventCouponType').value = 'percent';
    if ($('eventCouponImageFile')) $('eventCouponImageFile').value = '';
    renderCouponPreview();
  }

  function renderCoupons() {
    const body = $('eventCouponsTableBody');
    if (!body) return;
    const rows = couponRows();
    if ($('couponMetricTotal')) $('couponMetricTotal').textContent = `${state.coupons.length.toLocaleString('ko-KR')}개`;
    if ($('couponMetricActive')) $('couponMetricActive').textContent = `${state.coupons.filter((row) => row.is_active && !(row.expires_at && new Date(row.expires_at).getTime() < Date.now())).length.toLocaleString('ko-KR')}개`;
    if ($('couponMetricUsed')) $('couponMetricUsed').textContent = `${state.coupons.reduce((sum, row) => sum + Number(row.actual_used ?? row.used_count ?? 0), 0).toLocaleString('ko-KR')}회`;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">등록된 이벤트 쿠폰이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => {
      const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
      const active = row.is_active && !expired;
      const claimedCount = Number(row.claimed_count ?? row.issued_count ?? 0);
      const usedCount = Number(row.actual_used ?? row.used_count ?? 0);
      return `
        <tr>
          <td><div class="coupon-row-card"><div class="coupon-row-thumb" style="${row.image_url ? `background-image:url('${esc(row.image_url)}')` : ''}"></div><div><p class="coupon-row-title">${esc(row.name)}</p><p class="coupon-row-meta">${esc(row.code)}${row.description ? ` · ${esc(row.description)}` : ''}</p></div></div></td>
          <td>${row.type === 'percent' ? `${row.amount}%` : money(row.amount)}</td>
          <td>${esc(row.scope_label || '전체 클래스')}</td>
          <td>${claimedCount.toLocaleString('ko-KR')} / ${usedCount.toLocaleString('ko-KR')}</td>
          <td>${esc(`${date(row.starts_at)} ~ ${date(row.expires_at)}`)}</td>
          <td><span class="badge ${active ? 'info' : 'danger'}">${active ? '활성' : expired ? '만료' : '비활성'}</span></td>
          <td><div style="display:flex; gap:0.45rem; flex-wrap:wrap;"><button class="btn-small outline" type="button" data-coupon-open="${esc(row.code)}">상세</button><button class="btn-small danger" type="button" data-coupon-delete="${esc(row.code)}">삭제</button></div></td>
        </tr>`;
    }).join('');
    body.querySelectorAll('[data-coupon-open]').forEach((button) => button.addEventListener('click', () => {
      const row = state.coupons.find((item) => item.code === button.dataset.couponOpen);
      if (!row) return;
      $('couponDetailTitle').textContent = `${row.name} 상세`;
      $('couponDetailBody').innerHTML = `
        <div class="detail-metric-grid">
          <article class="detail-metric-card"><span>쿠폰 코드</span><strong>${esc(row.code)}</strong></article>
          <article class="detail-metric-card"><span>혜택</span><strong>${row.type === 'percent' ? `${row.amount}%` : money(row.amount)}</strong></article>
          <article class="detail-metric-card"><span>발행 수량</span><strong>${Number(row.claimed_count ?? row.issued_count ?? 0).toLocaleString('ko-KR')}개</strong></article>
          <article class="detail-metric-card"><span>소모 수량</span><strong>${Number(row.actual_used ?? row.used_count ?? 0).toLocaleString('ko-KR')}개</strong></article>
        </div>
        <div class="detail-content-box"><div style="display:grid; gap:0.75rem;"><div><strong>적용 범위</strong><div>${esc(row.scope_label || '전체 클래스')}</div></div><div><strong>최소 주문 금액</strong><div>${money(row.min_order_amount)}</div></div><div><strong>유효 기간</strong><div>${esc(`${date(row.starts_at)} ~ ${date(row.expires_at)}`)}</div></div><div><strong>설명</strong><div>${esc(row.description || '-').replace(/\n/g, '<br>')}</div></div></div></div>`;
      openModal('couponDetailModal');
    }));
    body.querySelectorAll('[data-coupon-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm(`${button.dataset.couponDelete} 쿠폰을 삭제할까요?`)) return;
      try {
        await window.BSQ.api(`/api/admin/coupons?code=${encodeURIComponent(button.dataset.couponDelete)}`, { method: 'DELETE' });
        state.coupons = state.coupons.filter((item) => item.code !== button.dataset.couponDelete);
        renderCoupons();
      } catch (error) {
        alert(error.message || '쿠폰 삭제 실패');
      }
    }));
  }

  async function loadCoupons() {
    const body = $('eventCouponsTableBody');
    if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center;">쿠폰을 불러오는 중입니다...</td></tr>';
    try {
      const res = await window.BSQ.api('/api/admin/coupons');
      state.coupons = list(res).map((row) => ({
        code: String(row.code || '').toUpperCase(),
        name: row.name || row.title || '-',
        description: row.description || '',
        type: row.type || 'percent',
        amount: Number(row.amount || row.value || 0),
        min_order_amount: Number(row.min_order_amount || 0),
        max_issue_count: Number(row.max_issue_count || 0),
        claimed_count: Number(row.claimed_count ?? row.issued_count ?? 0),
        actual_used: Number(row.actual_used ?? row.used_count ?? 0),
        starts_at: row.starts_at || '',
        expires_at: row.expires_at || '',
        is_active: row.is_active === 0 ? false : true,
        image_url: row.image_url || row.image || row.coupon_image_url || '',
        scope_label: row.scope_label || row.scope || '전체 클래스',
      }));
      renderCoupons();
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444;">쿠폰 목록을 불러오지 못했습니다. ${esc(error.message)}</td></tr>`;
    }
  }

  function init() {
    bindModalClose();
    $('btnReloadLowReviews')?.addEventListener('click', loadReviews);
    $('reviewSearchInput')?.addEventListener('input', renderReviews);
    $('reviewRatingFilter')?.addEventListener('change', renderReviews);
    $('btnReloadEventCoupons')?.addEventListener('click', loadCoupons);
    $('couponSearchInput')?.addEventListener('input', renderCoupons);
    $('couponStatusFilter')?.addEventListener('change', renderCoupons);
    $('btnOpenEventCouponModal')?.addEventListener('click', () => { resetCouponForm(); openModal('eventCouponModal'); });
    $('btnSaveEventCoupon')?.addEventListener('click', async () => {
      const payload = {
        code: $('eventCouponCode')?.value.trim().toUpperCase() || undefined,
        name: $('eventCouponName')?.value.trim() || '',
        type: $('eventCouponType')?.value || 'percent',
        amount: Number($('eventCouponAmount')?.value || 0),
        min_order_amount: Number($('eventCouponMinOrder')?.value || 0),
        max_issue_count: Number($('eventCouponMaxIssue')?.value || 0),
        starts_at: $('eventCouponStartsAt')?.value || null,
        expires_at: $('eventCouponExpiresAt')?.value || null,
        description: $('eventCouponDescription')?.value.trim() || '',
        image_url: state.couponImage || $('eventCouponImageUrl')?.value.trim() || '',
        scope: 'global',
      };
      if (!payload.name) return alert('쿠폰명을 입력해 주세요.');
      try {
        const res = await window.BSQ.api('/api/admin/coupons', { method: 'POST', body: payload });
        if (!res?.success) throw new Error(res?.error || '쿠폰 저장 실패');
        closeModal('eventCouponModal');
        loadCoupons();
      } catch (error) {
        alert(error.message || '쿠폰 저장 실패');
      }
    });
    ['eventCouponName', 'eventCouponDescription', 'eventCouponImageUrl'].forEach((id) => $(id)?.addEventListener('input', renderCouponPreview));
    $('eventCouponImageFile')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) { state.couponImage = ''; renderCouponPreview(); return; }
      const reader = new FileReader();
      reader.onload = () => { state.couponImage = String(reader.result || ''); renderCouponPreview(); };
      reader.readAsDataURL(file);
    });
    window.addEventListener('adminTabChanged', (event) => {
      if (event.detail?.tabId === 'tabReviews') loadReviews();
      if (event.detail?.tabId === 'tabCoupons') loadCoupons();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

(function () {
  const $ = (id) => document.getElementById(id);
  const state = { dashboard: { classes: [], instructors: [], year: null, month: null, periodLabel: '-' }, history: [], taxRows: [], period: 'month', historyPeriod: 'month', detailItem: null };
  const list = (res) => Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const date = (value) => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
  const openModal = (id) => { const el = $(id); if (el) { el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); } };

  function params(prefix) {
    const now = new Date();
    const year = Number($(`${prefix}YearInput`)?.value || now.getFullYear());
    const month = Number($(`${prefix}MonthInput`)?.value || (now.getMonth() + 1));
    return { year, month };
  }

  function detail(item, title) {
    state.detailItem = item;
    const avatar = item?.profile_image_url || '/assets/default-avatar.svg';
    const displayName = item?.instructor_name || item?.class_name || '-';
    const displayEmail = item?.instructor_email || '-';
    const displayPhone = item?.instructor_phone || '-';
    const bankName = item?.bank_name || item?.account_bank_name || '-';
    const bankAccount = item?.bank_account || item?.account_number || '-';
    const bankHolder = item?.bank_holder || item?.account_holder || '-';
    const grossRevenue = Number(item?.total_revenue ?? item?.gross_revenue ?? item?.revenue ?? item?.total_amount ?? item?.amount ?? 0);
    const refundAmount = Number(item?.refund_amount ?? 0);
    const settlementBase = Math.max(0, grossRevenue - refundAmount);
    const totalFee = Number(item?.total_fee ?? item?.total_fee_amount ?? item?.fee_amount ?? 0);
    const finalAmount = Number(item?.final_amount ?? item?.settlement_amount ?? 0);
    const statusText = item?.status || item?.approval_result || '-';
    const scopeLabel = item?.class_name || item?.class_title || `${item?.instructor_name || '강사'} 정산`;
    $('settlementDetailTitle').textContent = title;
    $('settlementDetailBody').innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; margin-bottom:1rem;">
        <div style="padding:1rem; border:1px solid rgba(148,163,184,0.24); border-radius:16px; background:rgba(15,23,42,0.3); display:flex; gap:0.9rem; align-items:center;">
          <img src="${esc(avatar)}" alt="" style="width:72px; height:72px; border-radius:18px; object-fit:cover; flex:0 0 auto; background:#0f172a;">
          <div style="min-width:0;">
            <div style="font-size:1.05rem; font-weight:700; color:#f8fafc;">${esc(displayName)}</div>
            <div style="margin-top:0.3rem; color:#94a3b8; font-size:0.88rem;">${esc(displayEmail)}</div>
            <div style="margin-top:0.2rem; color:#94a3b8; font-size:0.88rem;">${esc(displayPhone)}</div>
            <div style="margin-top:0.65rem; color:#cbd5e1; font-size:0.78rem;">${esc(scopeLabel)}</div>
          </div>
        </div>
        <div style="padding:1rem; border:1px solid rgba(148,163,184,0.24); border-radius:16px; background:rgba(15,23,42,0.3);">
          <div style="font-size:0.85rem; color:#94a3b8; font-weight:600; margin-bottom:0.65rem;">정산 계좌 정보</div>
          <div style="display:grid; gap:0.45rem; font-size:0.9rem; color:#e2e8f0;">
            <div><strong style="color:#f8fafc;">은행명</strong> ${esc(bankName)}</div>
            <div><strong style="color:#f8fafc;">계좌번호</strong> ${esc(bankAccount)}</div>
            <div><strong style="color:#f8fafc;">예금주</strong> ${esc(bankHolder)}</div>
            <div><strong style="color:#f8fafc;">지급 예정일</strong> ${esc(item?.payout_date || '매월 15일')}</div>
          </div>
        </div>
      </div>
      <div class="detail-metric-grid">
        <article class="detail-metric-card"><span>정산 대상 금액</span><strong>${money(settlementBase)}</strong></article>
        <article class="detail-metric-card"><span>수수료 합계</span><strong>${money(totalFee)}</strong></article>
        <article class="detail-metric-card"><span>최종 정산금액</span><strong>${money(finalAmount)}</strong></article>
        <article class="detail-metric-card"><span>정산 상태</span><strong>${esc(statusText)}</strong></article>
      </div>
      <div class="detail-content-box">
        <div style="display:grid; gap:0.75rem;">
          <div><strong>관리 ID</strong><div>${esc(item?.admin_code || item?.approval_code || item?.id || '-')}</div></div>
          <div><strong>정산 건수</strong><div>${esc(String(item?.settlement_count || item?.class_count || item?.item_count || 0))}</div></div>
          <div><strong>총 매출</strong><div>${money(grossRevenue)}</div></div>
          <div><strong>환불금액</strong><div>${money(refundAmount)}</div></div>
          <div><strong>클래스 / 기간</strong><div>${esc(item?.period_start || item?.class_name || '-')}${item?.period_end ? ` ~ ${esc(item.period_end)}` : ''}</div></div>
          <div><strong>승인 결과</strong><div>${esc(item?.approval_result || '-')}</div></div>
        </div>
      </div>`;
    if ($('btnDownloadSettlementExcel')) {
      $('btnDownloadSettlementExcel').disabled = !item?.batch_id && !item?.id;
      $('btnDownloadSettlementExcel').dataset.batchId = item?.batch_id || item?.id || '';
    }
    openModal('settlementDetailModal');
  }

  async function downloadSettlementExcel() {
    const item = state.detailItem;
    if (!item) {
      alert('엑셀로 내보낼 정산 상세가 없습니다.');
      return;
    }

    const batchId = item.batch_id || item.id;
    if (!batchId) {
      alert('정산 배치 ID가 없어 엑셀을 만들 수 없습니다.');
      return;
    }

    const params = new URLSearchParams({
      type: 'export',
      batch_id: batchId,
    });
    if (item.batch_item_id) {
      params.set('batch_item_id', item.batch_item_id);
    } else if (item.instructor_id) {
      params.set('instructor_id', item.instructor_id);
    }

    try {
      const response = await fetch(`/api/admin/settlements?${params.toString()}`, { credentials: 'same-origin' });
      if (!response.ok) {
        const fallback = await response.text().catch(() => '');
        throw new Error(fallback || '엑셀 다운로드 실패');
      }
      const blob = await response.blob();
      const year = item.year || state.dashboard.year || state.history.find((row) => row.id === item.id)?.year || new Date().getFullYear();
      const month = item.month || state.dashboard.month || state.history.find((row) => row.id === item.id)?.month || (new Date().getMonth() + 1);
      const fileName = `settlement_${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}_${String(item.instructor_name || item.class_name || 'detail').replace(/[^a-zA-Z0-9가-힣_-]+/g, '_')}.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      alert(error.message || '엑셀 다운로드 실패');
    }
  }

  function renderDashboard() {
    const classes = state.dashboard.classes || [];
    const instructors = state.dashboard.instructors || [];
    $('settlementMetricPeriod').textContent = state.dashboard.periodLabel || '-';
    $('settlementMetricClassTotal').textContent = money(classes.reduce((sum, row) => sum + Number(row.final_amount ?? row.settlement_amount ?? 0), 0));
    $('settlementMetricInstructorTotal').textContent = money(instructors.reduce((sum, row) => sum + Number(row.final_amount ?? row.settlement_amount ?? 0), 0));

    const classBody = $('settlementClassTableBody');
    const instructorBody = $('settlementInstructorTableBody');
    if (classBody) {
      classBody.innerHTML = classes.length ? classes.map((row, index) => `
        <tr>
          <td>${esc(row.class_name || row.class_title || `클래스 ${index + 1}`)}</td>
          <td>${esc(row.instructor_name || '-')}</td>
          <td>${money(row.total_revenue || row.revenue || 0)}</td>
          <td>${money(row.total_fee || row.total_fee_amount || row.fee_amount || 0)}</td>
          <td><strong style="color:#0f766e;">${money(row.final_amount ?? row.settlement_amount ?? 0)}</strong></td>
          <td><button class="btn-small outline" type="button" data-settle-class="${esc(String(index))}">상세</button></td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">집계된 클래스 정산 데이터가 없습니다.</td></tr>';
      classBody.querySelectorAll('[data-settle-class]').forEach((button) => button.addEventListener('click', () => detail(classes[Number(button.dataset.settleClass)], classes[Number(button.dataset.settleClass)]?.class_name || '클래스 정산 상세')));
    }
    if (instructorBody) {
      instructorBody.innerHTML = instructors.length ? instructors.map((row, index) => `
        <tr>
          <td>${esc(row.instructor_name || row.name || '-')}</td>
          <td>${Number(row.class_count || row.classes_count || 0).toLocaleString('ko-KR')}개</td>
          <td>${money(row.total_revenue || row.revenue || 0)}</td>
          <td>${money(row.total_fee || row.total_fee_amount || row.fee_amount || 0)}</td>
          <td><strong style="color:#0f766e;">${money(row.final_amount ?? row.settlement_amount ?? 0)}</strong></td>
          <td><button class="btn-small outline" type="button" data-settle-inst="${esc(String(index))}">상세</button></td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">집계된 강사 정산 데이터가 없습니다.</td></tr>';
      instructorBody.querySelectorAll('[data-settle-inst]').forEach((button) => button.addEventListener('click', () => detail(instructors[Number(button.dataset.settleInst)], instructors[Number(button.dataset.settleInst)]?.instructor_name || '강사 정산 상세')));
    }
  }

  async function loadSettlementDashboard() {
    try {
      const { year, month } = params('settlement');
      const [infoRes, dashRes] = await Promise.all([
        window.BSQ.api('/api/admin/settlements?type=info'),
        window.BSQ.api(`/api/admin/settlements?type=dashboard&period=${encodeURIComponent(state.period)}&year=${year}&month=${month}`).catch(() => ({ data: {} })),
      ]);
      const info = infoRes?.data || {};
      const data = dashRes?.data || {};
      if ($('settlementCompanyName')) $('settlementCompanyName').value = info.company_name || '';
      if ($('settlementCeoName')) $('settlementCeoName').value = info.ceo_name || '';
      if ($('settlementBizNumber')) $('settlementBizNumber').value = info.biz_num || '';
      if ($('settlementBizType')) $('settlementBizType').value = info.biz_type || '';
      if ($('settlementAddress')) $('settlementAddress').value = info.address || '';
      if ($('settlementManagerEmail')) $('settlementManagerEmail').value = info.manager_email || '';
      if ($('settlementBankName')) $('settlementBankName').value = info.bank_name || '';
      if ($('settlementBankAccount')) $('settlementBankAccount').value = info.bank_account || '';
      if ($('settlementBankHolder')) $('settlementBankHolder').value = info.bank_holder || '';
      if ($('settlementRatePg')) $('settlementRatePg').value = Number((data.fee_rates || info.fee_rates || {}).pg_rate ?? 6);
      if ($('settlementRateTax')) $('settlementRateTax').value = Number((data.fee_rates || info.fee_rates || {}).tax_rate ?? 3.3);
      if ($('settlementRatePlatform')) $('settlementRatePlatform').value = Number((data.fee_rates || info.fee_rates || {}).platform_rate ?? 1.7);
      state.dashboard = {
        classes: data.classes || data.class_rows || [],
        instructors: data.instructors || data.instructor_rows || [],
        periodLabel: data.period_label || `${year}년 ${state.period === 'year' ? '연간' : `${month}월`}`,
        year,
        month,
        period: state.period,
      };
      renderDashboard();
    } catch (error) {
      if ($('settlementClassTableBody')) $('settlementClassTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">정산 데이터를 불러오지 못했습니다. ${esc(error.message)}</td></tr>`;
      if ($('settlementInstructorTableBody')) $('settlementInstructorTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">정산 데이터를 불러오지 못했습니다. ${esc(error.message)}</td></tr>`;
    }
  }

  function renderHistory() {
    const body = $('settlementHistoryTableBody');
    if (!body) return;
    const status = $('settlementHistoryStatusFilter')?.value || 'all';
    const rows = state.history.filter((row) => status === 'all' || row.status === status);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#94a3b8;">조건에 맞는 정산 내역이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => `
      <tr>
        <td><button class="btn-small outline" type="button" data-history-open="${esc(String(index))}">${esc(row.instructor_name)}</button></td>
        <td>${money(row.amount)}</td>
        <td><span class="badge ${row.status === 'approved' || row.status === 'completed' ? 'info' : row.status === 'failed' ? 'danger' : 'warning'}">${esc(row.status)}</span></td>
        <td>${Number(row.settlement_count || 0).toLocaleString('ko-KR')}건</td>
        <td>${money(row.total_amount)}</td>
        <td>${money(row.total_fee)}</td>
        <td><strong style="color:#0f766e;">${money(row.final_amount)}</strong></td>
        <td>${row.status === 'pending' ? `<button class="btn-small outline" type="button" data-history-approve="${esc(row.id)}">최종 승인</button>` : '-'}</td>
        <td>${esc(row.approval_result || '-')}</td>
        <td>${esc(row.admin_code || row.id || '-')}</td>
      </tr>`).join('');
    body.querySelectorAll('[data-history-open]').forEach((button) => button.addEventListener('click', () => detail(rows[Number(button.dataset.historyOpen)], rows[Number(button.dataset.historyOpen)]?.instructor_name || '정산 상세')));
    body.querySelectorAll('[data-history-approve]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('해당 정산 건을 최종 승인할까요?')) return;
      try {
        const res = await window.BSQ.api('/api/admin/settlements', { method: 'PUT', body: { id: button.dataset.historyApprove, status: 'approved', action: 'approve' } });
        if (!res?.success) throw new Error(res?.error || '정산 승인 실패');
        loadSettlementHistory();
      } catch (error) {
        alert(error.message || '정산 승인 실패');
      }
    }));
  }

  async function loadSettlementHistory() {
    const body = $('settlementHistoryTableBody');
    if (body) body.innerHTML = '<tr><td colspan="10" style="text-align:center;">정산 내역을 불러오는 중입니다...</td></tr>';
    try {
      const { year, month } = params('settlementHistory');
      let res;
      try {
        res = await window.BSQ.api(`/api/admin/settlements?type=history&period=${encodeURIComponent(state.historyPeriod)}&year=${year}&month=${month}`);
      } catch (error) {
        res = await window.BSQ.api('/api/admin/settlements');
      }
      state.history = list(res).map((row) => ({
        id: row.id || row.batch_id || row.settlement_id || '',
        instructor_id: row.instructor_id || '',
        instructor_name: row.instructor_name || row.name || '-',
        amount: Number(row.amount || row.total_revenue || row.total_amount || 0),
        status: row.status || 'pending',
        settlement_count: Number(row.settlement_count || row.class_count || row.item_count || 0),
        total_amount: Number(row.total_amount || row.total_revenue || 0),
        total_fee: Number(row.total_fee || row.total_fee_amount || row.fee_amount || 0),
        final_amount: Number(row.final_amount ?? row.settlement_amount ?? 0),
        approval_result: row.approval_result || row.result || '-',
        admin_code: row.admin_code || row.approval_code || row.id || '-',
        batch_id: row.batch_id || row.id || '',
        year: Number(row.year || 0) || null,
        month: Number(row.month || 0) || null,
        profile_image_url: row.profile_image_url || '',
        instructor_email: row.instructor_email || '',
        instructor_phone: row.instructor_phone || '',
        bank_name: row.bank_name || '',
        bank_account: row.bank_account || '',
        bank_holder: row.bank_holder || '',
      }));
      renderHistory();
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#ef4444;">정산 내역을 불러오지 못했습니다. ${esc(error.message)}</td></tr>`;
    }
  }

  async function saveSettlement() {
    try {
      const payload = {
        type: 'info',
        company_name: $('settlementCompanyName')?.value.trim() || '',
        ceo_name: $('settlementCeoName')?.value.trim() || '',
        biz_num: $('settlementBizNumber')?.value.trim() || '',
        biz_type: $('settlementBizType')?.value.trim() || '',
        address: $('settlementAddress')?.value.trim() || '',
        manager_email: $('settlementManagerEmail')?.value.trim() || '',
        bank_name: $('settlementBankName')?.value.trim() || '',
        bank_account: $('settlementBankAccount')?.value.trim() || '',
        bank_holder: $('settlementBankHolder')?.value.trim() || '',
        fee_rates: {
          pg_rate: Number($('settlementRatePg')?.value || 6),
          tax_rate: Number($('settlementRateTax')?.value || 3.3),
          platform_rate: Number($('settlementRatePlatform')?.value || 1.7),
        },
      };
      const res = await window.BSQ.api('/api/admin/settlements', { method: 'POST', body: payload });
      if (!res?.success) throw new Error(res?.error || '정산 설정 저장 실패');
      loadSettlementDashboard();
    } catch (error) {
      alert(error.message || '정산 설정 저장 실패');
    }
  }

  function renderTax() {
    const body = $('taxReportTableBody');
    if (!body) return;
    const rows = state.taxRows;
    $('taxMetricRevenue').textContent = money(rows.reduce((sum, row) => sum + row.paid_amount, 0));
    $('taxMetricRefund').textContent = money(rows.reduce((sum, row) => sum + row.refunded_amount, 0));
    $('taxMetricVat').textContent = money(rows.reduce((sum, row) => sum + row.vat_amount, 0));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">신고 기간에 해당하는 주문이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(row.order_id)}</td>
        <td>${esc(row.user_name)}</td>
        <td>${esc(row.class_title)}</td>
        <td>${esc(date(row.paid_at))}</td>
        <td>${money(row.paid_amount)}</td>
        <td>${money(row.refunded_amount)}</td>
        <td>${money(row.supply_amount)}</td>
        <td>${money(row.vat_amount)}</td>
      </tr>`).join('');
  }

  async function loadTax() {
    const body = $('taxReportTableBody');
    if (body) body.innerHTML = '<tr><td colspan="8" style="text-align:center;">세금 신고 데이터를 계산하는 중입니다...</td></tr>';
    try {
      const res = await window.BSQ.api('/api/admin/orders?limit=500');
      const start = $('taxStartMonth')?.value ? new Date(`${$('taxStartMonth').value}-01T00:00:00`) : null;
      const end = $('taxEndMonth')?.value ? new Date(new Date(`${$('taxEndMonth').value}-01T00:00:00`).getFullYear(), new Date(`${$('taxEndMonth').value}-01T00:00:00`).getMonth() + 1, 0, 23, 59, 59, 999) : null;
      state.taxRows = list(res).filter((row) => {
        const paidAt = new Date(row.paid_at || row.created_at || 0);
        if (Number.isNaN(paidAt.getTime())) return false;
        if (start && paidAt < start) return false;
        if (end && paidAt > end) return false;
        return true;
      }).map((row) => {
        const paid = Number(row.final_amount ?? row.amount ?? 0);
        const refunded = Number(row.refund_amount || (String(row.status || '').includes('refund') ? paid : 0));
        const taxable = Math.max(0, paid - refunded);
        const supply = Math.round(taxable / 1.1);
        return {
          order_id: row.order_id || '-',
          user_name: row.user_name || row.user_id || '-',
          class_title: row.class_title || row.order_type || '-',
          paid_at: row.paid_at || row.created_at || '',
          paid_amount: paid,
          refunded_amount: refunded,
          supply_amount: supply,
          vat_amount: taxable - supply,
        };
      });
      renderTax();
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444;">부가세 자료를 계산하지 못했습니다. ${esc(error.message)}</td></tr>`;
    }
  }

  function downloadTax() {
    if (!state.taxRows.length) return alert('다운로드할 세금 데이터가 없습니다.');
    const rows = [['주문번호', '회원', '클래스', '결제일', '결제금액', '환불금액', '공급가액', '부가세'], ...state.taxRows.map((row) => [row.order_id, row.user_name, row.class_title, date(row.paid_at), row.paid_amount, row.refunded_amount, row.supply_amount, row.vat_amount])];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tax_report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function restoreScriptDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem('bsq_admin_script_draft') || '{}');
      if ($('scriptGa4') && draft.ga4) $('scriptGa4').value = draft.ga4;
      if ($('scriptPixel') && draft.pixel) $('scriptPixel').value = draft.pixel;
      if ($('scriptCustomHead') && draft.head) $('scriptCustomHead').value = draft.head;
    } catch (error) {
      console.warn('[Admin scripts] restore failed:', error);
    }
  }

  function saveScriptDraft() {
    try {
      localStorage.setItem('bsq_admin_script_draft', JSON.stringify({
        ga4: $('scriptGa4')?.value.trim() || '',
        pixel: $('scriptPixel')?.value.trim() || '',
        head: $('scriptCustomHead')?.value || '',
      }));
      alert('검색 및 코드 설정은 현재 브라우저 임시 저장으로 보관했습니다. 서버 저장 스키마가 연결되면 즉시 전환할 수 있습니다.');
    } catch (error) {
      alert(error.message || '임시 저장 실패');
    }
  }

  function init() {
    const now = new Date();
    if ($('settlementYearInput') && !$('settlementYearInput').value) $('settlementYearInput').value = now.getFullYear();
    if ($('settlementMonthInput') && !$('settlementMonthInput').value) $('settlementMonthInput').value = now.getMonth() + 1;
    if ($('settlementHistoryYearInput') && !$('settlementHistoryYearInput').value) $('settlementHistoryYearInput').value = now.getFullYear();
    if ($('settlementHistoryMonthInput') && !$('settlementHistoryMonthInput').value) $('settlementHistoryMonthInput').value = now.getMonth() + 1;
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if ($('taxStartMonth') && !$('taxStartMonth').value) $('taxStartMonth').value = monthStr;
    if ($('taxEndMonth') && !$('taxEndMonth').value) $('taxEndMonth').value = monthStr;
    restoreScriptDraft();

    $('btnReloadSettlementDashboard')?.addEventListener('click', loadSettlementDashboard);
    $('btnSaveSettlementDashboard')?.addEventListener('click', saveSettlement);
    $('btnGenerateSettlementBatch')?.addEventListener('click', async () => {
      try {
        const { year, month } = params('settlement');
        const res = await window.BSQ.api('/api/admin/settlements', {
          method: 'POST',
          body: {
            action: 'generate_batch',
            year,
            month,
          },
        });
        if (!res?.success) throw new Error(res?.error || '정산 배치 생성 실패');
        alert('정산 배치가 생성되었습니다.');
        await loadSettlementDashboard();
        await loadSettlementHistory();
      } catch (error) {
        alert(error.message || '정산 배치 생성 실패');
      }
    });
    $('btnReloadSettlementHistory')?.addEventListener('click', loadSettlementHistory);
    $('btnDownloadSettlementExcel')?.addEventListener('click', downloadSettlementExcel);
    $('settlementYearInput')?.addEventListener('change', loadSettlementDashboard);
    $('settlementMonthInput')?.addEventListener('change', loadSettlementDashboard);
    $('settlementHistoryYearInput')?.addEventListener('change', loadSettlementHistory);
    $('settlementHistoryMonthInput')?.addEventListener('change', loadSettlementHistory);
    $('settlementHistoryStatusFilter')?.addEventListener('change', renderHistory);
    $('btnRefreshTaxReport')?.addEventListener('click', loadTax);
    $('btnDownloadTaxReport')?.addEventListener('click', downloadTax);
    $('taxStartMonth')?.addEventListener('change', loadTax);
    $('taxEndMonth')?.addEventListener('change', loadTax);
    $('btnSaveScripts')?.addEventListener('click', saveScriptDraft);
    document.querySelectorAll('#settlementPeriodSwitch .period-chip').forEach((button) => button.addEventListener('click', () => {
      state.period = button.dataset.period || 'month';
      document.querySelectorAll('#settlementPeriodSwitch .period-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
      if ($('settlementMonthInput')) $('settlementMonthInput').disabled = state.period === 'year';
      loadSettlementDashboard();
    }));
    document.querySelectorAll('#settlementHistoryPeriodSwitch .period-chip').forEach((button) => button.addEventListener('click', () => {
      state.historyPeriod = button.dataset.period || 'month';
      document.querySelectorAll('#settlementHistoryPeriodSwitch .period-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
      if ($('settlementHistoryMonthInput')) $('settlementHistoryMonthInput').disabled = state.historyPeriod === 'year';
      loadSettlementHistory();
    }));
    window.addEventListener('adminTabChanged', (event) => {
      if (event.detail?.tabId === 'tabSettlementInfo') loadSettlementDashboard();
      if (event.detail?.tabId === 'tabSettlementHistory') loadSettlementHistory();
      if (event.detail?.tabId === 'tabTax') loadTax();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
