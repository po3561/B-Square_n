import { json, options } from '../_lib/http.js';

async function ensureMenuSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS menu_settings (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      target TEXT DEFAULT '_self',
      visible INTEGER DEFAULT 1,
      audience TEXT DEFAULT 'all',
      sort_order INTEGER DEFAULT 0
    )
  `).run();
}

const DEFAULT_MENUS = [
  { id: 'menu_home', label: '홈', href: '/', sort_order: 0 },
  { id: 'menu_class', label: '클래스', href: '/programs', sort_order: 1 },
  { id: 'menu_notice', label: '공지 / FAQ', href: '/notice', sort_order: 2 },
];

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  await ensureMenuSchema(db);

  if (method === 'GET') {
    try {
      const { results } = await db.prepare('SELECT * FROM menu_settings ORDER BY sort_order ASC').all();

      if (!results || results.length === 0) {
        for (const menu of DEFAULT_MENUS) {
          await db.prepare(`
            INSERT OR IGNORE INTO menu_settings (id, label, href, target, visible, audience, sort_order)
            VALUES (?, ?, ?, '_self', 1, 'all', ?)
          `).bind(menu.id, menu.label, menu.href, menu.sort_order).run();
        }
        return json(request, env, { success: true, data: DEFAULT_MENUS });
      }

      return json(request, env, { success: true, data: results });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      const menus = Array.isArray(body) ? body : (body?.menus || []);

      await db.prepare('DELETE FROM menu_settings').run();

      for (let i = 0; i < menus.length; i += 1) {
        const menu = menus[i] || {};
        const id = menu.id || `menu_${Date.now()}_${i}`;

        await db.prepare(`
          INSERT INTO menu_settings (id, label, href, target, visible, audience, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          menu.label || '',
          menu.href || '#',
          menu.target || '_self',
          menu.visible === false ? 0 : 1,
          menu.audience || 'all',
          Number.isFinite(Number(menu.sort_order)) ? Number(menu.sort_order) : i,
        ).run();
      }

      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
