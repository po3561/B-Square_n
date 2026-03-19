// GET /api/auth/session — 현재 세션 확인
// DELETE /api/auth/session — 로그아웃

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...val] = c.trim().split('=');
    if (key) cookies[key] = val.join('=');
  });
  return cookies;
}

function getToken(request) {
  // 1. Cookie에서 토큰
  const cookies = parseCookies(request.headers.get('Cookie'));
  if (cookies.bsq_session) return cookies.bsq_session;
  // 2. Authorization 헤더에서 토큰
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  // 3. 쿼리 파라미터에서 토큰
  const url = new URL(request.url);
  return url.searchParams.get('token');
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const token = getToken(request);
    if (!token) {
      return new Response(JSON.stringify({ success: true, data: { session: null } }), { headers: cors });
    }

    const session = await env.DB.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.name, u.username, u.phone,
             u.profile_image_url, u.role, u.membership_level,
             u.birth_year, u.birth_month, u.birth_day, u.gender, u.nationality
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(token).first();

    if (!session) {
      return new Response(JSON.stringify({ success: true, data: { session: null } }), {
        headers: {
          ...cors,
          'Set-Cookie': 'bsq_session=; Path=/; Max-Age=0'
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        session: {
          user: {
            id: session.user_id,
            email: session.email,
            name: session.name,
            username: session.username,
            phone: session.phone,
            profile_image_url: session.profile_image_url,
            role: session.role,
            membership_level: session.membership_level,
            birth_year: session.birth_year,
            birth_month: session.birth_month,
            birth_day: session.birth_day,
            gender: session.gender,
            nationality: session.nationality
          },
          expires_at: session.expires_at
        }
      }
    }), { headers: cors });

  } catch (err) {
    console.error('Session check error:', err);
    return new Response(JSON.stringify({ success: false, error: '세션 확인 중 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const token = getToken(request);
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }

    return new Response(JSON.stringify({ success: true, message: '로그아웃 완료' }), {
      headers: {
        ...cors,
        'Set-Cookie': 'bsq_session=; Path=/; Max-Age=0'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: '로그아웃 처리 중 오류' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
