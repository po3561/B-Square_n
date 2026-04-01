import { clearCookie, parseCookies, serializeCookie } from './auth.js';

const SOCIAL_VERIFICATION_TTL_MS = 10 * 60 * 1000;

const SOCIAL_VERIFICATION_COOKIE_NAMES = {
  signup: 'bsq_oauth_signup_verification',
  recovery: 'bsq_oauth_recovery_verification',
};

const SOCIAL_VERIFICATION_PURPOSES = new Set(['login', 'signup', 'recovery']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeSocialPurpose(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SOCIAL_VERIFICATION_PURPOSES.has(normalized) ? normalized : 'login';
}

export function getSocialVerificationCookieName(purpose) {
  return SOCIAL_VERIFICATION_COOKIE_NAMES[normalizeSocialPurpose(purpose)] || '';
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

function serializeProfile(profile) {
  const safeProfile = {
    provider: normalizeText(profile?.provider),
    provider_user_id: normalizeText(profile?.provider_user_id),
    provider_email: normalizeText(profile?.provider_email || profile?.email),
    email_verified: Boolean(profile?.email_verified),
    name: normalizeText(profile?.name),
    nickname: normalizeText(profile?.nickname),
    avatar_url: normalizeText(profile?.avatar_url),
    locale: normalizeText(profile?.locale),
  };

  return safeProfile;
}

export async function createSocialVerification(db, {
  purpose = 'signup',
  profile,
  userId = null,
  returnTo = '/',
  ttlMs = SOCIAL_VERIFICATION_TTL_MS,
} = {}) {
  const normalizedPurpose = normalizeSocialPurpose(purpose);
  if (normalizedPurpose === 'login') {
    throw new Error('login purpose should not create a pending verification');
  }

  const safeProfile = serializeProfile(profile);
  const rawToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(rawToken);
  const verificationId = `sv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db.prepare(`
    INSERT INTO social_verifications (
      id, token_hash, purpose, provider, provider_user_id, user_id,
      provider_email, email_verified, provider_name, provider_nickname,
      provider_avatar_url, provider_locale, return_to, expires_at,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    verificationId,
    tokenHash,
    normalizedPurpose,
    safeProfile.provider,
    safeProfile.provider_user_id,
    userId || null,
    safeProfile.provider_email || null,
    safeProfile.email_verified ? 1 : 0,
    safeProfile.name || null,
    safeProfile.nickname || null,
    safeProfile.avatar_url || null,
    safeProfile.locale || null,
    normalizeText(returnTo) || '/',
    expiresAt,
  ).run();

  return {
    id: verificationId,
    token: rawToken,
    token_hash: tokenHash,
    purpose: normalizedPurpose,
    ...safeProfile,
    return_to: normalizeText(returnTo) || '/',
    expires_at: expiresAt,
  };
}

export async function loadSocialVerification(db, request, purpose) {
  const normalizedPurpose = normalizeSocialPurpose(purpose);
  if (normalizedPurpose === 'login') return null;

  const cookieName = getSocialVerificationCookieName(normalizedPurpose);
  const token = normalizeText(parseCookies(request.headers.get('Cookie'))[cookieName]);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`
    SELECT *
    FROM social_verifications
    WHERE token_hash = ?
      AND purpose = ?
      AND used_at IS NULL
      AND unixepoch(expires_at) > unixepoch('now')
    LIMIT 1
  `).bind(tokenHash, normalizedPurpose).first();

  return row || null;
}

export async function consumeSocialVerification(db, request, purpose) {
  const row = await loadSocialVerification(db, request, purpose);
  if (!row) return null;

  await db.prepare('UPDATE social_verifications SET used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(row.id)
    .run();

  return row;
}

export function clearSocialVerificationCookie(request, env, purpose) {
  const normalizedPurpose = normalizeSocialPurpose(purpose);
  if (normalizedPurpose === 'login') return null;
  const cookieName = getSocialVerificationCookieName(normalizedPurpose);
  return clearCookie(cookieName, request, env, { path: '/api/auth' });
}

export async function buildSocialVerificationCookie(value, request, env, purpose) {
  const normalizedPurpose = normalizeSocialPurpose(purpose);
  if (normalizedPurpose === 'login') return null;
  const cookieName = getSocialVerificationCookieName(normalizedPurpose);
  return serializeCookie(cookieName, value, request, env, {
    path: '/api/auth',
    maxAge: SOCIAL_VERIFICATION_TTL_MS / 1000,
    sameSite: 'Lax',
    httpOnly: true,
  });
}

export function sanitizeSocialVerificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    purpose: row.purpose,
    provider: row.provider,
    provider_user_id: row.provider_user_id,
    user_id: row.user_id || null,
    provider_email: row.provider_email || null,
    email_verified: Boolean(row.email_verified),
    provider_name: row.provider_name || null,
    provider_nickname: row.provider_nickname || null,
    provider_avatar_url: row.provider_avatar_url || null,
    provider_locale: row.provider_locale || null,
    return_to: row.return_to || '/',
    expires_at: row.expires_at || null,
    used_at: row.used_at || null,
  };
}
