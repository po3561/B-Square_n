// GET  /api/friends?user_id=xxx           -> accepted friends
// GET  /api/friends?user_id=xxx&pending=1 -> pending requests
// POST /api/friends { action, user_id, friend_id }

function trimText(value) {
  return String(value ?? '').trim();
}

function getDisplayName(row, fallbackId = '') {
  return trimText(row?.name) || trimText(row?.username) || trimText(fallbackId) || '알 수 없음';
}

function mapFriendRow(row, fallbackId = '') {
  const friendId = trimText(row?.friend_id || fallbackId);
  const name = getDisplayName(row, friendId);
  const username = trimText(row?.username);
  const email = trimText(row?.email);
  const profileImageUrl = trimText(row?.profile_image_url);

  return {
    ...row,
    friend_id: friendId,
    name,
    username,
    nickname: name,
    email,
    profile_image_url: profileImageUrl,
    display_name: name,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}

async function ensureFriendsTable(db) {
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

  await db.prepare('ALTER TABLE friends ADD COLUMN accepted_at TEXT').run().catch((error) => {
    if (!/duplicate column name/i.test(error.message || '')) throw error;
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const pending = url.searchParams.get('pending');

  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id 필수' }, 400);
  }

  try {
    await ensureFriendsTable(env.DB);

    if (pending === '1') {
      const { results } = await env.DB.prepare(`
        SELECT
          f.id,
          f.requester_id,
          f.receiver_id,
          f.status,
          f.created_at,
          f.accepted_at,
          u.id AS user_id,
          u.email,
          u.name,
          u.username,
          u.profile_image_url
        FROM friends f
        LEFT JOIN users u ON u.id = f.requester_id
        WHERE f.receiver_id = ? AND f.status = 'pending'
        ORDER BY datetime(f.created_at) DESC
      `).bind(userId).all();

      const data = (results || []).map((row) =>
        mapFriendRow(
          {
            ...row,
            friend_id: row.requester_id,
          },
          row.requester_id,
        ),
      );

      return jsonResponse({ success: true, data });
    }

    const { results } = await env.DB.prepare(`
      SELECT
        f.id,
        CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END AS friend_id,
        f.requester_id,
        f.receiver_id,
        f.status,
        f.created_at,
        f.accepted_at,
        u.id AS user_id,
        u.email,
        u.name,
        u.username,
        u.profile_image_url
      FROM friends f
      LEFT JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
      WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
      ORDER BY datetime(f.created_at) DESC
    `).bind(userId, userId, userId, userId).all();

    const data = (results || []).map((row) => mapFriendRow(row, row.friend_id));
    return jsonResponse({ success: true, data });
  } catch (err) {
    return jsonResponse({ success: false, error: '친구 조회 오류', detail: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { action, user_id, friend_id } = body;

    if (!action || !user_id) {
      return jsonResponse({ success: false, error: 'action, user_id 필수' }, 400);
    }

    await ensureFriendsTable(env.DB);

    if (action === 'request') {
      if (!friend_id) return jsonResponse({ success: false, error: 'friend_id 필수' }, 400);
      if (user_id === friend_id) return jsonResponse({ success: false, error: '자기 자신에게 요청할 수 없습니다' }, 400);

      const existing = await env.DB.prepare(`
        SELECT * FROM friends
        WHERE (requester_id = ? AND receiver_id = ?)
           OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();

      if (existing) {
        if (existing.status === 'accepted') {
          return jsonResponse({ success: false, error: '이미 친구입니다' }, 409);
        }
        if (existing.status === 'pending') {
          return jsonResponse({ success: false, error: '이미 요청이 전송되었습니다' }, 409);
        }
      }

      const id = `fr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.prepare(`
        INSERT INTO friends (id, requester_id, receiver_id, status, created_at)
        VALUES (?, ?, ?, 'pending', datetime('now'))
      `).bind(id, user_id, friend_id).run();

      return jsonResponse({ success: true, message: '친구 요청을 보냈습니다' }, 201);
    }

    if (action === 'accept') {
      if (!friend_id) return jsonResponse({ success: false, error: 'friend_id 필수' }, 400);
      const result = await env.DB.prepare(`
        UPDATE friends
        SET status = 'accepted', accepted_at = datetime('now')
        WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();

      return jsonResponse({
        success: true,
        message: '친구 요청을 수락했습니다',
        changes: result.changes || 0,
      });
    }

    if (action === 'reject') {
      if (!friend_id) return jsonResponse({ success: false, error: 'friend_id 필수' }, 400);
      const result = await env.DB.prepare(`
        DELETE FROM friends
        WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();

      return jsonResponse({
        success: true,
        message: '친구 요청을 거절했습니다',
        changes: result.changes || 0,
      });
    }

    if (action === 'remove') {
      if (!friend_id) return jsonResponse({ success: false, error: 'friend_id 필수' }, 400);
      const result = await env.DB.prepare(`
        DELETE FROM friends
        WHERE (requester_id = ? AND receiver_id = ?)
           OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).run();

      return jsonResponse({
        success: true,
        message: '친구를 삭제했습니다',
        changes: result.changes || 0,
      });
    }

    if (action === 'check') {
      if (!friend_id) return jsonResponse({ success: false, error: 'friend_id 필수' }, 400);
      const rel = await env.DB.prepare(`
        SELECT * FROM friends
        WHERE (requester_id = ? AND receiver_id = ?)
           OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();

      return jsonResponse({
        success: true,
        data: rel
          ? { status: rel.status, direction: rel.requester_id === user_id ? 'sent' : 'received' }
          : { status: 'none' },
      });
    }

    return jsonResponse({ success: false, error: '지원하지 않는 action' }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: '친구 처리 오류', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
