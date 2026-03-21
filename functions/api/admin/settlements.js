// functions/api/admin/settlements.js — 정산 관리 API
// GET  /api/admin/settlements — 정산 내역 조회
// POST /api/admin/settlements — 정산 생성
// GET  /api/admin/settlements?type=info — 정산 정보 조회
// PUT  /api/admin/settlements — 정산 정보 수정

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  // GET: 정산 내역 또는 정산 정보
  if (method === 'GET') {
    const type = url.searchParams.get('type');

    // 정산 정보 조회
    if (type === 'info') {
      try {
        let info = await db.prepare("SELECT * FROM settlement_info WHERE id = 'global'").first();
        if (!info) info = {};
        return new Response(JSON.stringify({ success: true, data: info }), { headers: CORS });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
      }
    }

    // 정산 내역 조회
    try {
      const instructorId = url.searchParams.get('instructor_id') || '';
      const status = url.searchParams.get('status') || '';

      let sql = 'SELECT * FROM settlements WHERE 1=1';
      const params = [];
      if (instructorId) { sql += ' AND instructor_id = ?'; params.push(instructorId); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY created_at DESC';

      const { results } = await db.prepare(sql).bind(...params).all();
      return new Response(JSON.stringify({ success: true, data: results || [] }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // POST: 정산 생성
  if (method === 'POST') {
    try {
      const body = await request.json();

      // 정산 정보 저장
      if (body.type === 'info') {
        await db.prepare(`
          INSERT OR REPLACE INTO settlement_info (id, company_name, ceo_name, biz_num, address, biz_type, manager_email, bank_name, bank_account, bank_holder, updated_at)
          VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          body.company_name || '', body.ceo_name || '', body.biz_num || '',
          body.address || '', body.biz_type || '', body.manager_email || '',
          body.bank_name || '', body.bank_account || '', body.bank_holder || ''
        ).run();
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // 정산 내역 생성
      const id = 'STL' + Date.now() + Math.random().toString(36).substr(2, 4);
      const settlementAmount = (body.total_revenue || 0) - (body.platform_fee || 0) - (body.pg_fee || 0);

      await db.prepare(`
        INSERT INTO settlements (id, period_start, period_end, instructor_id, instructor_name, total_revenue, platform_fee, pg_fee, settlement_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        id, body.period_start, body.period_end,
        body.instructor_id || null, body.instructor_name || '',
        body.total_revenue || 0, body.platform_fee || 0, body.pg_fee || 0,
        settlementAmount, body.status || 'pending'
      ).run();

      // 출금 기록 (완료 시)
      if (body.status === 'completed') {
        const fId = 'FR' + Date.now() + Math.random().toString(36).substr(2, 4);
        await db.prepare(`
          INSERT INTO financial_records (id, type, amount, description, related_settlement_id, created_at)
          VALUES (?, 'settlement', ?, ?, ?, datetime('now'))
        `).bind(fId, settlementAmount, `정산 ${id} 출금`, id).run();
      }

      return new Response(JSON.stringify({ success: true, id }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // PUT: 정산 상태 업데이트
  if (method === 'PUT') {
    try {
      const body = await request.json();
      if (body.id) {
        await db.prepare("UPDATE settlements SET status = ?, settled_at = datetime('now') WHERE id = ?")
          .bind(body.status || 'completed', body.id).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
}
