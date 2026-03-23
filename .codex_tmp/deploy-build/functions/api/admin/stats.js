import { json, options } from '../_lib/http.js';
import { ensureAuthSchema, ensureClassesSchema, ensureOperationsSchema } from '../_lib/schema.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const range = Math.max(1, Math.min(parseInt(url.searchParams.get('range')) || 7, 30));

  try {
    await ensureAuthSchema(db);
    await ensureClassesSchema(db);
    await ensureOperationsSchema(db);

    const [userCount, classCount, enrollmentCount, inquiryCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS cnt FROM users').first().catch(() => ({ cnt: 0 })),
      db.prepare('SELECT COUNT(*) AS cnt FROM classes').first().catch(() => ({ cnt: 0 })),
      db.prepare('SELECT COUNT(*) AS cnt FROM enrollments').first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM inquiries WHERE status = 'pending'").first().catch(() => ({ cnt: 0 })),
    ]);

    let totalRevenue = { total: 0 };
    try {
      totalRevenue = await db.prepare("SELECT COALESCE(SUM(final_amount), 0) AS total FROM orders WHERE status = 'paid'").first();
    } catch { }

    const today = new Date().toISOString().split('T')[0];
    let todayVisitors = { count: 0 };
    try {
      todayVisitors = (await db.prepare('SELECT count FROM visitors WHERE date = ?').bind(today).first()) || { count: 0 };
    } catch { }

    const chartLabels = [];
    const chartNewUsers = [];
    const chartRevenue = [];
    const chartVisitors = [];

    for (let i = range - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      chartLabels.push(dateStr);

      try {
        const u = await db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE date(created_at) = ?').bind(dateStr).first();
        chartNewUsers.push(u?.cnt || 0);
      } catch {
        chartNewUsers.push(0);
      }

      try {
        const r = await db.prepare("SELECT COALESCE(SUM(final_amount), 0) AS total FROM orders WHERE status = 'paid' AND date(paid_at) = ?").bind(dateStr).first();
        chartRevenue.push(r?.total || 0);
      } catch {
        chartRevenue.push(0);
      }

      try {
        const v = await db.prepare('SELECT count FROM visitors WHERE date = ?').bind(dateStr).first();
        chartVisitors.push(v?.count || 0);
      } catch {
        chartVisitors.push(0);
      }
    }

    let recentOrders = [];
    try {
      const { results } = await db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all();
      recentOrders = results || [];
    } catch { }

    const instructorCount = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'instructor'").first().catch(() => ({ cnt: 0 }));
    const adminCount = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first().catch(() => ({ cnt: 0 }));

    return json(request, env, {
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
          visitors: chartVisitors,
        },
        recent_orders: recentOrders,
      },
    });
  } catch (err) {
    return json(request, env, { success: false, error: 'Failed to load admin stats', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
