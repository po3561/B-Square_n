// functions/api/admin/stats.js — 관리자 대시보드 통계 (V2 고도화)
// GET /api/admin/stats?range=7|30

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const range = parseInt(url.searchParams.get('range')) || 7;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    // 1. 기본 통계
    const [userCount, classCount, enrollmentCount, inquiryCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM users').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM classes').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM enrollments').first(),
      db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'pending'").first().catch(() => ({ cnt: 0 }))
    ]);

    // 2. 총 매출 (orders 테이블)
    let totalRevenue = { total: 0 };
    try {
      totalRevenue = await db.prepare("SELECT COALESCE(SUM(final_amount),0) as total FROM orders WHERE status = 'paid'").first();
    } catch { /* orders 테이블 미존재 시 0 */ }

    // 3. 오늘 방문자
    const today = new Date().toISOString().split('T')[0];
    let todayVisitors = { count: 0 };
    try {
      todayVisitors = await db.prepare("SELECT count FROM visitors WHERE date = ?").bind(today).first() || { count: 0 };
    } catch { /* visitors 테이블 미존재 시 0 */ }

    // 4. 기간별 차트 데이터 (신규 가입자, 매출 추이)
    const chartLabels = [];
    const chartNewUsers = [];
    const chartRevenue = [];
    const chartVisitors = [];

    for (let i = range - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      chartLabels.push(dateStr);

      // 신규 가입자
      try {
        const u = await db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = ?").bind(dateStr).first();
        chartNewUsers.push(u?.cnt || 0);
      } catch { chartNewUsers.push(0); }

      // 매출
      try {
        const r = await db.prepare("SELECT COALESCE(SUM(final_amount),0) as total FROM orders WHERE status = 'paid' AND date(paid_at) = ?").bind(dateStr).first();
        chartRevenue.push(r?.total || 0);
      } catch { chartRevenue.push(0); }

      // 방문자
      try {
        const v = await db.prepare("SELECT count FROM visitors WHERE date = ?").bind(dateStr).first();
        chartVisitors.push(v?.count || 0);
      } catch { chartVisitors.push(0); }
    }

    // 5. 최근 주문 5건
    let recentOrders = [];
    try {
      const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5").all();
      recentOrders = results || [];
    } catch { /* 무시 */ }

    // 6. 강사 수, 활성 회원 수
    const instructorCount = await db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'instructor'").first().catch(() => ({ cnt: 0 }));
    const adminCount = await db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").first().catch(() => ({ cnt: 0 }));

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_users: userCount?.cnt || 0,
        total_classes: classCount?.cnt || 0,
        total_enrollments: enrollmentCount?.cnt || 0,
        pending_inquiries: inquiryCount?.cnt || 0,
        total_revenue: totalRevenue?.total || 0,
        today_visitors: todayVisitors?.count || 0,
        instructor_count: instructorCount?.cnt || 0,
        admin_count: adminCount?.cnt || 0,
        chart: {
          labels: chartLabels,
          newUsers: chartNewUsers,
          revenue: chartRevenue,
          visitors: chartVisitors
        },
        recent_orders: recentOrders
      }
    }), { headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '통계 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode'
    }
  });
}
