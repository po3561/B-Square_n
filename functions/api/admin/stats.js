// GET /api/admin/stats — 관리자 대시보드 통계
export async function onRequestGet(context) {
  const { env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const [userCount, classCount, enrollmentCount, inquiryCount, todayVisitors] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM classes').first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM enrollments').first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'pending'").first(),
      env.DB.prepare("SELECT count FROM visitors WHERE date = date('now')").first()
    ]);

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_users: userCount?.cnt || 0,
        total_classes: classCount?.cnt || 0,
        total_enrollments: enrollmentCount?.cnt || 0,
        pending_inquiries: inquiryCount?.cnt || 0,
        today_visitors: todayVisitors?.count || 0
      }
    }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '통계 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}
