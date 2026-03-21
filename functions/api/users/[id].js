// GET /api/users/:id — 유저 프로필 조회
// PUT /api/users/:id — 프로필 수정
export async function onRequestGet(context) {
  const { env, params } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const userId = params.id;

  try {
    const user = await env.DB.prepare(
      'SELECT id, email, name, username, phone, profile_image_url, role, membership_level, birth_year, birth_month, birth_day, gender, nationality, sns_link, preferred_category, created_at FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: '사용자를 찾을 수 없습니다.' }), { status: 404, headers: cors });
    }

    return new Response(JSON.stringify({ success: true, data: user }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '프로필 조회 중 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const userId = params.id;

  try {
    const body = await request.json();
    const allowedFields = ['name', 'phone', 'profile_image_url', 'sns_link', 'preferred_category', 'birth_year', 'birth_month', 'birth_day', 'gender', 'nationality', 'role'];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    // 비밀번호 변경
    if (body.new_password) {
      if (body.new_password.length < 8) {
        return new Response(JSON.stringify({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' }), { status: 400, headers: cors });
      }
      const encoder = new TextEncoder();
      const data = encoder.encode(body.new_password + '_bsq_salt_2024');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      updates.push('password_hash = ?');
      values.push(password_hash);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '수정할 항목이 없습니다.' }), { status: 400, headers: cors });
    }

    updates.push('updated_at = datetime("now")');
    values.push(userId);

    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    const updated = await env.DB.prepare(
      'SELECT id, email, name, username, phone, profile_image_url, role, membership_level FROM users WHERE id = ?'
    ).bind(userId).first();

    return new Response(JSON.stringify({ success: true, data: updated }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '프로필 수정 중 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const userId = params.id;

  try {
    // Delete user
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    // Also delete associated sessions
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

    return new Response(JSON.stringify({ success: true, message: '사용자가 삭제되었습니다.' }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '사용자 삭제 중 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
