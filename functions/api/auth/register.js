import { createSessionCookie, createSessionRecord, hashPassword } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';
import {
  clearSocialVerificationCookie,
  loadSocialVerification,
} from '../_lib/social_verification.js';
import { normalizeLanguagePreference, normalizeThemePreference } from '../_lib/preferences.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function buildDisplayName(name, fallback) {
  const normalized = normalizeText(name);
  if (normalized) return normalized;
  return normalizeText(fallback);
}

async function upsertSocialAccount(db, userId, verification) {
  const provider = normalizeText(verification.provider).toLowerCase();
  const providerUserId = normalizeText(verification.provider_user_id);
  if (!provider || !providerUserId) return null;

  const existing = await db.prepare(`
    SELECT *
    FROM social_accounts
    WHERE provider = ?
      AND provider_user_id = ?
    LIMIT 1
  `).bind(provider, providerUserId).first();

  if (existing && existing.user_id !== userId) {
    throw new Error('Provider account is already linked to another user.');
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
        updated_at = CURRENT_TIMESTAMP,
        last_login_at = CURRENT_TIMESTAMP
      WHERE provider = ?
        AND provider_user_id = ?
    `).bind(
      userId,
      verification.provider_email || null,
      verification.email_verified ? 1 : 0,
      verification.provider_name || null,
      verification.provider_nickname || null,
      verification.provider_avatar_url || null,
      verification.provider_locale || null,
      provider,
      providerUserId,
    ).run();
    return existing;
  }

  await db.prepare(`
    INSERT INTO social_accounts (
      id, user_id, provider, provider_user_id, provider_email, email_verified,
      provider_name, provider_nickname, provider_avatar_url, provider_locale,
      linked_at, last_login_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    `sa_${provider}_${providerUserId}`,
    userId,
    provider,
    providerUserId,
    verification.provider_email || null,
    verification.email_verified ? 1 : 0,
    verification.provider_name || null,
    verification.provider_nickname || null,
    verification.provider_avatar_url || null,
    verification.provider_locale || null,
  ).run();

  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const socialVerification = await loadSocialVerification(env.DB, request, 'signup');

    if (socialVerification?.user_id) {
      return json(request, env, {
        success: false,
        error: '이미 가입된 계정입니다.',
      }, { status: 409 });
    }

    let email = normalizeEmail(body?.email);
    const password = body?.password || '';
    let name = normalizeText(body?.name);
    const phone = body?.phone || null;
    let username = normalizeText(body?.username) || null;
    const birth_year = body?.birth_year || null;
    const birth_month = body?.birth_month || null;
    const birth_day = body?.birth_day || null;
    const gender = body?.gender || null;
    const nationality = body?.nationality || 'local';
    let signup_path = body?.signup_path || null;
    const referrer_code = body?.referrer_code || null;
    const preferred_language = normalizeLanguagePreference(body?.preferred_language || null, 'ko');
    const preferred_theme = normalizeThemePreference(body?.preferred_theme || null, 'dark');

    if (socialVerification) {
      const verifiedEmail = normalizeEmail(socialVerification.provider_email || '');
      const hasVerifiedEmail = Boolean(socialVerification.email_verified && verifiedEmail);

      if (hasVerifiedEmail) {
        if (!email) {
          email = verifiedEmail;
        } else if (email !== verifiedEmail) {
          return json(request, env, {
            success: false,
            error: '본인 인증 이메일과 입력한 이메일이 일치하지 않습니다.',
          }, { status: 400 });
        }
      }

      name = buildDisplayName(name, socialVerification.provider_name || socialVerification.provider_nickname);
      signup_path = signup_path || `oauth:${socialVerification.provider}`;
    }

    if (!email || !password) {
      return json(request, env, { success: false, error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
    }
    if (password.length < 8) {
      return json(request, env, { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }

    await ensureAuthSchema(env.DB);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
    if (existing) {
      return json(request, env, { success: false, error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
    }

    if (username) {
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existingUser) {
        return json(request, env, { success: false, error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
      }
    }

    const password_hash = await hashPassword(password);
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

    try {
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, password_hash, name, phone, username,
          birth_year, birth_month, birth_day, gender, nationality, signup_path,
          referrer_code, preferred_language, preferred_theme, role
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
      `).bind(
        userId, email, password_hash, name || null, phone, username,
        birth_year, birth_month, birth_day,
        gender, nationality, signup_path,
        referrer_code, preferred_language, preferred_theme
      ).run();
    } catch (insertError) {
      const message = String(insertError?.message || '');
      const isUnique = /unique constraint failed/i.test(message);
      if (isUnique) {
        if (/users\.email/i.test(message)) {
          return json(request, env, { success: false, error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
        }
        if (/users\.username/i.test(message)) {
          return json(request, env, { success: false, error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
        }
        return json(request, env, { success: false, error: '이미 가입된 계정입니다.' }, { status: 409 });
      }
      throw insertError;
    }

    if (socialVerification) {
      try {
        await upsertSocialAccount(env.DB, userId, socialVerification);
        await env.DB.prepare(`
          UPDATE social_verifications
          SET used_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(socialVerification.id).run();
      } catch (socialError) {
        console.error('[Register] social verification linkage failed:', socialError);
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run().catch(() => {});
        return json(request, env, {
          success: false,
          error: '본인 인증 연결에 실패했습니다. 다시 시도해 주세요.',
        }, { status: 500 });
      }
    }

    const session = await createSessionRecord(env.DB, userId, {
      authProvider: socialVerification?.provider || null,
      authProviderUserId: socialVerification?.provider_user_id || null,
    });

    const headers = new Headers({
      'Set-Cookie': createSessionCookie(session.token, request, env),
    });

    if (socialVerification) {
      const clearCookie = clearSocialVerificationCookie(request, env, 'signup');
      if (clearCookie) headers.append('Set-Cookie', clearCookie);
    }

    return json(request, env, {
      success: true,
      data: { userId, email, name, username },
      token: session.token,
    }, {
      status: 201,
      headers,
    });
  } catch (err) {
    console.error('Register error:', err);
    return json(request, env, { success: false, error: '회원가입 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
