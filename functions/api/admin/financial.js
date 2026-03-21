// functions/api/admin/financial.js — 입출금 기록 API
// GET /api/admin/financial — 입출금 내역 조회

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (method !== 'GET') return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || ''; // 'income', 'refund', 'settlement'
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 500);

    let sql = 'SELECT * FROM financial_records WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (from) { sql += ' AND date(created_at) >= ?'; params.push(from); }
    if (to) { sql += ' AND date(created_at) <= ?'; params.push(to); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await db.prepare(sql).bind(...params).all();

    // 요약 통계
    const incomeTotal = await db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM financial_records WHERE type = 'income'").first().catch(() => ({ total: 0 }));
    const refundTotal = await db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM financial_records WHERE type = 'refund'").first().catch(() => ({ total: 0 }));
    const settlementTotal = await db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM financial_records WHERE type = 'settlement'").first().catch(() => ({ total: 0 }));

    return new Response(JSON.stringify({
      success: true,
      data: results || [],
      summary: {
        total_income: incomeTotal?.total || 0,
        total_refund: refundTotal?.total || 0,
        total_settlement: settlementTotal?.total || 0,
        net: (incomeTotal?.total || 0) - (refundTotal?.total || 0) - (settlementTotal?.total || 0)
      }
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
