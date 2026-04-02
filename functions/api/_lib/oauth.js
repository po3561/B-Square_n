import {
  clearCookie,
  clearSessionCookie,
  createSessionCookie,
  createSessionRecord,
  getSessionToken,
  parseCookies,
  serializeCookie,
} from './auth.js';
import { json } from './http.js';
import { ensureAuthSchema } from './schema.js';
import { normalizeLanguagePreference, normalizeThemePreference } from './preferences.js';
import {
  buildSocialVerificationCookie,
  clearSocialVerificationCookie,
  createSocialVerification,
  normalizeSocialPurpose,
  sanitizeSocialVerificationRow,
} from './social_verification.js';

const PROVIDER_ORDER = ['kakao', 'naver', 'google'];
const SYNTHETIC_EMAIL_DOMAIN = 'social.b-square.invalid';
const STATE_TTL_MS = 10 * 60 * 1000;
const LOGOUT_TTL_MS = 5 * 60 * 1000;

const PROVIDERS = {
  kakao: {
    id: 'kakao',
    label: '카카오',
    authorizeEndpoint: 'https://kauth.kakao.com/oauth/authorize',
    tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
    profileEndpoint: 'https://kapi.kakao.com/v2/user/me',
    logoutEndpoint: 'https://kauth.kakao.com/oauth/logout',
    clientIdKey: 'KAKAO_REST_API_KEY',
    clientSecretKey: 'KAKAO_CLIENT_SECRET',
    redirectUriKey: 'KAKAO_REDIRECT_URI',
    logoutRedirectUriKey: 'KAKAO_LOGOUT_REDIRECT_URI',
    publicKeyKey: 'KAKAO_JS_KEY',
    callbackPath: '/auth/kakao/callback',
    logoutPath: '/auth/kakao/logout',
    stateCookieName: 'bsq_oauth_state_kakao',
    logoutCookieName: 'bsq_oauth_logout_kakao',
    tokenMethod: 'POST',
    // Kakao expects comma-separated scopes on the authorization request.
    scope: 'profile_nickname,profile_image,account_email',
  },
  naver: {
    id: 'naver',
    label: '네이버',
    authorizeEndpoint: 'https://nid.naver.com/oauth2.0/authorize',
    tokenEndpoint: 'https://nid.naver.com/oauth2.0/token',
    profileEndpoint: 'https://openapi.naver.com/v1/nid/me',
    clientIdKey: 'NAVER_CLIENT_ID',
    clientSecretKey: 'NAVER_CLIENT_SECRET',
    redirectUriKey: 'NAVER_REDIRECT_URI',
    callbackPath: '/auth/naver/callback',
    logoutPath: '/auth/naver/logout',
    stateCookieName: 'bsq_oauth_state_naver',
    tokenMethod: 'GET',
    scope: 'name email profile_image',
  },
  google: {
    id: 'google',
    label: '구글',
    authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    profileEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    clientIdKey: 'GOOGLE_CLIENT_ID',
    clientSecretKey: 'GOOGLE_CLIENT_SECRET',
    redirectUriKey: 'GOOGLE_REDIRECT_URI',
    callbackPath: '/auth/google/callback',
    logoutPath: '/auth/google/logout',
    stateCookieName: 'bsq_oauth_state_google',
    tokenMethod: 'POST',
    scope: 'openid email profile',
    authorizeParams: {
      prompt: 'select_account',
      include_granted_scopes: 'true',
    },
  },
};

class OAuthError extends Error {
  constructor(code, message, cause = null) {
    super(message || code);
    this.name = 'OAuthError';
    this.code = code;
    this.cause = cause;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function getAppOrigin(env, request) {
  const candidates = [
    env?.APP_BASE_URL,
    env?.PUBLIC_APP_URL,
    request ? new URL(request.url).origin : '',
  ];

  for (const candidate of candidates) {
    const value = normalizeText(candidate);
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      // continue
    }
  }

  return 'https://b-square-web.pages.dev';
}

function buildAppUrl(env, request, path = '/') {
  return new URL(path, `${getAppOrigin(env, request)}/`).toString();
}

function sanitizeReturnTo(value, env, request, fallbackPath = '/index.html') {
  const fallback = buildAppUrl(env, request, fallbackPath);
  const raw = normalizeText(value);
  if (!raw) return fallback;

  try {
    const resolved = new URL(raw, `${getAppOrigin(env, request)}/`);
    if (resolved.origin !== getAppOrigin(env, request)) return fallback;
    return resolved.toString();
  } catch {
    return fallback;
  }
}

function toBase64Url(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  input.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(signature));
}

function getSessionSecret(env) {
  return normalizeText(env?.SESSION_SECRET);
}

function getProviderConfig(provider, env, request) {
  const config = PROVIDERS[normalizeText(provider).toLowerCase()];
  if (!config) return null;

  const clientId = normalizeText(env?.[config.clientIdKey]);
  const clientSecret = normalizeText(env?.[config.clientSecretKey]);
  const redirectUri = normalizeText(env?.[config.redirectUriKey]) || buildAppUrl(env, request, config.callbackPath);
  const logoutRedirectUri = config.logoutRedirectUriKey
    ? normalizeText(env?.[config.logoutRedirectUriKey]) || buildAppUrl(env, request, config.logoutPath)
    : buildAppUrl(env, request, config.logoutPath);
  const publicKey = config.publicKeyKey ? normalizeText(env?.[config.publicKeyKey]) : '';
  const sessionSecret = getSessionSecret(env);

  const missing = [];
  if (!clientId) missing.push(config.clientIdKey);
  if (config.id !== 'kakao' && !clientSecret) missing.push(config.clientSecretKey);
  if (!normalizeText(env?.[config.redirectUriKey])) missing.push(config.redirectUriKey);
  if (!sessionSecret) missing.push('SESSION_SECRET');

  return {
    ...config,
    clientId,
    clientSecret,
    redirectUri,
    logoutRedirectUri,
    publicKey,
    enabled: missing.length === 0,
    missing,
  };
}

export function listOAuthProviders(env, request) {
  return PROVIDER_ORDER.reduce((accumulator, provider) => {
    const config = getProviderConfig(provider, env, request);
    if (!config) return accumulator;

    accumulator[provider] = {
      id: config.id,
      label: config.label,
      enabled: config.enabled,
      available: config.enabled,
      reason: config.enabled
        ? ''
        : `${config.label} 로그인에 필요한 환경변수가 아직 설정되지 않았습니다.`,
      missing_fields: config.missing,
      start_url: `/auth/${config.id}/start`,
      callback_url: `/auth/${config.id}/callback`,
      logout_url: `/auth/${config.id}/logout`,
      public_key_configured: config.id === 'kakao' ? Boolean(config.publicKey) : null,
      public_key: config.id === 'kakao' ? config.publicKey || '' : null,
      token_url: config.id === 'kakao' ? `/auth/kakao/token` : null,
    };

    return accumulator;
  }, {});
}

function buildAuthRedirectUrl(env, request, provider, code, intent = 'login') {
  const normalizedIntent = normalizeSocialPurpose(intent);
  const targetPath = normalizedIntent === 'signup'
    ? '/login/signup.html'
    : normalizedIntent === 'recovery'
      ? '/login/find_account.html'
      : '/login/login.html';

  const url = new URL(buildAppUrl(env, request, targetPath));
  if (provider) url.searchParams.set('provider', provider);
  if (code) url.searchParams.set('oauth_error', code);
  return url.toString();
}

function buildRedirectResponse(location, cookies = []) {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });

  cookies.filter(Boolean).forEach((cookie) => {
    headers.append('Set-Cookie', cookie);
  });

  return new Response(null, {
    status: 302,
    headers,
  });
}

function getRequestCookie(request, name) {
  if (!name) return '';
  const cookies = parseCookies(request.headers.get('Cookie'));
  return normalizeText(cookies[name]);
}

async function createSignedToken(payload, env) {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const secret = getSessionSecret(env);
  if (!secret) throw new OAuthError('missing_session_secret', 'Missing SESSION_SECRET');
  const signature = await hmacHex(secret, body);
  return `${body}.${signature}`;
}

async function parseSignedToken(token, env) {
  const secret = getSessionSecret(env);
  if (!secret) throw new OAuthError('missing_session_secret', 'Missing SESSION_SECRET');

  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) throw new OAuthError('state_invalid', 'Invalid signed token');

  const expected = await hmacHex(secret, body);
  if (expected !== signature) throw new OAuthError('state_invalid', 'Signed token mismatch');

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return payload;
  } catch (error) {
    throw new OAuthError('state_invalid', 'Signed token payload is invalid', error);
  }
}

async function createStateToken(provider, returnTo, env, intent = 'login') {
  return createSignedToken({
    provider,
    return_to: returnTo,
    intent: normalizeSocialPurpose(intent),
    nonce: crypto.randomUUID(),
    issued_at: Date.now(),
    expires_at: Date.now() + STATE_TTL_MS,
  }, env);
}

async function parseStateToken(token, provider, env) {
  const payload = await parseSignedToken(token, env);
  if (payload.provider !== provider) throw new OAuthError('state_provider_mismatch', 'OAuth provider mismatch');
  if (!payload.return_to) throw new OAuthError('state_missing_return_to', 'Missing return target');
  if (!payload.intent) payload.intent = 'login';
  payload.intent = normalizeSocialPurpose(payload.intent);
  if (Number(payload.expires_at || 0) < Date.now()) throw new OAuthError('state_expired', 'OAuth state has expired');
  return payload;
}

async function createLogoutToken(returnTo, env) {
  return createSignedToken({
    return_to: returnTo,
    issued_at: Date.now(),
    expires_at: Date.now() + LOGOUT_TTL_MS,
  }, env);
}

async function parseLogoutToken(token, env) {
  const payload = await parseSignedToken(token, env);
  if (Number(payload.expires_at || 0) < Date.now()) throw new OAuthError('logout_state_expired', 'Logout state has expired');
  return payload;
}

function buildStateCookie(config, token, request, env) {
  return serializeCookie(config.stateCookieName, token, request, env, {
    path: config.callbackPath,
    maxAge: STATE_TTL_MS / 1000,
    sameSite: 'Lax',
    httpOnly: true,
  });
}

function clearStateCookie(config, request, env) {
  return clearCookie(config.stateCookieName, request, env, {
    path: config.callbackPath,
  });
}

function buildLogoutCookie(config, token, request, env) {
  if (!config.logoutCookieName) return null;
  return serializeCookie(config.logoutCookieName, token, request, env, {
    path: config.logoutPath,
    maxAge: LOGOUT_TTL_MS / 1000,
    sameSite: 'Lax',
    httpOnly: true,
  });
}

function clearLogoutCookie(config, request, env) {
  if (!config.logoutCookieName) return null;
  return clearCookie(config.logoutCookieName, request, env, {
    path: config.logoutPath,
  });
}

function getLogoutNonceCookieName(config) {
  return `bsq_oauth_logout_nonce_${config.id}`;
}

function clearLogoutNonceCookie(config, request, env) {
  return clearCookie(getLogoutNonceCookieName(config), request, env, {
    path: config.logoutPath,
  });
}

function clearFlowCookies(config, request, env) {
  return [
    clearStateCookie(config, request, env),
    clearLogoutCookie(config, request, env),
  ].filter(Boolean);
}

function buildProviderStartUrl(config, stateToken) {
  const url = new URL(config.authorizeEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', stateToken);

  if (config.scope) {
    url.searchParams.set('scope', config.scope);
  }

  if (config.authorizeParams) {
    Object.entries(config.authorizeParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function fetchJsonResponse(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new OAuthError('provider_fetch_failed', 'Provider request failed', error);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const errorCode = payload?.error_code ? `[${payload.error_code}] ` : '';
    const errorDetail = payload?.error_description || payload?.error || payload?.message || response.statusText || 'Provider request failed';
    throw new OAuthError(
      'provider_fetch_failed',
      `${errorCode}${errorDetail}`,
      payload,
    );
  }

  return payload;
}

async function exchangeToken(config, code, stateToken) {
  if (config.tokenMethod === 'GET') {
    const url = new URL(config.tokenEndpoint);
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('client_secret', config.clientSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('state', stateToken);
    url.searchParams.set('redirect_uri', config.redirectUri);
    return fetchJsonResponse(url.toString());
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', config.clientId);
  body.set('redirect_uri', config.redirectUri);
  body.set('code', code);
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  return fetchJsonResponse(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    },
    body,
  });
}

async function fetchProfile(config, accessToken) {
  const payload = await fetchJsonResponse(config.profileEndpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (config.id === 'kakao' && payload?.id == null) {
    throw new OAuthError('user_info_failed', 'Kakao profile id missing');
  }
  if (config.id === 'naver' && !payload?.response?.id) {
    throw new OAuthError('user_info_failed', 'Naver profile id missing');
  }
  if (config.id === 'google' && !payload?.sub) {
    throw new OAuthError('user_info_failed', 'Google profile id missing');
  }

  return payload;
}

function normalizeProviderProfile(config, payload) {
  if (config.id === 'kakao') {
    const account = payload?.kakao_account || {};
    const profile = account?.profile || {};
    const rawEmail = normalizeEmail(account?.email);
    const emailVerified = Boolean(account?.is_email_valid && account?.is_email_verified && rawEmail);
    const nickname = normalizeText(profile?.nickname || payload?.properties?.nickname);
    const name = normalizeText(account?.name || nickname || rawEmail);

    return {
      provider: config.id,
      provider_user_id: String(payload.id),
      name: name || `kakao_${String(payload.id).slice(-6)}`,
      nickname: nickname || name,
      email: emailVerified ? rawEmail : '',
      provider_email: rawEmail,
      email_verified: emailVerified,
      avatar_url: normalizeText(profile?.profile_image_url || profile?.thumbnail_image_url || payload?.properties?.profile_image),
      locale: normalizeText(account?.locale),
      raw: payload,
    };
  }

  if (config.id === 'naver') {
    const response = payload?.response || {};
    const email = normalizeEmail(response?.email);
    const nickname = normalizeText(response?.nickname || response?.name);
    const name = normalizeText(response?.name || response?.nickname || email);
    const emailVerified = Boolean(
      response?.is_email_verified === true
      || String(response?.is_email_verified).toLowerCase() === 'true'
      || response?.email_verified === true
      || String(response?.email_verified).toLowerCase() === 'true'
    );

    return {
      provider: config.id,
      provider_user_id: String(response.id),
      name: name || `naver_${String(response.id).slice(-6)}`,
      nickname: nickname || name,
      email: emailVerified ? email : '',
      provider_email: email,
      email_verified: emailVerified,
      avatar_url: normalizeText(response?.profile_image),
      locale: normalizeText(response?.locale),
      raw: payload,
    };
  }

  const rawEmail = normalizeEmail(payload?.email);
  const emailVerified = Boolean(payload?.email_verified && rawEmail);
  const name = normalizeText(payload?.name || payload?.given_name);

  return {
    provider: config.id,
    provider_user_id: String(payload.sub),
    name: name || `google_${String(payload.sub).slice(-6)}`,
    nickname: normalizeText(payload?.given_name || payload?.family_name || name),
    email: emailVerified ? rawEmail : '',
    provider_email: rawEmail,
    email_verified: emailVerified,
    avatar_url: normalizeText(payload?.picture),
    locale: normalizeText(payload?.locale),
    raw: payload,
  };
}

function isSyntheticEmail(email) {
  return normalizeEmail(email).endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

async function stableIdentity(profile) {
  const digest = await sha256Hex(`${profile.provider}:${profile.provider_user_id}`);
  return {
    digest,
    short: digest.slice(0, 12),
    userId: `user_${profile.provider}_${digest.slice(0, 12)}`,
    username: `${profile.provider}${digest.slice(0, 8)}`.slice(0, 16),
    email: `${profile.provider}.${digest.slice(0, 12)}@${SYNTHETIC_EMAIL_DOMAIN}`,
  };
}

async function findUserById(db, userId) {
  if (!userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(userId).first();
}

async function findUserByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(normalized).first();
}

async function findSocialAccount(db, provider, providerUserId) {
  return db.prepare(`
    SELECT *
    FROM social_accounts
    WHERE provider = ?
      AND provider_user_id = ?
    LIMIT 1
  `).bind(provider, providerUserId).first();
}

async function generateUsernameCandidates(profile, identity) {
  const seeds = [
    normalizeText(profile.nickname || profile.name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10),
    normalizeText((profile.email || '').split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10),
    identity.username,
  ].filter(Boolean);

  const deduped = [];
  for (const seed of seeds) {
    if (!deduped.includes(seed)) deduped.push(seed);
  }

  return deduped.flatMap((seed) => [
    seed.slice(0, 16),
    `${seed}${identity.short.slice(0, 4)}`.slice(0, 16),
  ]);
}

async function createSocialUser(db, profile) {
  const identity = await stableIdentity(profile);
  const existingUser = await findUserById(db, identity.userId);
  if (existingUser) return existingUser;

  const email = profile.email_verified && profile.email ? profile.email : identity.email;
  const displayName = profile.name || profile.nickname || email.split('@')[0] || `${profile.provider} user`;
  const candidates = await generateUsernameCandidates(profile, identity);

  for (const username of candidates) {
    await db.prepare(`
      INSERT OR IGNORE INTO users (
        id, email, password_hash, name, phone, username,
        birth_year, birth_month, birth_day, gender, nationality, signup_path,
        referrer_code, preferred_language, preferred_theme, role,
        membership_level, profile_image_url
      )
      VALUES (?, ?, NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, 'local', ?, NULL, ?, ?, 'user', 'Free', ?)
    `).bind(
      identity.userId,
      email,
      displayName,
      username,
      `oauth:${profile.provider}`,
      normalizeLanguagePreference(profile.locale || 'ko', 'ko'),
      normalizeThemePreference('dark', 'dark'),
      profile.avatar_url || null,
    ).run();

    const byId = await findUserById(db, identity.userId);
    if (byId) return byId;

    const byEmail = await findUserByEmail(db, email);
    if (byEmail) return byEmail;
  }

  throw new OAuthError('social_user_create_failed', 'Failed to create social user');
}

async function updateUserFromProfile(db, user, profile, { allowEmailPromotion = false } = {}) {
  const updates = [];
  const values = [];

  if (!normalizeText(user?.name) && profile.name) {
    updates.push('name = ?');
    values.push(profile.name);
  }

  if (!normalizeText(user?.profile_image_url) && profile.avatar_url) {
    updates.push('profile_image_url = ?');
    values.push(profile.avatar_url);
  }

  if (allowEmailPromotion && profile.email_verified && profile.email && isSyntheticEmail(user?.email)) {
    const existingOwner = await findUserByEmail(db, profile.email);
    if (!existingOwner || existingOwner.id === user.id) {
      updates.push('email = ?');
      values.push(profile.email);
    }
  }

  if (!updates.length) return user;

  updates.push('updated_at = CURRENT_TIMESTAMP');
  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values, user.id).run();
  return findUserById(db, user.id);
}

async function upsertSocialAccount(db, userId, profile) {
  const existing = await findSocialAccount(db, profile.provider, profile.provider_user_id);
  if (existing && existing.user_id !== userId) {
    throw new OAuthError('provider_account_conflict', 'Provider account is already linked to another user');
  }

  if (existing) {
    await db.prepare(`
      UPDATE social_accounts
      SET
        user_id = ?,
        provider_email = ?,
        email_verified = ?,
        provider_name = ?,
        provider_nickname = ?,
        provider_avatar_url = ?,
        provider_locale = ?,
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE provider = ?
        AND provider_user_id = ?
    `).bind(
      userId,
      profile.provider_email || null,
      profile.email_verified ? 1 : 0,
      profile.name || null,
      profile.nickname || null,
      profile.avatar_url || null,
      profile.locale || null,
      profile.provider,
      profile.provider_user_id,
    ).run();
    return findSocialAccount(db, profile.provider, profile.provider_user_id);
  }

  await db.prepare(`
    INSERT INTO social_accounts (
      id, user_id, provider, provider_user_id, provider_email, email_verified,
      provider_name, provider_nickname, provider_avatar_url, provider_locale,
      linked_at, last_login_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    `sa_${profile.provider}_${profile.provider_user_id}`,
    userId,
    profile.provider,
    profile.provider_user_id,
    profile.provider_email || null,
    profile.email_verified ? 1 : 0,
    profile.name || null,
    profile.nickname || null,
    profile.avatar_url || null,
    profile.locale || null,
  ).run();

  return findSocialAccount(db, profile.provider, profile.provider_user_id);
}

function verificationRowToProfile(row) {
  if (!row) return null;
  return {
    provider: normalizeText(row.provider),
    provider_user_id: normalizeText(row.provider_user_id),
    email: normalizeText(row.provider_email),
    provider_email: normalizeText(row.provider_email),
    email_verified: Boolean(row.email_verified),
    name: normalizeText(row.provider_name),
    nickname: normalizeText(row.provider_nickname),
    avatar_url: normalizeText(row.provider_avatar_url),
    locale: normalizeText(row.provider_locale),
  };
}

export async function attachSocialAccountFromVerification(db, userId, row) {
  if (!row) return null;
  if (row.user_id && row.user_id !== userId) {
    throw new OAuthError('verification_user_mismatch', 'Verification is linked to another user');
  }

  const profile = verificationRowToProfile(row);
  if (!profile?.provider || !profile?.provider_user_id) return null;

  await upsertSocialAccount(db, userId, profile);
  const user = await findUserById(db, userId);
  if (user) {
    await updateUserFromProfile(db, user, profile, {
      allowEmailPromotion: false,
    });
  }
  return profile;
}

async function resolveOAuthAccount(db, profile, {
  allowCreate = true,
  allowEmailLink = true,
  allowEmailLookup = true,
} = {}) {
  const linkedAccount = await findSocialAccount(db, profile.provider, profile.provider_user_id);
  let user = linkedAccount ? await findUserById(db, linkedAccount.user_id) : null;

  if (!user && allowEmailLookup && profile.email_verified && profile.email) {
    user = await findUserByEmail(db, profile.email);
  }

  if (!user && allowCreate) {
    user = await createSocialUser(db, profile);
  }

  if (!user) {
    return { user: null, linkedAccount: linkedAccount || null };
  }

  if (linkedAccount || allowEmailLink) {
    await upsertSocialAccount(db, user.id, profile);
  }

  user = await updateUserFromProfile(db, user, profile, {
    allowEmailPromotion: allowEmailLink && profile.email_verified,
  });

  return { user, linkedAccount: linkedAccount || null };
}

async function lookupOAuthAccount(db, profile) {
  const linkedAccount = await findSocialAccount(db, profile.provider, profile.provider_user_id);
  let user = linkedAccount ? await findUserById(db, linkedAccount.user_id) : null;

  if (!user && profile.email_verified && profile.email) {
    user = await findUserByEmail(db, profile.email);
  }

  return { user, linkedAccount };
}

async function completeOAuthProfileFlow(context, config, profile, {
  intent = 'login',
  returnTo = '',
  clearState = false,
  provider = config?.id || profile?.provider || 'kakao',
} = {}) {
  const { request, env } = context;
  const normalizedIntent = normalizeSocialPurpose(intent);
  const fallbackReturnTo = normalizedIntent === 'signup'
    ? '/login/signup.html'
    : normalizedIntent === 'recovery'
      ? '/login/find_account.html'
      : '/index.html';
  const resolvedReturnTo = sanitizeReturnTo(returnTo, env, request, fallbackReturnTo);
  const matched = await lookupOAuthAccount(env.DB, profile);
  const cookies = [];

  if (normalizedIntent === 'signup') {
    if (matched.user) {
      if (clearState) {
        cookies.push(clearStateCookie(config, request, env));
      }
      return {
        location: buildAuthRedirectUrl(env, request, provider, 'account_exists', 'login'),
        cookies,
      };
    }

    const verification = await createSocialVerification(env.DB, {
      purpose: 'signup',
      profile,
      returnTo: resolvedReturnTo,
    });

    cookies.push(
      await buildSocialVerificationCookie(verification.token, request, env, 'signup'),
    );
    if (clearState) {
      cookies.push(clearStateCookie(config, request, env));
    }

    return {
      location: sanitizeReturnTo(resolvedReturnTo, env, request, '/login/signup.html'),
      cookies,
    };
  }

  if (normalizedIntent === 'recovery') {
    if (!matched.user) {
      if (clearState) {
        cookies.push(clearStateCookie(config, request, env));
      }
      return {
        location: buildAuthRedirectUrl(env, request, provider, 'account_not_found', 'recovery'),
        cookies,
      };
    }

    const verification = await createSocialVerification(env.DB, {
      purpose: 'recovery',
      profile,
      userId: matched.user.id,
      returnTo: resolvedReturnTo,
    });

    cookies.push(
      await buildSocialVerificationCookie(verification.token, request, env, 'recovery'),
    );
    if (clearState) {
      cookies.push(clearStateCookie(config, request, env));
    }

    return {
      location: sanitizeReturnTo(resolvedReturnTo, env, request, '/login/find_account.html'),
      cookies,
    };
  }

  if (!matched.user) {
    const verification = await createSocialVerification(env.DB, {
      purpose: 'signup',
      profile,
      returnTo: resolvedReturnTo,
    });

    cookies.push(
      await buildSocialVerificationCookie(verification.token, request, env, 'signup'),
    );
    if (clearState) {
      cookies.push(clearStateCookie(config, request, env));
    }

    return {
      location: buildAuthRedirectUrl(env, request, provider, 'signup_required', 'signup'),
      cookies,
    };
  }

  const { user } = await resolveOAuthAccount(env.DB, profile, {
    allowCreate: false,
    allowEmailLink: true,
    allowEmailLookup: true,
  });

  if (!user) {
    const verification = await createSocialVerification(env.DB, {
      purpose: 'signup',
      profile,
      returnTo: resolvedReturnTo,
    });

    cookies.push(
      await buildSocialVerificationCookie(verification.token, request, env, 'signup'),
    );
    if (clearState) {
      cookies.push(clearStateCookie(config, request, env));
    }

    return {
      location: buildAuthRedirectUrl(env, request, provider, 'signup_required', 'signup'),
      cookies,
    };
  }

  const session = await createSessionRecord(env.DB, user.id, {
    authProvider: profile.provider,
    authProviderUserId: profile.provider_user_id,
  });

  cookies.push(createSessionCookie(session.token, request, env));
  if (clearState) {
    cookies.push(clearStateCookie(config, request, env));
  }

  return {
    location: sanitizeReturnTo(resolvedReturnTo, env, request),
    cookies,
  };
}

function mapProviderError(code) {
  const normalized = normalizeText(code).toLowerCase();
  if (!normalized) return 'provider_error';
  if (normalized === 'access_denied') return 'access_denied';
  if (normalized === 'consent_required') return 'consent_required';
  if (normalized === 'login_required') return 'login_required';
  if (normalized === 'invalid_scope') return 'invalid_scope';
  if (normalized === 'invalid_client') return 'invalid_client';
  if (normalized === 'invalid_grant') return 'invalid_grant';
  if (normalized === 'invalid_request') return 'invalid_request';
  if (normalized === 'unauthorized_client') return 'unauthorized_client';
  if (normalized === 'redirect_uri_mismatch') return 'redirect_uri_mismatch';
  if (normalized === 'server_error') return 'server_error';
  if (normalized === 'temporarily_unavailable') return 'temporarily_unavailable';
  return 'provider_error';
}

async function clearServiceSession(request, env) {
  const token = getSessionToken(request);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function handleOAuthStart(context, provider) {
  const { request, env } = context;
  const config = getProviderConfig(provider, env, request);
  const requestUrl = new URL(request.url);
  const intent = normalizeSocialPurpose(requestUrl.searchParams.get('flow') || requestUrl.searchParams.get('intent'));
  const responseFormat = normalizeText(requestUrl.searchParams.get('format') || requestUrl.searchParams.get('response'));
  const wantsJson = ['json', 'bridge', 'sdk'].includes(responseFormat) || requestUrl.searchParams.get('json') === '1';

  if (!config || !config.enabled) {
    return buildRedirectResponse(buildAuthRedirectUrl(env, request, provider, 'provider_unavailable', intent));
  }

  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get('return_to') || requestUrl.searchParams.get('next'),
    env,
    request,
    intent === 'signup'
      ? '/login/signup.html'
      : intent === 'recovery'
        ? '/login/find_account.html'
        : '/index.html',
  );
  const stateToken = await createStateToken(config.id, returnTo, env, intent);

  if (wantsJson) {
    return json(request, env, {
      success: true,
      data: {
        provider: config.id,
        intent,
        return_to: returnTo,
        redirect_uri: config.redirectUri,
        authorize_url: buildProviderStartUrl(config, stateToken),
        state: stateToken,
        scope: config.scope || '',
      },
    }, {
      cookies: [buildStateCookie(config, stateToken, request, env)],
    });
  }

  return buildRedirectResponse(buildProviderStartUrl(config, stateToken), [
    buildStateCookie(config, stateToken, request, env),
  ]);
}

export async function handleOAuthCallback(context, provider) {
  const { request, env } = context;
  const config = getProviderConfig(provider, env, request);

  if (!config || !config.enabled) {
    return buildRedirectResponse(buildAuthRedirectUrl(env, request, provider, 'provider_unavailable'));
  }

  await ensureAuthSchema(env.DB);

  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get('error');
  if (providerError) {
    const redirect = new URL(buildAuthRedirectUrl(env, request, provider, mapProviderError(providerError)));
    const providerErrorDescription = normalizeText(requestUrl.searchParams.get('error_description'));
    if (providerErrorDescription) {
      redirect.searchParams.set('message', providerErrorDescription);
    }
    return buildRedirectResponse(redirect.toString(), clearFlowCookies(config, request, env));
  }

  const code = normalizeText(requestUrl.searchParams.get('code'));
  const stateToken = normalizeText(requestUrl.searchParams.get('state'));
  const stateCookie = getRequestCookie(request, config.stateCookieName);

  if (!code || !stateToken) {
    return buildRedirectResponse(
      buildAuthRedirectUrl(env, request, provider, 'callback_missing_code'),
      clearFlowCookies(config, request, env),
    );
  }

  if (!stateCookie || stateCookie !== stateToken) {
    return buildRedirectResponse(
      buildAuthRedirectUrl(env, request, provider, 'state_mismatch'),
      clearFlowCookies(config, request, env),
    );
  }

  let statePayload;
  try {
    statePayload = await parseStateToken(stateToken, config.id, env);
  } catch (error) {
    return buildRedirectResponse(
      buildAuthRedirectUrl(
        env,
        request,
        provider,
        error.code === 'state_expired' ? 'state_expired' : 'state_mismatch',
        'login',
      ),
      clearFlowCookies(config, request, env),
    );
  }

  try {
    const tokenPayload = await exchangeToken(config, code, stateToken);
    const accessToken = normalizeText(tokenPayload?.access_token);
    if (!accessToken) throw new OAuthError('token_exchange_failed', 'Missing access token');

    const providerProfile = await fetchProfile(config, accessToken);
    const profile = normalizeProviderProfile(config, providerProfile);
    if (!profile.provider_user_id) throw new OAuthError('user_info_failed', 'Missing provider user id');

    const intent = normalizeSocialPurpose(statePayload.intent);
    const result = await completeOAuthProfileFlow(context, config, profile, {
      intent,
      returnTo: statePayload.return_to,
      clearState: true,
      provider,
    });

    return buildRedirectResponse(result.location, result.cookies);
  } catch (error) {
    const codeValue = error instanceof OAuthError ? error.code : 'oauth_failed';
    const redirect = new URL(buildAuthRedirectUrl(env, request, provider, codeValue, statePayload?.intent || 'login'));
    if (error instanceof OAuthError && normalizeText(error.message)) {
      redirect.searchParams.set('message', normalizeText(error.message));
    }
    return buildRedirectResponse(
      redirect.toString(),
      clearFlowCookies(config, request, env),
    );
  }
}

export async function handleOAuthTokenLogin(context, provider) {
  const { request, env } = context;
  const config = getProviderConfig(provider, env, request);

  if (!config || !config.enabled) {
    return json(request, env, {
      success: false,
      error: 'provider_unavailable',
      message: '현재 선택한 소셜 로그인은 준비 중입니다.',
    }, { status: 503 });
  }

  await ensureAuthSchema(env.DB);

  const requestOrigin = normalizeText(request.headers.get('Origin'));
  if (requestOrigin) {
    try {
      const allowedOrigin = new URL(getAppOrigin(env, request)).origin;
      if (new URL(requestOrigin).origin !== allowedOrigin && !requestOrigin.endsWith('.pages.dev')) {
        return json(request, env, {
          success: false,
          error: 'origin_mismatch',
          message: '요청 출처가 올바르지 않습니다.',
        }, { status: 403 });
      }
    } catch {
      return json(request, env, {
        success: false,
        error: 'origin_mismatch',
        message: '요청 출처가 올바르지 않습니다.',
      }, { status: 403 });
    }
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const accessToken = normalizeText(body?.access_token || body?.accessToken);
  const stateToken = normalizeText(body?.state || body?.stateToken || body?.oauth_state);
  const bodyIntent = normalizeSocialPurpose(body?.flow || body?.intent);
  const bodyReturnTo = sanitizeReturnTo(
    body?.return_to || body?.returnTo,
    env,
    request,
    bodyIntent === 'signup'
      ? '/login/signup.html'
      : bodyIntent === 'recovery'
        ? '/login/find_account.html'
        : '/index.html',
  );
  const expectsState = provider !== 'kakao';
  if (expectsState && !stateToken) {
    return json(request, env, {
      success: false,
      error: 'missing_state',
      message: 'OAuth state token이 필요합니다.',
      data: {
        redirect_to: buildAuthRedirectUrl(env, request, provider, 'missing_state', bodyIntent),
      },
    }, {
      status: 400,
      cookies: [clearStateCookie(config, request, env)],
    });
  }

  let statePayload = null;
  if (stateToken) {
    const stateCookie = getRequestCookie(request, config.stateCookieName);
    if (!stateCookie || stateCookie !== stateToken) {
      return json(request, env, {
        success: false,
        error: 'state_mismatch',
        message: 'OAuth state verification failed.',
        data: {
          redirect_to: buildAuthRedirectUrl(env, request, provider, 'state_mismatch', bodyIntent),
        },
      }, {
        status: 403,
        cookies: [clearStateCookie(config, request, env)],
      });
    }

    try {
      statePayload = await parseStateToken(stateToken, config.id, env);
    } catch (error) {
      return json(request, env, {
        success: false,
        error: error instanceof OAuthError ? error.code : 'state_mismatch',
        message: error instanceof OAuthError && normalizeText(error.message)
          ? normalizeText(error.message)
          : 'OAuth state verification failed.',
        data: {
          redirect_to: buildAuthRedirectUrl(
            env,
            request,
            provider,
            error instanceof OAuthError ? error.code : 'state_mismatch',
            bodyIntent,
          ),
        },
      }, {
        status: 400,
        cookies: [clearStateCookie(config, request, env)],
      });
    }
  }

  const intent = normalizeSocialPurpose(statePayload?.intent || bodyIntent);
  const returnTo = sanitizeReturnTo(
    statePayload?.return_to || bodyReturnTo,
    env,
    request,
    intent === 'signup'
      ? '/login/signup.html'
      : intent === 'recovery'
        ? '/login/find_account.html'
        : '/index.html',
  );
  const clearStateCookies = stateToken ? [clearStateCookie(config, request, env)] : [];

  if (!accessToken) {
    return json(request, env, {
      success: false,
      error: 'missing_access_token',
      message: 'OAuth access token이 필요합니다.',
      data: {
        redirect_to: buildAuthRedirectUrl(env, request, provider, 'missing_access_token', intent),
      },
    }, {
      status: 400,
      cookies: clearStateCookies,
    });
  }

  try {
    const providerProfile = await fetchProfile(config, accessToken);
    const profile = normalizeProviderProfile(config, providerProfile);
    if (!profile.provider_user_id) throw new OAuthError('user_info_failed', 'Missing provider user id');

    const result = await completeOAuthProfileFlow(context, config, profile, {
      intent,
      returnTo,
      clearState: false,
      provider,
    });

      return json(request, env, {
      success: true,
      data: {
        provider: profile.provider,
        redirect_to: result.location,
        profile: {
          provider: profile.provider,
          provider_user_id: profile.provider_user_id,
          email: profile.email,
          provider_email: profile.provider_email,
          email_verified: profile.email_verified,
          name: profile.name,
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
          locale: profile.locale,
        },
      },
    }, {
      cookies: [
        ...(Array.isArray(result.cookies) ? result.cookies : [result.cookies]).filter(Boolean),
        ...clearStateCookies,
      ],
    });
  } catch (error) {
    const codeValue = error instanceof OAuthError ? error.code : 'oauth_failed';
    const response = {
      success: false,
      error: codeValue,
      message: error instanceof OAuthError && normalizeText(error.message)
        ? normalizeText(error.message)
        : 'OAuth access token 로그인에 실패했습니다.',
      data: {
        redirect_to: buildAuthRedirectUrl(env, request, provider, codeValue, intent),
      },
    };
    return json(request, env, response, {
      status: 400,
      cookies: clearStateCookies,
    });
  }
}

export async function handleOAuthLogout(context, provider) {
  const { request, env } = context;
  const config = getProviderConfig(provider, env, request);
  const requestUrl = new URL(request.url);
  const requestNonce = normalizeText(requestUrl.searchParams.get('nonce'));
  const cookiePhase = getRequestCookie(request, config ? config.logoutPhaseCookieName : '');
  const cookieNonce = getRequestCookie(request, getLogoutNonceCookieName(config || { id: provider }));
  const hasStartNonce = requestNonce && cookieNonce && requestNonce === cookieNonce;
  const hasReturnPhase = Boolean(cookiePhase && cookieNonce);
  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get('return_to') || requestUrl.searchParams.get('next'),
    env,
    request,
  );

  if (!config) {
    return buildRedirectResponse(returnTo, [clearSessionCookie(request, env)]);
  }

  if (!hasStartNonce && !hasReturnPhase) {
    return buildRedirectResponse(returnTo, [
      clearLogoutCookie(config, request, env),
      clearStateCookie(config, request, env),
      clearLogoutNonceCookie(config, request, env),
    ].filter(Boolean));
  }

  await ensureAuthSchema(env.DB);
  await clearServiceSession(request, env);

  if (config.id === 'kakao' && config.logoutEndpoint && config.logoutRedirectUri && config.clientId) {
    const cookieToken = getRequestCookie(request, config.logoutCookieName);

    if (hasReturnPhase && cookieToken) {
      try {
        const logoutPayload = await parseLogoutToken(cookieToken, env);
        return buildRedirectResponse(
          sanitizeReturnTo(logoutPayload.return_to, env, request),
          [
            clearSessionCookie(request, env),
            clearLogoutCookie(config, request, env),
            clearStateCookie(config, request, env),
            clearLogoutNonceCookie(config, request, env),
          ],
        );
      } catch {
        return buildRedirectResponse(returnTo, [
          ...clearFlowCookies(config, request, env),
          clearLogoutNonceCookie(config, request, env),
        ]);
      }
    }

    if (hasReturnPhase) {
      return buildRedirectResponse(returnTo, [
        clearSessionCookie(request, env),
        clearLogoutCookie(config, request, env),
        clearStateCookie(config, request, env),
        clearLogoutNonceCookie(config, request, env),
      ]);
    }

    const logoutToken = await createLogoutToken(returnTo, env);
    const logoutUrl = new URL(config.logoutEndpoint);
    logoutUrl.searchParams.set('client_id', config.clientId);
    logoutUrl.searchParams.set('logout_redirect_uri', config.logoutRedirectUri);

    return buildRedirectResponse(logoutUrl.toString(), [
      clearSessionCookie(request, env),
      clearStateCookie(config, request, env),
      clearLogoutNonceCookie(config, request, env),
      buildLogoutCookie(config, logoutToken, request, env),
    ]);
  }

  return buildRedirectResponse(returnTo, [
    clearSessionCookie(request, env),
    clearStateCookie(config, request, env),
    clearLogoutCookie(config, request, env),
    clearLogoutNonceCookie(config, request, env),
  ]);
}
