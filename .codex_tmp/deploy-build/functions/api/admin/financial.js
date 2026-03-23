// Admin financial records API
// GET /api/admin/financial?type=&from=&to=&limit=

import { json, options } from '../_lib/http.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);
  if (method !== 'GET') return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });

  try {
    await ensureOperationsSchema(db);

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || '';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 500);

    let sql = 'SELECT * FROM financial_records WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (from) {
      sql += ' AND date(created_at) >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND date(created_at) <= ?';
      params.push(to);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await db.prepare(sql).bind(...params).all();

    const incomeTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'income'")
      .first().catch(() => ({ total: 0 }));
    const refundTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'refund'")
      .first().catch(() => ({ total: 0 }));
    const settlementTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'settlement'")
      .first().catch(() => ({ total: 0 }));

    const summary = {
      total_income: incomeTotal?.total || 0,
      total_refund: refundTotal?.total || 0,
      total_settlement: settlementTotal?.total || 0,
    };
    summary.net = summary.total_income - summary.total_refund - summary.total_settlement;
    summary.target_income = summary.total_income;
    summary.target_refund = summary.total_refund;
    summary.target_settlement = summary.total_settlement;
    summary.target_net = summary.net;

    return json(request, env, {
      success: true,
      data: results || [],
      records: results || [],
      summary,
    });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
