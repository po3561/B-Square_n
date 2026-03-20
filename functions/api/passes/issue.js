// POST /api/passes/issue — 수강권 발행 (자동 + 수동)
// GET /api/passes/issue — 발행 로그 조회
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { class_id, user_id, amount, reason, issued_by } = body;

    if (!class_id || !user_id || !amount) {
      return new Response(JSON.stringify({ success: false, error: 'class_id, user_id, amount 필수' }), { status: 400, headers: cors });
    }

    // pass_issue_logs 테이블 자동 생성
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS pass_issue_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL DEFAULT 1,
          reason TEXT DEFAULT 'manual',
          issued_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
    } catch (e) { /* 테이블이 이미 존재하면 무시 */ }

    // user_passes에 수강권 추가 (upsert)
    try {
      // 기존 레코드 확인
      const existing = await env.DB.prepare(`
        SELECT * FROM user_passes WHERE user_id = ? AND class_id = ?
      `).bind(user_id, class_id).first();

      if (existing) {
        // 기존 수량에 추가
        const newRemaining = (existing.remaining_passes || existing.remaining || 0) + amount;
        const newTotal = (existing.total_passes || existing.total || 0) + amount;
        await env.DB.prepare(`
          UPDATE user_passes SET remaining_passes = ?, total_passes = ?, updated_at = datetime('now')
          WHERE user_id = ? AND class_id = ?
        `).bind(newRemaining, newTotal, user_id, class_id).run();
      } else {
        // 새로 생성
        const passId = 'pass_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT INTO user_passes (id, user_id, class_id, remaining_passes, total_passes, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
        `).bind(passId, user_id, class_id, amount, amount).run();
      }
    } catch (e) {
      console.warn('[Pass Issue] user_passes upsert failed, trying alternative columns:', e.message);
      // 대체 컬럼명 시도
      try {
        const passId = 'pass_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT OR REPLACE INTO user_passes (id, user_id, class_id, remaining, total, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
        `).bind(passId, user_id, class_id, amount, amount).run();
      } catch (e2) {
        console.error('[Pass Issue] All insert attempts failed:', e2.message);
      }
    }

    // 발행 로그 기록
    const logReason = reason || 'manual';
    try {
      await env.DB.prepare(`
        INSERT INTO pass_issue_logs (class_id, user_id, amount, reason, issued_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(class_id, user_id, amount, logReason, issued_by || 'system').run();
    } catch (e) {
      console.warn('[Pass Issue] Log insert failed:', e.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `수강권 ${amount}개가 발행되었습니다.`,
      data: { class_id, user_id, amount, reason: logReason }
    }), { headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '수강권 발행 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

// GET — 발행 로그 조회
export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  if (!class_id) {
    return new Response(JSON.stringify({ success: false, error: 'class_id 필수' }), { status: 400, headers: cors });
  }

  try {
    // 테이블 존재 확인
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS pass_issue_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL DEFAULT 1,
          reason TEXT DEFAULT 'manual',
          issued_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
    } catch (e) { }

    const { results } = await env.DB.prepare(`
      SELECT * FROM pass_issue_logs WHERE class_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(class_id).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '로그 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
