// admin_dashboard.js — D1 API 기반 대시보드 통계 (V2)
(function () {
  let mainChart = null;

  function fmt(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }

  async function initDashboard(range = 7) {
    try {
      const json = await BSQ.api(`/api/admin/stats?range=${range}`);
      let d = json.data;
      if (!d) {
        // 백엔드 형식이 다를 경우 방어코드
        d = json;
      }

      // 통계 카드
      const el = (id) => document.getElementById(id);
      if (el('statRevenue')) el('statRevenue').textContent = '₩' + fmt(d.total_revenue);
      if (el('statUsers')) el('statUsers').textContent = fmt(d.total_users);
      if (el('statClasses')) el('statClasses').textContent = fmt(d.total_classes);
      if (el('statEnrollments')) el('statEnrollments').textContent = fmt(d.total_enrollments);
      if (el('statInstructors')) el('statInstructors').textContent = fmt(d.instructor_count);

      // 차트
      renderChart(d.chart, range);

      // 최근 주문
      renderRecentOrders(d.recent_orders || []);
    } catch (err) {
      console.error('[Dashboard] Stats error:', err);
    }
  }

  function renderChart(chart, range) {
    const ctx = document.getElementById('mainDashboardChart');
    if (!ctx) return;

    if (mainChart) mainChart.destroy();

    const labels = (chart?.labels || []).map(d => {
      const parts = d.split('-');
      return `${parts[1]}/${parts[2]}`;
    });

    mainChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '신규 가입',
            data: chart?.newUsers || [],
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.1)',
            fill: true, tension: 0.4
          },
          {
            label: '매출 (만원)',
            data: (chart?.revenue || []).map(v => Math.round(v / 10000)),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true, tension: 0.4
          },
          {
            label: '방문자',
            data: chart?.visitors || [],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.1)',
            fill: true, tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderRecentOrders(orders) {
    const body = document.getElementById('dashRecentOrdersBody');
    if (!body) return;

    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#aaa;">주문 내역이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = orders.map(o => {
      const statusBadge = {
        paid: '<span class="badge success">결제완료</span>',
        refunded: '<span class="badge danger">환불</span>',
        pending: '<span class="badge warning">대기</span>',
        cancelled: '<span class="badge">취소</span>'
      };
      return `<tr>
        <td style="font-family:monospace; font-size:0.8rem;">${o.order_id || '-'}</td>
        <td>${o.user_name || '-'}</td>
        <td>${o.class_title || o.order_type || '-'}</td>
        <td>₩${fmt(o.final_amount)}</td>
        <td>${statusBadge[o.status] || o.status}</td>
        <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('ko-KR') : '-'}</td>
      </tr>`;
    }).join('');
  }

  // 차트 범위 버튼
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.chart-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        initDashboard(parseInt(btn.dataset.range));
      });
    });
  });

  // 탭 변경 이벤트
  window.addEventListener('adminTabChanged', (e) => {
    if (e.detail?.tabId === 'tabDashboard') {
      initDashboard();
    }
  });

  // 새로고침 버튼
  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('btnAdminRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => initDashboard());
  });

  // 초기 로드
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDashboard());
  } else {
    initDashboard();
  }
})();
