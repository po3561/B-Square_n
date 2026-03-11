// admin_dashboard.js - Handles statistics fetching and Chart.js rendering

document.addEventListener('DOMContentLoaded', () => {
    // Only load data if we are explicitly on the Dashboard tab
    const tabDashboard = document.getElementById('tabDashboard');
    if (tabDashboard && tabDashboard.classList.contains('active')) {
        initDashboard();
    }

    // Listen for tab changes
    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabDashboard') {
            initDashboard();
        }
    });
});

let mainChartInstance = null;

async function initDashboard() {
    console.log("📊 Loading Dashboard Statistics...");
    // ★ BSQ.ready 대기 → 인증 보장 후 DB 접근
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
    const db = window.BSQ?.db || firebase.database();

    // 1. Fetch Total Users
    const statUsers = document.getElementById('statUsers');
    if (statUsers && window.supabaseClient) {
        try {
            const { count, error } = await window.supabaseClient
                .from('users')
                .select('*', { count: 'exact', head: true });

            if (!error) statUsers.textContent = count.toLocaleString();
        } catch (err) {
            console.error("Failed to fetch user count", err);
        }
    }

    // 2. Fetch Total Classes
    const statClasses = document.getElementById('statClasses');
    if (statClasses) {
        db.ref('classes').once('value').then(snap => {
            statClasses.textContent = snap.numChildren().toLocaleString();
        }).catch(err => console.error("Failed to fetch class count", err));
    }

    // 3. Fetch Total Revenue (Real data from user_passes)
    const statRevenue = document.getElementById('statRevenue');
    if (statRevenue) {
        statRevenue.textContent = "가져오는 중...";
        db.ref('user_passes').once('value').then(snap => {
            let totalRev = 0;
            const passesData = snap.val();
            if (passesData) {
                Object.values(passesData).forEach(classObj => {
                    Object.values(classObj).forEach(passes => {
                        const passArr = Array.isArray(passes) ? passes : Object.values(passes);
                        passArr.forEach(p => {
                            if (p.status !== 'refunded' && p.price) {
                                totalRev += parseInt(p.price);
                            }
                        });
                    });
                });
            }
            statRevenue.textContent = totalRev.toLocaleString();
        }).catch(err => {
            console.error("Failed to fetch revenue", err);
            statRevenue.textContent = "오류";
        });
    }

    // 4. Fetch Today's Visitors
    const statVisitors = document.getElementById('statVisitors');
    if (statVisitors) {
        const today = new Date().toISOString().split('T')[0];
        db.ref(`site_settings/visitors/${today}`).on('value', snap => {
            statVisitors.textContent = (snap.val() || 0).toLocaleString();
        });
    }

    // 5. Fetch Active Users
    const statActive = document.getElementById('statActive');
    if (statActive) {
        db.ref('site_settings/presence').on('value', snap => {
            statActive.textContent = (snap.numChildren() || 0).toLocaleString();
        });
    }

    // 6. Render Chart.js
    renderMainChart();
}

async function renderMainChart() {
    const ctx = document.getElementById('mainDashboardChart');
    if (!ctx) return;

    if (mainChartInstance) {
        mainChartInstance.destroy();
    }

    const labels = [];
    const dateMap = {};

    // Prepare exact Date strings for the past 7 days (YYYY-MM-DD)
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const isoDate = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }));
        dateMap[isoDate] = 0; // Initialize count
    }

    let dataNewUsers = [0, 0, 0, 0, 0, 0, 0];

    // Fetch real user data from Supabase
    if (window.supabaseClient) {
        try {
            // Get users created in the last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: usersData, error } = await window.supabaseClient
                .from('users')
                .select('created_at')
                .gte('created_at', sevenDaysAgo.toISOString());

            if (!error && usersData) {
                usersData.forEach(u => {
                    const isoDate = u.created_at.split('T')[0];
                    if (dateMap[isoDate] !== undefined) {
                        dateMap[isoDate]++;
                    }
                });
                dataNewUsers = Object.values(dateMap);
            }
        } catch (err) {
            console.error("Failed to fetch chart data", err);
        }
    }

    const dataPageViews = [0, 0, 0, 0, 0, 0, 0]; // Future feature

    mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '신규 가입자 👶',
                    data: dataNewUsers,
                    borderColor: '#009ef7',
                    backgroundColor: 'rgba(0, 158, 247, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '페이지 뷰 👀 (x10) - (준비중)',
                    data: dataPageViews,
                    borderColor: '#50cd89',
                    backgroundColor: 'rgba(80, 205, 137, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            }
        }
    });
}
