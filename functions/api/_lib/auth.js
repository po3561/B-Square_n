import { json } from './http.js';
import { normalizeLanguagePreference, normalizeThemePreference } from './preferences.js';
import { ensureAuthSchema } from './schema.js';

const PASSWORD_SALT = '_bsq_salt_2024';
export const MASTER_ADMIN_USER_ID = 'user_b7a935e26112';
const OPERATOR_GHOST_TOKEN = 'OPERATOR_GHOST';

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

// cookie helpers will be extended below

export function getSessionToken(request) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  if (cookies.bsq_session) return cookies.bsq_session;

  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  const headerToken = request.headers.get('X-Session-Token');
  if (headerToken) return headerToken.trim();

  try {
    const url = new URL(request.url);
    const queryToken =
      url.searchParams.get('session')
      || url.searchParams.get('token')
      || url.searchParams.get('bsq_token')
      || url.searchParams.get('session_token');
    if (queryToken) {
      const accept = String(request.headers.get('Accept') || '').toLowerCase();
      const streamFlag = String(url.searchParams.get('stream') || '').toLowerCase();
      const isStreamRequest =
        accept.includes('text/event-stream')
        || streamFlag === '1'
        || streamFlag === 'true'
        || streamFlag === 'yes'
        || url.pathname.endsWith('/messages/stream');
      if (isStreamRequest) return queryToken.trim();
    }
  } catch {
    // ignore URL parsing issues
  }

  return null;
}

function parseBooleanEnv(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function getCookieDomain(env) {
  const raw = String(env?.COOKIE_DOMAIN || '').trim();
  if (!raw) return '';

  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname;
  } catch {
    return raw.replace(/^\.+/, '').trim();
  }
}

function shouldUseSecureCookies(request, env) {
  const explicit = parseBooleanEnv(env?.COOKIE_SECURE);
  if (explicit !== null) return explicit;

  try {
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;
  } catch {
    // ignore URL parsing failures and fall back to forwarded proto
  }

  return String(request.headers.get('x-forwarded-proto') || '').toLowerCase() === 'https';
}

export function serializeCookie(name, value, request, env, options = {}) {
  const parts = [`${name}=${value ?? ''}`];
  const path = options.path || '/';
  const maxAge = Number.isFinite(options.maxAge) ? Math.max(0, Math.floor(options.maxAge)) : null;
  const sameSite = options.sameSite || 'Lax';

  parts.push(`Path=${path}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);

  const domain = options.domain || getCookieDomain(env);
  if (domain) parts.push(`Domain=${domain}`);

  if (options.secure ?? shouldUseSecureCookies(request, env)) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function clearCookie(name, request, env, options = {}) {
  return serializeCookie(name, '', request, env, {
    ...options,
    maxAge: 0,
  });
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createSessionCookie(token, request, env) {
  return serializeCookie('bsq_session', token, request, env, {
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(request, env) {
  return clearCookie('bsq_session', request, env);
}

async function getLatestSocialProvider(db, userId) {
  try {
    const row = await db.prepare(`
      SELECT provider, provider_user_id
      FROM social_accounts
      WHERE user_id = ?
      ORDER BY datetime(COALESCE(last_login_at, linked_at, created_at)) DESC, datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 1
    `).bind(userId).first();
    return row || null;
  } catch {
    return null;
  }
}

export async function createSessionRecord(
  db,
  userId,
  {
    ttlMs = 30 * 24 * 60 * 60 * 1000,
    authProvider = null,
    authProviderUserId = null,
  } = {},
) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND unixepoch(expires_at) < unixepoch(\'now\')').bind(userId).run();

  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at, auth_provider, auth_provider_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, userId, token, expiresAt, authProvider, authProviderUserId).run();

  return {
    id: sessionId,
    token,
    expires_at: expiresAt,
  };
}

export async function getCurrentUser(context) {
  const { request, env } = context;
  await ensureAuthSchema(env.DB);
  const token = getSessionToken(request);
  if (!token) return null;

  if (token === OPERATOR_GHOST_TOKEN) {
    const ghostUser = applyMasterAdminOverride({
      id: OPERATOR_GHOST_TOKEN,
      email: 'operator@b-square.kr',
      name: '운영자',
      username: 'operator',
      profile_image_url: '/assets/default-avatar.svg',
      role: 'super_admin',
      operator_seq: 1,
      membership_level: 'Admin',
      preferred_language: normalizeLanguagePreference('ko'),
      preferred_theme: normalizeThemePreference('light'),
      mfa_active: 0,
      marketing_sms_consent: 0,
      marketing_email_consent: 0,
      marketing_consent_updated_at: null,
      referrer_code: null,
    });

    return {
      session: {
        id: 'ghost_session',
        token,
        expires_at: '2099-12-31T23:59:59.000Z',
      },
      user: ghostUser,
    };
  }

  const queryWithAuthProvider = `
    SELECT
      s.id AS session_id,
      s.token,
      s.expires_at,
      s.auth_provider,
      s.auth_provider_user_id,
      u.id,
      u.email,
      u.name,
      u.username,
      u.phone,
      u.profile_image_url,
      u.role,
      u.signup_path,
      u.operator_seq,
      u.membership_level,
      u.preferred_language,
      u.preferred_theme,
      u.mfa_active,
      u.marketing_sms_consent,
      u.marketing_email_consent,
      u.marketing_consent_updated_at,
      u.referrer_code,
      u.birth_year,
      u.birth_month,
      u.birth_day,
      u.gender,
      u.nationality
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
      AND unixepoch(s.expires_at) > unixepoch('now')
  `;

  let session = null;
  try {
    session = await env.DB.prepare(queryWithAuthProvider).bind(token).first();
  } catch (error) {
    const message = String(error?.message || '');
    if (!/auth_provider/i.test(message) && !/no such column/i.test(message)) {
      throw error;
    }

    session = await env.DB.prepare(`
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
        u.signup_path,
        u.operator_seq,
        u.membership_level,
        u.preferred_language,
        u.preferred_theme,
        u.mfa_active,
        u.marketing_sms_consent,
        u.marketing_email_consent,
        u.marketing_consent_updated_at,
        u.referrer_code,
        u.birth_year,
        u.birth_month,
        u.birth_day,
        u.gender,
        u.nationality
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
        AND unixepoch(s.expires_at) > unixepoch('now')
    `).bind(token).first();

    if (session) {
      session.auth_provider = null;
      session.auth_provider_user_id = null;
    }
  }

  if (!session) return null;

  const user = applyMasterAdminOverride({
    id: session.id,
    email: session.email,
    name: session.name,
    username: session.username,
    phone: session.phone,
    profile_image_url: session.profile_image_url,
    role: session.role,
    signup_path: session.signup_path,
    operator_seq: session.operator_seq,
    membership_level: session.membership_level,
    preferred_language: normalizeLanguagePreference(session.preferred_language),
    preferred_theme: normalizeThemePreference(session.preferred_theme),
    mfa_active: session.mfa_active,
    marketing_sms_consent: session.marketing_sms_consent ?? 0,
    marketing_email_consent: session.marketing_email_consent ?? 0,
    marketing_consent_updated_at: session.marketing_consent_updated_at || null,
    referrer_code: session.referrer_code,
    birth_year: session.birth_year,
    birth_month: session.birth_month,
    birth_day: session.birth_day,
    gender: session.gender,
    nationality: session.nationality,
    auth_provider: session.auth_provider || null,
    auth_provider_user_id: session.auth_provider_user_id || null,
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

export function hasSubInstructorAccess(rawValue, userId) {
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
