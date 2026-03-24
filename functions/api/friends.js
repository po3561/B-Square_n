// GET  /api/friends?user_id=xxx           → 친구 목록 조회
// GET  /api/friends?user_id=xxx&pending=1  → 받은 요청 목록
// POST /api/friends { action, user_id, friend_id }

export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const pending = url.searchParams.get('pending');

  if (!userId) {
    return new Response(JSON.stringify({ success: false, error: 'user_id 필수' }), { status: 400, headers: cors });
  }

  try {
    await ensureFriendsTable(env.DB);

    if (pending === '1') {
      // 받은 친구 요청 — users 테이블 없을 수도 있으므로 안전하게 처리
      try {
        const { results } = await env.DB.prepare(`
          SELECT f.*, u.username, u.name, u.nickname, u.profile_image_url
          FROM friends f
          LEFT JOIN users u ON u.id = f.requester_id
          WHERE f.receiver_id = ? AND f.status = 'pending'
          ORDER BY f.created_at DESC
        `).bind(userId).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      } catch (joinErr) {
        // users 테이블 JOIN 실패 시 friends만 조회
        const { results } = await env.DB.prepare(`
          SELECT * FROM friends WHERE receiver_id = ? AND status = 'pending' ORDER BY created_at DESC
        `).bind(userId).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      }
    }

    // 친구 목록 (수락된 것들)
    try {
      const { results } = await env.DB.prepare(`
        SELECT 
          CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END as friend_id,
          f.status, f.created_at,
          u.username, u.name, u.nickname, u.email, u.profile_image_url
        FROM friends f
        LEFT JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
        WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
        ORDER BY f.created_at DESC
      `).bind(userId, userId, userId, userId).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    } catch (joinErr) {
      // fallback: friends만
      const { results } = await env.DB.prepare(`
        SELECT 
          CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END as friend_id,
          status, created_at
        FROM friends
        WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'
        ORDER BY created_at DESC
      `).bind(userId, userId, userId).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '친구 조회 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const { action, user_id, friend_id } = body;

    if (!action || !user_id) {
      return new Response(JSON.stringify({ success: false, error: 'action, user_id 필수' }), { status: 400, headers: cors });
    }

    await ensureFriendsTable(env.DB);

    if (action === 'request') {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: 'friend_id 필수' }), { status: 400, headers: cors });
      if (user_id === friend_id) return new Response(JSON.stringify({ success: false, error: '자기 자신에게 요청할 수 없습니다' }), { status: 400, headers: cors });

      const existing = await env.DB.prepare(`
        SELECT * FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();

      if (existing) {
        if (existing.status === 'accepted') return new Response(JSON.stringify({ success: false, error: '이미 친구입니다' }), { headers: cors });
        if (existing.status === 'pending') return new Response(JSON.stringify({ success: false, error: '이미 요청이 전송되었습니다' }), { headers: cors });
      }

      const id = 'fr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await env.DB.prepare(`
        INSERT INTO friends (id, requester_id, receiver_id, status, created_at)
        VALUES (?, ?, ?, 'pending', datetime('now'))
      `).bind(id, user_id, friend_id).run();

      return new Response(JSON.stringify({ success: true, message: '친구 요청을 보냈습니다' }), { headers: cors });
    }

    if (action === 'accept') {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: 'friend_id 필수' }), { status: 400, headers: cors });
      await env.DB.prepare(`
        UPDATE friends SET status = 'accepted', accepted_at = datetime('now')
        WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: '친구 요청을 수락했습니다' }), { headers: cors });
    }

    if (action === 'reject') {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: 'friend_id 필수' }), { status: 400, headers: cors });
      await env.DB.prepare(`
        DELETE FROM friends WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: '친구 요청을 거절했습니다' }), { headers: cors });
    }

    if (action === 'remove') {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: 'friend_id 필수' }), { status: 400, headers: cors });
      await env.DB.prepare(`
        DELETE FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: '친구가 삭제되었습니다' }), { headers: cors });
    }

    if (action === 'check') {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: 'friend_id 필수' }), { status: 400, headers: cors });
      const rel = await env.DB.prepare(`
        SELECT * FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();
      return new Response(JSON.stringify({
        success: true,
        data: rel ? { status: rel.status, direction: rel.requester_id === user_id ? 'sent' : 'received' } : { status: 'none' }
      }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: false, error: '알 수 없는 action' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '친구 처리 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

async function ensureFriendsTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        accepted_at TEXT,
        UNIQUE(requester_id, receiver_id)
      )
    `).run();
  } catch (e) { /* already exists */ }
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
