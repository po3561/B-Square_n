import { json, options } from '../_lib/http.js';
import { ensureAuthSchema, ensureClassesSchema, ensureOperationsSchema } from '../_lib/schema.js';

function buildDateRange(range) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - (range - 1));

  const labels = [];
  for (let i = 0; i < range; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    labels.push(current.toISOString().split('T')[0]);
  }

  return {
    labels,
    start: labels[0],
    end: labels[labels.length - 1],
    today: labels[labels.length - 1],
  };
}

function rowsToMap(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row?.[keyField] || '').trim();
    if (!key) continue;
    map.set(key, Number(row?.[valueField] || 0));
  }
  return map;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const range = Math.max(1, Math.min(parseInt(url.searchParams.get('range')) || 7, 30));

  try {
    await ensureAuthSchema(db);
    await ensureClassesSchema(db);
    await ensureOperationsSchema(db);

    const { labels, start, end, today } = buildDateRange(range);

    const [userCount, classCount, enrollmentCount, inquiryCount, totalRevenue, newUsersRows, revenueRows, visitorRows, recentOrders, instructorCount, adminCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS cnt FROM users').first().catch(() => ({ cnt: 0 })),
      db.prepare('SELECT COUNT(*) AS cnt FROM classes').first().catch(() => ({ cnt: 0 })),
      db.prepare('SELECT COUNT(*) AS cnt FROM enrollments').first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM inquiries WHERE status = 'pending'").first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COALESCE(SUM(final_amount), 0) AS total FROM orders WHERE status = 'paid'").first().catch(() => ({ total: 0 })),
      db.prepare(`
        SELECT date(created_at) AS day, COUNT(*) AS cnt
        FROM users
        WHERE date(created_at) BETWEEN ? AND ?
        GROUP BY date(created_at)
      `).bind(start, end).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT date(paid_at) AS day, COALESCE(SUM(final_amount), 0) AS total
        FROM orders
        WHERE status = 'paid'
          AND date(paid_at) BETWEEN ? AND ?
        GROUP BY date(paid_at)
      `).bind(start, end).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT date AS day, count
        FROM visitors
        WHERE date BETWEEN ? AND ?
      `).bind(start, end).all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all().catch(() => ({ results: [] })),
      db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'instructor'").first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first().catch(() => ({ cnt: 0 })),
    ]);

    const newUserMap = rowsToMap(newUsersRows?.results || [], 'day', 'cnt');
    const revenueMap = rowsToMap(revenueRows?.results || [], 'day', 'total');
    const visitorMap = rowsToMap(visitorRows?.results || [], 'day', 'count');
    const chartNewUsers = labels.map((label) => newUserMap.get(label) || 0);
    const chartRevenue = labels.map((label) => revenueMap.get(label) || 0);
    const chartVisitors = labels.map((label) => visitorMap.get(label) || 0);
    const todayVisitors = visitorMap.get(today) || 0;

    return json(request, env, {
      success: true,
      data: {
        total_users: userCount?.cnt || 0,
        total_classes: classCount?.cnt || 0,
        total_enrollments: enrollmentCount?.cnt || 0,
        pending_inquiries: inquiryCount?.cnt || 0,
        total_revenue: totalRevenue?.total || 0,
        today_visitors: todayVisitors,
        instructor_count: instructorCount?.cnt || 0,
        admin_count: adminCount?.cnt || 0,
        chart: {
          labels,
          newUsers: chartNewUsers,
          revenue: chartRevenue,
          visitors: chartVisitors,
        },
        recent_orders: recentOrders?.results || [],
      },
    });
  } catch (err) {
    return json(request, env, { success: false, error: 'Failed to load admin stats', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
