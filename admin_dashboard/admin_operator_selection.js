// admin_operator_selection.js
(function () {
  'use strict';

  const state = {
    selectedIds: new Set(),
    bound: false,
  };

  function getOperatorsSection() {
    return document.getElementById('tabOperators');
  }

  function getTableBody() {
    return document.getElementById('operatorsTableBody');
  }

  function getRows() {
    return Array.from(document.querySelectorAll('#operatorsTableBody tr[data-user-id]'));
  }

  function getButtons() {
    const section = getOperatorsSection();
    if (!section) return [];
    return Array.from(section.querySelectorAll('.card-header .btn-primary'));
  }

  function getSelectedIds() {
    return Array.from(state.selectedIds);
  }

  function clearSelection() {
    state.selectedIds.clear();
    syncSelectionUI();
  }

  function syncSelectionUI() {
    const body = getTableBody();
    if (!body) return;

    const canAssignAdmin = currentRoleRank() >= 3;

    getRows().forEach((row) => {
      const id = row.getAttribute('data-user-id');
      const checked = state.selectedIds.has(id);
      row.style.background = checked ? 'rgba(110,142,251,0.08)' : '';
      const box = row.querySelector('input[data-operator-row-check]');
      if (box && box.checked !== checked) box.checked = checked;
    });

    const selectAll = document.getElementById('operatorSelectAll');
    if (selectAll) {
      const boxes = Array.from(body.querySelectorAll('input[data-operator-row-check]'));
      selectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
    }

    const adminBtn = getButtons()[2];
    if (adminBtn) adminBtn.style.display = canAssignAdmin ? '' : 'none';
    document.querySelectorAll('#operatorsTableBody select[data-role-select] option[value="admin"]').forEach((opt) => {
      opt.disabled = !canAssignAdmin;
    });
  }

  function roleLabel(role) {
    const value = String(role || '').toLowerCase();
    if (value === 'admin') return '총괄 운영자';
    if (value === 'operator') return '운영자';
    if (value === 'instructor') return '강사';
    return '일반수강생';
  }

  function currentRoleRank() {
    const role = window.BSQ?.userProfile?.role || window.BSQ?.session?.user?.role || 'user';
    const value = String(role).toLowerCase();
    if (['admin', 'super_admin'].includes(value)) return 3;
    if (value === 'operator') return 2;
    if (value === 'instructor') return 1;
    return 0;
  }

  async function assignSelected(role) {
    const ids = getSelectedIds();
    if (!ids.length) {
      alert('먼저 목록에서 계정을 선택해 주세요.');
      return;
    }

    if (!confirm(`선택한 ${ids.length}명의 계정을 "${roleLabel(role)}"로 변경할까요?`)) return;

    const res = await window.BSQ.api('/api/admin/operators', {
      method: 'PUT',
      body: { user_ids: ids, role },
    });

    if (!res?.success) {
      throw new Error(res?.error || '권한 변경 실패');
    }

    clearSelection();
    if (typeof window.loadOperators === 'function') {
      await window.loadOperators();
    }
  }

  function bindButtons() {
    if (state.bound) return;
    state.bound = true;

    const canAssignAdmin = currentRoleRank() >= 3;
    if (!canAssignAdmin) {
      const adminBtn = getButtons()[2];
      if (adminBtn) adminBtn.style.display = 'none';
      document.querySelectorAll('#operatorsTableBody select[data-role-select] option[value="admin"]').forEach((opt) => {
        opt.disabled = true;
      });
    }

    document.addEventListener('click', async (event) => {
      const button = event.target.closest('#tabOperators .card-header .btn-primary');
      if (!button) return;

      const buttons = getButtons();
      const index = buttons.indexOf(button);
      if (index < 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        if (index === 0) await assignSelected('operator');
        else if (index === 1) await assignSelected('instructor');
        else if (index === 2) await assignSelected('admin');
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    }, true);
  }

  function bindSelectionDelegation() {
    const body = getTableBody();
    if (!body || body.dataset.selectionBound === '1') return;
    body.dataset.selectionBound = '1';

    body.addEventListener('change', (event) => {
      const box = event.target.closest('input[data-operator-row-check]');
      if (!box) return;
      const id = box.getAttribute('data-operator-row-check');
      if (!id) return;
      if (box.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      syncSelectionUI();
    });
  }

  function bindSelectAll() {
    const selectAll = document.getElementById('operatorSelectAll');
    if (!selectAll || selectAll.dataset.selectionBound === '1') return;
    selectAll.dataset.selectionBound = '1';
    selectAll.addEventListener('change', () => {
      const body = getTableBody();
      if (!body) return;
      const checked = selectAll.checked;
      body.querySelectorAll('input[data-operator-row-check]').forEach((box) => {
        const id = box.getAttribute('data-operator-row-check');
        box.checked = checked;
        if (id) {
          if (checked) state.selectedIds.add(id);
          else state.selectedIds.delete(id);
        }
      });
      syncSelectionUI();
    });
  }

  function observeTable() {
    const body = getTableBody();
    if (!body || body.dataset.observed === '1') return;
    body.dataset.observed = '1';

    const observer = new MutationObserver(() => {
      bindSelectionDelegation();
      bindSelectAll();
      syncSelectionUI();
    });

    observer.observe(body, { childList: true, subtree: true });
  }

  function init() {
    bindButtons();
    bindSelectionDelegation();
    bindSelectAll();
    observeTable();
    syncSelectionUI();

    window.addEventListener('adminTabChanged', (e) => {
      if (e.detail?.tabId === 'tabOperators') {
        bindSelectionDelegation();
        bindSelectAll();
        syncSelectionUI();
      }
    });

    window.__BSQ_OPERATOR_SELECTION__ = {
      getSelectedIds,
      clearSelection,
      syncSelectionUI,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
