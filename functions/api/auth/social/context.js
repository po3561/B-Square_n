import { json, options } from '../../_lib/http.js';
import { ensureAuthSchema } from '../../_lib/schema.js';
import { loadSocialVerification, normalizeSocialPurpose, sanitizeSocialVerificationRow } from '../../_lib/social_verification.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function maskEmail(email) {
  const normalized = normalizeText(email);
  if (!normalized || !normalized.includes('@')) return '';
  const [local, domain] = normalized.split('@');
  const prefix = local.slice(0, 2);
  const suffix = local.length > 2 ? '*'.repeat(Math.max(1, Math.min(local.length - 2, 4))) : '*';
  return `${prefix}${suffix}@${domain}`;
}

function getProviderLabel(provider) {
  const value = normalizeText(provider).toLowerCase();
  if (value === 'kakao') return '카카오';
  if (value === 'naver') return '네이버';
  if (value === 'google') return '구글';
  return provider || '';
}

async function loadUserSummary(db, userId) {
  if (!userId) return null;

  const user = await db.prepare(`
    SELECT id, email, name, username, profile_image_url, signup_path, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first();

  if (!user) return null;

  const { results: providers = [] } = await db.prepare(`
    SELECT provider, provider_email, email_verified, provider_name, provider_nickname, provider_avatar_url, provider_locale, last_login_at
    FROM social_accounts
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(last_login_at, created_at)) DESC, datetime(COALESCE(updated_at, created_at)) DESC
  `).bind(user.id).all();

  return {
    id: user.id,
    email: user.email,
    masked_email: maskEmail(user.email),
    name: user.name || '',
    username: user.username || '',
    profile_image_url: user.profile_image_url || '',
    signup_path: user.signup_path || '',
    providers: providers.map((provider) => ({
      provider: provider.provider,
      label: getProviderLabel(provider.provider),
      email_verified: Boolean(provider.email_verified),
      provider_name: provider.provider_name || null,
      provider_nickname: provider.provider_nickname || null,
    })),
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const url = new URL(request.url);
    const purpose = normalizeSocialPurpose(url.searchParams.get('purpose') || url.searchParams.get('intent'));
    const verification = await loadSocialVerification(env.DB, request, purpose);

    if (!verification) {
      return json(request, env, {
        success: true,
        data: {
          active: false,
          purpose,
          verification: null,
          account: null,
        },
      });
    }

    const verificationSummary = sanitizeSocialVerificationRow(verification);
    const account = await loadUserSummary(env.DB, verification.user_id);
    const fallbackAccount = !account && verification.email_verified && verification.provider_email
      ? await env.DB.prepare(`
        SELECT id, email, name, username, profile_image_url, signup_path, created_at, updated_at
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
      `).bind(verification.provider_email).first()
      : null;

    const resolvedAccount = account || (fallbackAccount
      ? {
          id: fallbackAccount.id,
          email: fallbackAccount.email,
          masked_email: maskEmail(fallbackAccount.email),
          name: fallbackAccount.name || '',
          username: fallbackAccount.username || '',
          profile_image_url: fallbackAccount.profile_image_url || '',
          signup_path: fallbackAccount.signup_path || '',
          providers: [],
        }
      : null);

    if (resolvedAccount && !resolvedAccount.providers?.length) {
      const { results: providers = [] } = await env.DB.prepare(`
        SELECT provider, provider_email, email_verified, provider_name, provider_nickname, provider_avatar_url, provider_locale
        FROM social_accounts
        WHERE user_id = ?
        ORDER BY datetime(COALESCE(last_login_at, created_at)) DESC, datetime(COALESCE(updated_at, created_at)) DESC
      `).bind(resolvedAccount.id).all();
      resolvedAccount.providers = providers.map((provider) => ({
        provider: provider.provider,
        label: getProviderLabel(provider.provider),
        provider_email: provider.provider_email || null,
        email_verified: Boolean(provider.email_verified),
        provider_name: provider.provider_name || null,
        provider_nickname: provider.provider_nickname || null,
        provider_avatar_url: provider.provider_avatar_url || null,
        provider_locale: provider.provider_locale || null,
      }));
    }

    return json(request, env, {
      success: true,
      data: {
        active: true,
        purpose,
        verification: verificationSummary,
        provider: {
          id: verification.provider,
          label: getProviderLabel(verification.provider),
        },
        profile: {
          provider: verification.provider,
          provider_email: purpose === 'signup' ? (verification.provider_email || '') : '',
          email_verified: Boolean(verification.email_verified),
          name: verification.provider_name || '',
          nickname: verification.provider_nickname || '',
          avatar_url: verification.provider_avatar_url || '',
          locale: verification.provider_locale || '',
          masked_email: maskEmail(verification.provider_email || resolvedAccount?.email || ''),
        },
        account: resolvedAccount,
      },
    });
  } catch (error) {
    console.error('[auth/social/context] error:', error);
    return json(request, env, {
      success: false,
      error: '소셜 인증 상태를 불러오지 못했습니다.',
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
