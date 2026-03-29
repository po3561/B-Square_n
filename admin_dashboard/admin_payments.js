// admin_payments.js - Handles Payment and Refund history

document.addEventListener('DOMContentLoaded', () => {
    const tabPayments = document.getElementById('tabPayments');
    if (tabPayments && tabPayments.classList.contains('active')) {
        loadAdminPayments();
    }

    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabPayments') {
            loadAdminPayments();
        }
    });

    // Payment Filter Listener
    document.getElementById('filterPaymentStatus')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const rows = document.querySelectorAll('#adminPaymentsTableBody tr');
        rows.forEach(row => {
            if (val === 'all') {
                row.style.display = '';
            } else {
                const statusCell = row.querySelector('.payment-status');
                if (statusCell && statusCell.dataset.status === val) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
    });
});

// 1. Load Payment/Transaction List (D1 API)
async function loadAdminPayments() {
    const tbody = document.getElementById('adminPaymentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">결제 내역을 불러오는 중입니다...</td></tr>';

    try {
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const res = await window.BSQ.api('/api/admin/transactions');

        if (!res || !res.success) {
            throw new Error(res?.error || 'Failed to fetch transactions');
        }

        const transactions = res.data || [];

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">결제/수강 내역이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(tx => {
            const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleString('ko-KR') : '-';
            const priceStr = tx.amount_paid ? parseInt(tx.amount_paid).toLocaleString() : '0';
            
            const statusLabel = tx.status === 'active' ? '결제 완료' : (tx.status === 'refunded' ? '환불됨' : tx.status);
            const statusClass = tx.status === 'active' ? 'success' : 'danger';
            
            let statusBadge = `<span class="admin-badge ${statusClass} payment-status" data-status="${tx.status}">${statusLabel}</span>`;
            
            // 결제 수단 한글화
            const methodMap = {
                'card': '신용카드',
                'trans': '계좌이체',
                'vbank': '가상계좌',
                'phone': '휴대폰결제',
                'free': '무료/쿠폰'
            };
            const methodLabel = methodMap[tx.payment_method] || tx.payment_method || '일반결제';

            return `
                <tr>
                    <td style="font-size:0.85rem; color:var(--admin-text-muted);">${dateStr}</td>
                    <td>
                        <div style="font-weight:600; color:var(--admin-text-main);">${tx.user_name || '이름 없음'}</div>
                        <div style="font-size:0.8rem; color:var(--admin-text-muted);">ID: ${tx.user_id?.substring(0,8)}...</div>
                    </td>
                    <td>
                        <div style="font-weight:600; color:var(--admin-text-main); margin-bottom:4px;">${tx.class_title || '삭제된 클래스'}</div>
                        <div style="font-size:0.8rem; color:var(--admin-text-muted);">ID: ${tx.class_id?.substring(0,8)}...</div>
                    </td>
                    <td><span class="admin-badge muted">${methodLabel}</span></td>
                    <td style="font-weight:700;">₩${priceStr}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load transactions from D1:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패: ' + err.message + '</td></tr>';
    }
}
