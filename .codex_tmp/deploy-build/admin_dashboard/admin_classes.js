// Admin classes tab

document.addEventListener('DOMContentLoaded', () => {
  const tabClasses = document.getElementById('tabAllClasses');
  if (tabClasses && tabClasses.classList.contains('active')) {
    loadAdminClasses();
  }

  window.addEventListener('adminTabChanged', (e) => {
    if (e.detail?.tabId === 'tabAllClasses') {
      loadAdminClasses();
    }
  });
});

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

async function loadAdminClasses() {
  const tbody = document.getElementById('allClassesTableBody');
  if (!tbody) return;

  if (window.BSQ?.ready) await window.BSQ.ready;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">클래스 데이터를 불러오는 중입니다...</td></tr>';

  try {
    const res = await window.BSQ.api('/api/classes');
    if (!res?.success) throw new Error(res?.error || 'Failed to fetch classes');

    const classItems = Array.isArray(res.data) ? res.data : [];
    if (classItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">등록된 클래스가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = classItems.map((item) => {
      const statusBadge = item.is_approved
        ? '<span class="admin-badge success">운영 중</span>'
        : '<span class="admin-badge muted">승인 대기</span>';
      const category = item.category || '미분류';
      const participantCount = item.current_participants ?? 0;
      const maxCapacity = item.capacity_max ?? item.max_capacity ?? '-';
      const thumbnail = item.thumbnail || item.image_url || 'https://via.placeholder.com/60x40?text=No+Img';

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:12px;">
              <img src="${escapeHtml(thumbnail)}" style="width:60px; height:40px; border-radius:6px; object-fit:cover;" alt="">
              <div>
                <div style="font-weight:700; color:var(--admin-text-main); margin-bottom:2px;">${escapeHtml(item.title || '제목 없음')}</div>
                <div style="font-size:0.8rem; color:var(--admin-text-muted);">ID: ${escapeHtml((item.id || '').slice(0, 8))}...</div>
              </div>
            </div>
          </td>
          <td style="font-weight:600;">${escapeHtml(item.instructor_name || item.creator_name || '강사')}</td>
          <td><span class="admin-badge muted">${escapeHtml(category)}</span></td>
          <td>${escapeHtml(String(item.price ?? 0))}</td>
          <td>${escapeHtml(String(participantCount))} / ${escapeHtml(String(maxCapacity))}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(item.is_public ? '공개' : '비공개')}</td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-small outline" onclick="window.open('../class_view/class_view.html?id=${encodeURIComponent(item.id)}', '_blank')">보기</button>
              <button class="btn-small outline" onclick="deleteClassItem('${escapeJsString(item.id)}', '${escapeJsString(item.title || '')}')" style="color:var(--admin-danger); border-color:rgba(241,65,108,0.3);">삭제</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load classes from D1:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패: ${escapeHtml(err.message)}</td></tr>`;
  }
}

window.deleteClassItem = async function deleteClassItem(classId, classTitle) {
  if (!confirm(`정말로 "${classTitle}" 클래스를 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }

  try {
    if (window.BSQ?.ready) await window.BSQ.ready;
    const res = await window.BSQ.api(`/api/classes?id=${encodeURIComponent(classId)}`, {
      method: 'DELETE',
    });

    if (!res?.success) throw new Error(res?.error || 'Delete failed');

    alert(`"${classTitle}" 클래스가 삭제되었습니다.`);
    loadAdminClasses();
  } catch (err) {
    console.error('Failed to delete class in D1:', err);
    alert(`클래스 삭제에 실패했습니다: ${err.message}`);
  }
};
