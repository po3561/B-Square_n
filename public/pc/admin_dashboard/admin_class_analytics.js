// admin_class_analytics.js — 클래스 통계/분석 탭 핸들러
(function () {
  const API = '/api/admin/class-analytics';
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

  async function loadClassAnalytics(top = 5) {
    try {
      // 1. 요약 통계
      const sumRes = await BSQ.api(`${API}`);
      // Assuming BSQ.api returns the parsed JSON directly, similar to sumRes.json()
      if (sumRes.success && sumRes.data.summary) {
        const s = sumRes.data.summary;
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = fmt(v); };
        el('caStatTotal', s.total_classes);
        el('caStatActive', s.active_classes);
        el('caStatStudents', s.total_students);
        el('caStatFree', s.free_classes);

        // 강사진 렌더링
        renderInstructors(sumRes.data.instructors || []);
      }

      // 2. 랭킹
      await loadRanking(top);

      // 3. 카테고리
      await loadCategories();
    } catch (err) {
      console.error('[ClassAnalytics] Error:', err);
    }
  }

  async function loadRanking(top) {
    try {
      const res = await BSQ.api(`${API}?type=ranking&top=${top}`);
      // Assuming BSQ.api returns the parsed JSON directly
      const body = document.getElementById('classRankingBody');
      if (!body) return;

      const data = res.data || []; // Use res.data as the actual list
      if (!data.length) {
        body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#aaa;">등록된 클래스가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = data.map((c, i) => `<tr>
        <td><strong style="color:#6366f1;">#${i + 1}</strong></td>
        <td>${c.title || '-'}</td>
        <td>${c.category || '미분류'}</td>
        <td>${c.instructor_name || '-'}</td>
        <td>${fmt(c.enrollments || c.current_participants)}</td>
        <td>${fmt(c.visits)}</td>
        <td>${fmt(c.passes_issued)} / ${fmt(c.passes_used)}</td>
        <td>${fmt(c.gatherings)}</td>
        <td>${c.avg_rating > 0 ? '⭐ ' + Number(c.avg_rating).toFixed(1) : '-'}</td>
        <td>₩${fmt(c.revenue)}</td>
      </tr>`).join('');
    } catch (err) {
      console.error('[ClassAnalytics] Ranking error:', err);
    }
  }

  async function loadCategories() {
    try {
      const res = await BSQ.api(`${API}?type=category`);
      // Assuming BSQ.api returns the parsed JSON directly
      const body = document.getElementById('categoryAnalysisBody');
      if (!body) return;

      const data = res.data || []; // Use res.data as the actual list
      if (!data.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">데이터가 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = data.map(c => `<tr>
        <td><strong>${c.category}</strong></td>
        <td>${fmt(c.class_count)}</td>
        <td>${fmt(c.total_visits)}</td>
        <td>${fmt(c.total_enrollments)}</td>
        <td>₩${fmt(c.total_revenue)}</td>
      </tr>`).join('');
    } catch (err) {
      console.error('[ClassAnalytics] Category error:', err);
    }
  }

  function renderInstructors(instructors) {
    const body = document.getElementById('instructorListBody');
    if (!body) return;

    if (!instructors.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">등록된 강사가 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = instructors.map(i => `<tr>
      <td><div style="width:32px;height:32px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.8rem;">${(i.name || '?')[0]}</div></td>
      <td>${i.name || '-'}</td>
      <td>${i.email || '-'}</td>
      <td>${i.phone || '-'}</td>
      <td><strong>${i.class_count || 0}</strong>개</td>
    </tr>`).join('');
  }

  // 랭킹 탭 버튼
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.ranking-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ranking-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadRanking(parseInt(btn.dataset.top));
      });
    });
  });

  // 탭 변경 시 로드
  window.addEventListener('adminTabChanged', (e) => {
    if (e.detail?.tabId === 'tabClassAnalytics') loadClassAnalytics();
  });
})();
