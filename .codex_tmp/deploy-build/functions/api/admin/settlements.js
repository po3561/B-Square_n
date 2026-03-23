import { json, options } from '../_lib/http.js';

async function ensureSettlementSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlement_info (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      ceo_name TEXT,
      biz_num TEXT,
      address TEXT,
      biz_type TEXT,
      manager_email TEXT,
      bank_name TEXT,
      bank_account TEXT,
      bank_holder TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      period_start TEXT,
      period_end TEXT,
      instructor_id TEXT,
      instructor_name TEXT,
      total_revenue INTEGER DEFAULT 0,
      platform_fee INTEGER DEFAULT 0,
      pg_fee INTEGER DEFAULT 0,
      settlement_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      settled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY,
      type TEXT,
      amount INTEGER DEFAULT 0,
      description TEXT,
      related_settlement_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'OPTIONS') return options(request, env);

  await ensureSettlementSchema(db);

  if (method === 'GET') {
    const type = url.searchParams.get('type');

    try {
      if (type === 'info') {
        const info = await db.prepare("SELECT * FROM settlement_info WHERE id = 'global'").first();
        return json(request, env, { success: true, data: info || {} });
      }

      const instructorId = url.searchParams.get('instructor_id') || '';
      const status = url.searchParams.get('status') || '';

      let sql = 'SELECT * FROM settlements WHERE 1=1';
      const params = [];

      if (instructorId) {
        sql += ' AND instructor_id = ?';
        params.push(instructorId);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';
      const { results } = await db.prepare(sql).bind(...params).all();
      return json(request, env, { success: true, data: results || [] });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();

      if (body?.type === 'info') {
        await db.prepare(`
          INSERT OR REPLACE INTO settlement_info (
            id, company_name, ceo_name, biz_num, address, biz_type,
            manager_email, bank_name, bank_account, bank_holder, updated_at
          ) VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          body.company_name || '',
          body.ceo_name || '',
          body.biz_num || '',
          body.address || '',
          body.biz_type || '',
          body.manager_email || '',
          body.bank_name || '',
          body.bank_account || '',
          body.bank_holder || '',
        ).run();

        return json(request, env, { success: true });
      }

      const id = `STL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const settlementAmount = (Number(body.total_revenue) || 0)
        - (Number(body.platform_fee) || 0)
        - (Number(body.pg_fee) || 0);

      await db.prepare(`
        INSERT INTO settlements (
          id, period_start, period_end, instructor_id, instructor_name,
          total_revenue, platform_fee, pg_fee, settlement_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        id,
        body.period_start || null,
        body.period_end || null,
        body.instructor_id || null,
        body.instructor_name || '',
        Number(body.total_revenue) || 0,
        Number(body.platform_fee) || 0,
        Number(body.pg_fee) || 0,
        settlementAmount,
        body.status || 'pending',
      ).run();

      if (body.status === 'completed') {
        const financialId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await db.prepare(`
          INSERT INTO financial_records (
            id, type, amount, description, related_settlement_id, created_at
          ) VALUES (?, 'settlement', ?, ?, ?, datetime('now'))
        `).bind(
          financialId,
          settlementAmount,
          `Settlement ${id} completed`,
          id,
        ).run();
      }

      return json(request, env, { success: true, id });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      if (!body?.id) {
        return json(request, env, { success: false, error: 'id is required' }, { status: 400 });
      }

      await db.prepare(`
        UPDATE settlements
        SET status = ?, settled_at = datetime('now')
        WHERE id = ?
      `).bind(body.status || 'completed', body.id).run();

      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
