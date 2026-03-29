// GET /api/system/history — 시스템 작업 히스토리 조회
// POST /api/system/history — 새 히스토리 등록 (내부용)

export async function onRequest(context) {
  const { request, env } = context;
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Content-Type': 'application/json' 
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { 
      headers: { 
        ...cors, 
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
        'Access-Control-Allow-Headers': 'Content-Type' 
      } 
    });
  }

  try {
    // 테이블 자동 생성
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_title TEXT NOT NULL,
        summary TEXT,
        web_url TEXT,
        deployed_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM system_history ORDER BY id DESC'
      ).all();
      return new Response(JSON.stringify({ success: true, data: results }, null, 2), { headers: cors });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { version_title, summary, web_url } = body;

      if (!version_title || !web_url) {
        return new Response(JSON.stringify({ success: false, error: 'version_title, web_url 필수' }), { status: 400, headers: cors });
      }

      await env.DB.prepare(
        'INSERT INTO system_history (version_title, summary, web_url) VALUES (?, ?, ?)'
      ).bind(version_title, summary || '', web_url).run();

      return new Response(JSON.stringify({ success: true, message: '기록 완료' }), { status: 201, headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}
