// admin_extensions.js — V2: 모든 탭 핸들러 (D1 API 기반)
(function () {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

  // ===== 운영자 설정 (tabOperators) =====
  async function loadOperators() {
    try {
      const json = await BSQ.api('/api/users');
      const body = document.getElementById('operatorsTableBody');
      if (!body) return;

      const ops = (json.data || []).filter(u => u.role === 'admin' || u.role === 'instructor');
      if (!ops.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">등록된 운영자가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = ops.map(u => `<tr>
        <td>${u.name || '-'}</td>
        <td>${u.email || '-'}</td>
        <td><span class="badge ${u.role === 'admin' ? 'danger' : 'info'}">${u.role}</span></td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        <td><button class="btn-small danger" onclick="removeOperator('${u.id}')">해임</button></td>
      </tr>`).join('');
    } catch (err) {
      console.error('[Operators] Error:', err);
    }
  }

  window.removeOperator = async function (userId) {
    if (!confirm('해당 사용자의 운영자 권한을 해제하시겠습니까?')) return;
    try {
      await BSQ.api(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user' })
      });
      loadOperators();
    } catch (err) { console.error(err); }
  };

  // ===== 게시판 (tabBoards) =====
  async function loadGlobalBoards() {
    try {
      const json = await BSQ.api('/api/notices');
      const body = document.getElementById('globalBoardsTableBody');
      if (!body) return;

      const notices = json.data || [];
      if (!notices.length) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#aaa;">등록된 사이트 공지가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = notices.map(n => `<tr>
        <td>${n.title || '-'}</td>
        <td>${n.author_name || '-'}</td>
        <td>${n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        <td><button class="btn-small danger" onclick="deleteGlobalNotice('${n.id}')">삭제</button></td>
      </tr>`).join('');
    } catch (err) {
      console.error('[Boards] Error:', err);
    }
  }

  window.deleteGlobalNotice = async function (id) {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;
    try {
      await BSQ.api(`/api/notices?id=${id}`, { method: 'DELETE' });
      loadGlobalBoards();
    } catch (err) { console.error(err); }
  };

  // ===== 클래스 공지사항 (tabClassBoards) =====
  async function loadClassBoards() {
    try {
      const json = await BSQ.api('/api/class-notices');
      const body = document.getElementById('classBoardsTableBody');
      if (!body) return;

      const notices = json.data || [];
      if (!notices.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">등록된 클래스 공지가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = notices.map(n => `<tr>
        <td>${n.class_title || '-'}</td>
        <td>${n.title || '-'}</td>
        <td>${n.author_name || '-'}</td>
        <td>${n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        <td><button class="btn-small outline">이동</button>&nbsp;<button class="btn-small danger" onclick="deleteClassNotice('${n.id}')">삭제</button></td>
      </tr>`).join('');
    } catch (err) {
      console.error('[ClassBoards] Error:', err);
    }
  }

  window.deleteClassNotice = async function (id) {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;
    try {
      await BSQ.api(`/api/class-notices?id=${id}`, { method: 'DELETE' });
      loadClassBoards();
    } catch (err) { console.error(err); }
  };

  // ===== 이벤트 쿠폰 (tabCoupons) =====
  async function loadCoupons() {
    try {
      const json = await BSQ.api('/api/admin/coupons');
      const body = document.getElementById('couponsTableBody');
      if (!body) return;

      const coupons = json.data || [];
      if (!coupons.length) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#aaa;">등록된 쿠폰이 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = coupons.map(c => `<tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.name}</td>
        <td>${c.type === 'percent' ? c.amount + '%' : fmt(c.amount) + '원'} 할인</td>
        <td>${fmt(c.min_order_amount)}원</td>
        <td>${fmt(c.used_count)} / ${c.max_issue_count === 0 ? '무제한' : fmt(c.max_issue_count)}</td>
        <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString('ko-KR') : '-'}</td>
        <td><span class="badge ${c.is_active ? 'info' : 'danger'}">${c.is_active ? '활성' : '만료'}</span></td>
        <td><button class="btn-small danger" onclick="deleteCoupon('${c.code}')">삭제</button></td>
      </tr>`).join('');
    } catch (err) {
      console.error('[Coupons] Error:', err);
    }
  }

  window.createCoupon = async function () {
    const code = prompt('새로운 쿠폰 코드를 입력하세요 (예: SPRING2024)');
    if (!code) return;
    const amount = prompt('할인율(%) 또는 할인금액(원) 숫자만 입력하세요. (예: 20)');
    if (!amount) return;
    const isPercent = confirm('이 비율이 퍼센트(%) 할인인가요? (취소 시 원 단위 정액 할인)');
    
    try {
      const payload = {
        code: code.toUpperCase(),
        name: code + ' 할인 이벤트',
        type: isPercent ? 'percent' : 'fixed',
        amount: parseInt(amount),
        max_issue_count: 0
      };
      await BSQ.api('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('발급 완료되었습니다.');
      loadCoupons();
    } catch(err) {
      alert('발급 실패: ' + err.message);
    }
  };

  window.deleteCoupon = async function(code) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await BSQ.api(`/api/admin/coupons?code=${code}`, { method: 'DELETE' });
      loadCoupons();
    } catch(err) { alert(err.message); }
  }

  // ===== 메뉴 설정 (tabMenuSettings) =====
  let currentMenus = [];
  async function loadMenuSettings() {
    try {
      const json = await BSQ.api('/api/admin/menus');
      currentMenus = json.data || [];
      renderMenus();
    } catch (err) { console.error('[Menus] Error:', err); }
  }

  function renderMenus() {
    const body = document.getElementById('menuSettingsBody');
    if (!body) return;
    if (!currentMenus.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#aaa;">등록된 메뉴가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = currentMenus.map((m, i) => `<tr>
      <td><input type="text" value="${m.label || ''}" class="admin-form-input" onchange="updateMenu(${i}, 'label', this.value)" style="margin:0;"></td>
      <td><input type="text" value="${m.href || ''}" class="admin-form-input" onchange="updateMenu(${i}, 'href', this.value)" style="margin:0;"></td>
      <td>
        <select class="admin-form-input" style="margin:0;" onchange="updateMenu(${i}, 'target', this.value)">
          <option value="_self" ${m.target !== '_blank' ? 'selected' : ''}>현재 창</option>
          <option value="_blank" ${m.target === '_blank' ? 'selected' : ''}>새 창</option>
        </select>
      </td>
      <td><input type="checkbox" ${m.visible ? 'checked' : ''} onchange="updateMenu(${i}, 'visible', this.checked)"> 표시</td>
      <td><button class="btn-small danger" onclick="removeMenu(${i})">삭제</button></td>
    </tr>`).join('');
  }

  window.updateMenu = function(idx, key, val) {
    if (currentMenus[idx]) {
      currentMenus[idx][key] = (key === 'visible') ? (val ? 1 : 0) : val;
    }
  };
  window.addMenuRow = function() {
    currentMenus.push({ id: 'menu_' + Date.now(), label: '새 메뉴', href: '/', target: '_self', visible: 1, sort_order: currentMenus.length });
    renderMenus();
  };
  window.removeMenu = function(idx) {
    currentMenus.splice(idx, 1);
    renderMenus();
  };
  window.saveMenuSettings = async function() {
    try {
      currentMenus.forEach((m, i) => m.sort_order = i);
      await BSQ.api('/api/admin/menus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentMenus)
      });
      alert('메뉴가 저장되었습니다.');
      loadMenuSettings();
    } catch (err) { alert('저장 실패: ' + err.message); }
  };

  // ===== 결제 조회 (tabPaymentsView) =====
  window.searchPayments = async function () {
    const keyword = document.getElementById('paymentSearchInput')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const from = document.getElementById('paymentFromDate')?.value || '';
    const to = document.getElementById('paymentToDate')?.value || '';

    try {
      const params = new URLSearchParams();
      if (keyword) params.append('q', keyword);
      if (status) params.append('status', status);
      if (from) params.append('start', from);
      if (to) params.append('end', to);

      const json = await BSQ.api('/api/admin/orders?' + params.toString());
      const body = document.getElementById('paymentsViewBody');
      if (!body) return;

      const items = json.data || [];
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#aaa;">검색 결과가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = items.map(o => `<tr>
        <td><strong>${o.order_id}</strong></td>
        <td>${o.class_title || o.order_type}</td>
        <td>${o.user_name || '-'}</td>
        <td>${o.pay_method || '-'}</td>
        <td>${fmt(o.amount + o.discount_amount)}원</td>
        <td>${o.coupon_code ? `[${o.coupon_code}] -${fmt(o.discount_amount)}원` : '-'}</td>
        <td><strong>${fmt(o.amount)}원</strong></td>
        <td><span class="badge ${o.status === 'paid' ? 'info' : (o.status === 'refunded' ? 'danger' : 'warning')}">${o.status}</span></td>
        <td>${o.status === 'paid' ? `<button class="btn-small danger" onclick="requestRefund('${o.order_id}')">환불</button>` : '-'}</td>
      </tr>`).join('');
    } catch (err) {
      console.error('[Payments] Error:', err);
    }
  };

  window.requestRefund = async function(orderId) {
    if (!confirm(`${orderId} 주문을 환불 처리하시겠습니까?`)) return;
    try {
      await BSQ.api('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, action: 'refund' })
      });
      alert('환불이 완료되었습니다.');
      searchPayments();
    } catch (err) { alert('환불 오류: ' + err.message); }
  };

  // ===== 입출금 기록 (tabFinancial) =====
  async function loadFinancial() {
    try {
      const type = document.getElementById('finTypeFilter')?.value || '';
      let url = '/api/admin/financial';
      if (type) url += `?type=${type}`;
      
      const json = await BSQ.api(url);
      const data = json.data;
      if (!data) return;

      const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = '₩' + fmt(val); };
      el('finIncome', data.summary.target_income);
      el('finRefund', data.summary.target_refund);
      el('finSettlement', data.summary.target_settlement);
      el('finNet', data.summary.target_net);

      const body = document.getElementById('financialRecordsBody');
      if (body) {
        body.innerHTML = data.records.map(r => `<tr>
          <td><span class="badge ${r.type === 'income' ? 'info' : (r.type === 'refund' ? 'danger' : 'warning')}">${r.type}</span></td>
          <td>${fmt(r.amount)}원</td>
          <td>${r.description || '-'}</td>
          <td>${r.reference_id || '-'}</td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        </tr>`).join('');
      }
    } catch(err) { console.error(err); }
  }

  // ===== 정산 정보 등록 (tabSettlementInfo) =====
  async function loadSettlementInfo() {
    try {
      const json = await BSQ.api('/api/admin/settlements?type=info');
      if (json.data && json.data.id === 'global') {
        const i = json.data;
        ['company_name','ceo_name','biz_num','address','biz_type','manager_email','bank_name','bank_account','bank_holder'].forEach(k => {
          const el = document.getElementById('si_' + k);
          if (el) el.value = i[k] || '';
        });
      }
    } catch (err) { console.error('[SettlementInfo] Error:', err); }
  }

  window.saveSettlementInfo = async function() {
    try {
      const payload = {};
      ['company_name','ceo_name','biz_num','address','biz_type','manager_email','bank_name','bank_account','bank_holder'].forEach(k => {
        const el = document.getElementById('si_' + k);
        if (el) payload[k] = el.value;
      });
      await BSQ.api('/api/admin/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'info', ...payload })
      });
      alert('정산 정보가 안전하게 저장되었습니다.');
    } catch (err) { alert('에러: ' + err.message); }
  };

  // ===== 정산 내역 조회 (tabSettlementHistory) =====
  async function loadSettlementHistory() {
    try {
      const json = await BSQ.api('/api/admin/settlements');
      const body = document.getElementById('settlementHistoryBody');
      if (!body) return;

      const list = json.data || [];
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#aaa;">조회된 정산 내역이 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = list.map(s => `<tr>
        <td><strong>${s.id}</strong></td>
        <td>${s.instructor_name || '-'}</td>
        <td>${s.period_start} ~ ${s.period_end}</td>
        <td>${fmt(s.total_revenue)}원</td>
        <td>${fmt(s.platform_fee + s.pg_fee)}원</td>
        <td><strong style="color:#10b981;">${fmt(s.settlement_amount)}원</strong></td>
        <td><span class="badge ${s.status === 'completed' ? 'info' : 'warning'}">${s.status}</span></td>
      </tr>`).join('');
    } catch(err) { console.error(err); }
  }

  // ===== 부가세 신고 파일 (tabTax) =====
  window.btnDownloadTax = document.getElementById('btnDownloadTax');
  if (btnDownloadTax) {
    btnDownloadTax.addEventListener('click', async () => {
      try {
        const json = await BSQ.api('/api/admin/orders?status=paid&limit=500');
        const orders = json.data || [];
        if (!orders.length) return alert('다운로드할 결제 기록이 없습니다.');
        
        // CSV 생성
        const headers = ["주문번호", "계정명", "결제금액", "과세여부", "부가가치세"];
        const rows = orders.map(o => [
          o.order_id,
          o.user_name || o.user_id,
          o.amount,
          "과세",
          Math.floor(o.amount - (o.amount / 1.1)) // 10% VAT
        ]);
        
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
          + headers.join(',') + "\n" 
          + rows.map(e => e.join(",")).join("\n");
          
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tax_report_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
      } catch(e) { alert(e.message); }
    });
  }

  // 연결
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
  
  // Tab Fin Filter
  if(document.getElementById('finTypeFilter')) {
    document.getElementById('finTypeFilter').addEventListener('change', loadFinancial);
  }
})();
