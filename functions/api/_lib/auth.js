import { json } from './http.js';

const PASSWORD_SALT = '_bsq_salt_2024';

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return;
    cookies[key] = rest.join('=');
  });

  return cookies;
}

export function getSessionToken(request) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  return cookies.bsq_session || null;
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createSessionCookie(token, request) {
  const url = new URL(request.url);
  const isSecure = url.protocol === 'https:';
  const parts = [
    `bsq_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];

  if (isSecure) parts.push('Secure');

  return parts.join('; ');
}

export function clearSessionCookie(request) {
  const url = new URL(request.url);
  const parts = [
    'bsq_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (url.protocol === 'https:') parts.push('Secure');

  return parts.join('; ');
}

export async function getCurrentUser(context) {
  const { request, env } = context;
  const token = getSessionToken(request);
  if (!token) return null;

  const session = await env.DB.prepare(`
    SELECT
      s.id AS session_id,
      s.token,
      s.expires_at,
      u.id,
      u.email,
      u.name,
      u.username,
      u.phone,
      u.profile_image_url,
      u.role,
      u.membership_level,
      u.birth_year,
      u.birth_month,
      u.birth_day,
      u.gender,
      u.nationality
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
      AND s.expires_at > datetime('now')
  `).bind(token).first();

  if (!session) return null;

  return {
    session: {
      id: session.session_id,
      token: session.token,
      expires_at: session.expires_at,
    },
    user: {
      id: session.id,
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
      nationality: session.nationality,
    },
  };
}

export async function requireSession(context) {
  const current = await getCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: '로그인이 필요합니다.',
      }, { status: 401 }),
    };
  }

  return { ok: true, ...current };
}

export async function requireAdmin(context) {
  const current = await requireSession(context);
  if (!current.ok) return current;

  if (current.user.role !== 'admin') {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: '관리자 권한이 필요합니다.',
      }, { status: 403 }),
    };
  }

  return current;
}

export async function requireClassManager(context, classId) {
  const current = await requireSession(context);
  if (!current.ok) return current;

  const cls = await context.env.DB.prepare(`
    SELECT id, creator_id, sub_instructors
    FROM classes
    WHERE id = ?
  `).bind(classId).first();

  if (!cls) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: '클래스를 찾을 수 없습니다.',
      }, { status: 404 }),
    };
  }

  let subInstructors = [];
  try {
    subInstructors = JSON.parse(cls.sub_instructors || '[]');
  } catch {}

  const isManager = current.user.role === 'admin'
    || cls.creator_id === current.user.id
    || subInstructors.some((item) => item?.id === current.user.id);

  if (!isManager) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: '클래스 관리 권한이 없습니다.',
      }, { status: 403 }),
    };
  }

  return { ...current, classRecord: cls };
}
