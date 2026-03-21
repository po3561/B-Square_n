// functions/api/admin/menus.js — 메뉴 설정 API
// GET /api/admin/menus — 메뉴 목록
// PUT /api/admin/menus — 메뉴 일괄 업데이트

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode',
  'Content-Type': 'application/json'
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  // GET: 메뉴 목록
  if (method === 'GET') {
    try {
      const { results } = await db.prepare('SELECT * FROM menu_settings ORDER BY sort_order ASC').all();

      // 테이블이 비어있으면 기본 메뉴 삽입
      if (!results || results.length === 0) {
        const defaults = [
          { id: 'menu_home', label: '홈', href: '/', sort_order: 0 },
          { id: 'menu_class', label: '클래스', href: '/programs', sort_order: 1 },
          { id: 'menu_notice', label: '공지사항/FAQ', href: '/notice', sort_order: 2 }
        ];
        for (const m of defaults) {
          await db.prepare('INSERT OR IGNORE INTO menu_settings (id, label, href, sort_order) VALUES (?, ?, ?, ?)')
            .bind(m.id, m.label, m.href, m.sort_order).run();
        }
        return new Response(JSON.stringify({ success: true, data: defaults }), { headers: CORS });
      }

      return new Response(JSON.stringify({ success: true, data: results }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  // PUT: 메뉴 일괄 업데이트
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const menus = Array.isArray(body) ? body : (body.menus || []);

      // 기존 메뉴 전부 삭제 후 재삽입
      await db.prepare('DELETE FROM menu_settings').run();

      for (let i = 0; i < menus.length; i++) {
        const m = menus[i];
        const id = m.id || ('menu_' + Date.now() + i);
        await db.prepare(`
          INSERT INTO menu_settings (id, label, href, target, visible, audience, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(id, m.label || '', m.href || '', m.target || '_self', m.visible !== undefined ? (m.visible ? 1 : 0) : 1, m.audience || 'all', i).run();
      }

      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
}
