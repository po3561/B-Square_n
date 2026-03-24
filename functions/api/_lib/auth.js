import { json } from './http.js';
import { ensureAuthSchema, ensureClassesSchema } from './schema.js';

const PASSWORD_SALT = '_bsq_salt_2024';
export const MASTER_ADMIN_USER_ID = 'user_b7a935e26112';

const ROLE_RANK = {
  user: 0,
  student: 0,
  member: 0,
  instructor: 1,
  operator: 2,
  admin: 3,
  super_admin: 3,
};

const ROLE_LABEL = {
  user: '일반수강생',
  student: '일반수강생',
  member: '일반수강생',
  instructor: '강사',
  operator: '운영관리자',
  admin: '총괄운영관리자',
  super_admin: '총괄운영관리자',
};

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return 'user';
  if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
  if (['manager', 'operator_admin', 'ops'].includes(value)) return 'operator';
  if (['teacher', 'lecturer'].includes(value)) return 'instructor';
  return value in ROLE_RANK ? value : 'user';
}

export function getRoleRank(role) {
  return ROLE_RANK[normalizeRole(role)] ?? 0;
}

export function getRoleLabel(role) {
  return ROLE_LABEL[normalizeRole(role)] || ROLE_LABEL.user;
}

export function isAtLeastRole(role, minimumRole) {
  return getRoleRank(role) >= getRoleRank(minimumRole);
}

export function isMasterAdminUserId(userId) {
  return String(userId || '') === MASTER_ADMIN_USER_ID;
}

export function applyMasterAdminOverride(user) {
  if (!user || !isMasterAdminUserId(user.id)) return user;
  return {
    ...user,
    role: 'super_admin',
    membership_level: user.membership_level || 'Admin',
    operator_seq: user.operator_seq || 1,
  };
}

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
  if (cookies.bsq_session) return cookies.bsq_session;

  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  const headerToken = request.headers.get('X-Session-Token');
  if (headerToken) return headerToken.trim();

  return null;
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
  const parts = [
    `bsq_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];

  if (url.protocol === 'https:') parts.push('Secure');
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

  await ensureAuthSchema(env.DB);
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
      u.operator_seq,
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

  const user = applyMasterAdminOverride({
    id: session.id,
    email: session.email,
    name: session.name,
    username: session.username,
    phone: session.phone,
    profile_image_url: session.profile_image_url,
    role: session.role,
    operator_seq: session.operator_seq,
    membership_level: session.membership_level,
    birth_year: session.birth_year,
    birth_month: session.birth_month,
    birth_day: session.birth_day,
    gender: session.gender,
    nationality: session.nationality,
  });

  return {
    session: {
      id: session.session_id,
      token: session.token,
      expires_at: session.expires_at,
    },
    user,
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

  if (!isAtLeastRole(current.user.role, 'admin')) {
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

  await ensureAuthSchema(context.env.DB);
  await ensureClassesSchema(context.env.DB);

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
        error: '대상을 찾을 수 없습니다.',
      }, { status: 404 }),
    };
  }

  const userId = current.user.id;
  if (
    isAtLeastRole(current.user.role, 'operator') ||
    cls.creator_id === userId ||
    hasSubInstructorAccess(cls.sub_instructors, userId)
  ) {
    return current;
  }

  return {
    ok: false,
    response: json(context.request, context.env, {
      success: false,
      error: '클래스 관리 권한이 필요합니다.',
    }, { status: 403 }),
  };
}

function hasSubInstructorAccess(rawValue, userId) {
  const targetId = String(userId || '').trim();
  if (!targetId) return false;

  const matches = (value) => String(value || '').trim() === targetId;

  if (Array.isArray(rawValue)) {
    return rawValue.some((item) => matches(item?.id ?? item?.user_id ?? item));
  }

  const rawText = String(rawValue || '').trim();
  if (!rawText) return false;

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed.some((item) => matches(item?.id ?? item?.user_id ?? item));
    }
  } catch {
    // fall through to delimited string matching
  }

  return rawText
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .some(matches);
}
