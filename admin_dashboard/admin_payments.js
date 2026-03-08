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

async function loadAdminPayments() {
    const tbody = document.getElementById('adminPaymentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">결제 내역을 불러오는 중입니다...</td></tr>';

    try {
        const db = firebase.database();
        // Fallback or read from a defined payments node
        const snap = await db.ref('user_passes').once('value'); 
        const passesData = snap.val();

        if (!passesData) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">결제 내역이 없습니다.</td></tr>';
            return;
        }

        // Aggregate across all users for admin view
        const allTransactions = [];
        Object.entries(passesData).forEach(([userId, classObj]) => {
            Object.entries(classObj).forEach(([classId, passes]) => {
                const passesArray = Array.isArray(passes) ? passes : Object.values(passes);
                passesArray.forEach(p => {
                    allTransactions.push({
                        userId: userId,
                        classId: classId,
                        ...p
                    });
                });
            });
        });

        allTransactions.sort((a, b) => (b.purchased_at || 0) - (a.purchased_at || 0));

        if (allTransactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-text-muted);">결제 내역이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = allTransactions.map(tx => {
            const dateStr = tx.purchased_at ? new Date(tx.purchased_at).toLocaleString('ko-KR') : '-';
            const price = tx.price ? parseInt(tx.price).toLocaleString() : '0';
            
            let statusBadge = '<span class="admin-badge success payment-status" data-status="paid">결제 완료</span>';
            let typeBadge = '<span class="admin-badge primary">일반 수강권</span>';

            if (tx.pass_type === 'monthly') typeBadge = '<span class="admin-badge" style="background:rgba(167,119,227,0.1); color:#a777e3;">월정액 (구독)</span>';
            if (tx.pass_type === 'count') typeBadge = `<span class="admin-badge muted">회차권 (${tx.total_count}회)</span>`;

            // Mocking a refund state for UI demonstration if price is negative/refunded
            if (tx.status === 'refunded') {
                statusBadge = '<span class="admin-badge danger payment-status" data-status="refunded">환불됨</span>';
            }

            return `
                <tr>
                    <td style="font-size:0.85rem; color:var(--admin-text-muted);">${dateStr}</td>
                    <td style="font-weight:600;">UID: ${tx.userId.substring(0,6)}...</td>
                    <td>
                        <div style="font-weight:600; color:var(--admin-text-main); margin-bottom:4px;">Class: ${tx.classId.substring(0,8)}...</div>
                        ${typeBadge}
                    </td>
                    <td><span class="admin-badge muted">신용카드/간편결제</span></td>
                    <td style="font-weight:700;">₩${price}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load payments", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--admin-danger);">데이터 로딩 실패</td></tr>';
    }
}
