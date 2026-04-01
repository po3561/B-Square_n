import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function maskEmail(email) {
  const normalized = normalizeText(email);
  if (!normalized || !normalized.includes('@')) return '';
  const [local, domain] = normalized.split('@');
  const prefix = local.slice(0, 2);
  const suffix = local.length > 2 ? '*'.repeat(Math.min(4, local.length - 2)) : '*';
  return `${prefix}${suffix}@${domain}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const body = await request.json();
    const email = normalizeEmail(body?.email);

    if (!email || !email.includes('@')) {
      return json(request, env, {
        success: false,
        error: '유효한 이메일 주소를 입력해 주세요.',
      }, { status: 400 });
    }

    const user = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `).bind(email).first();

    return json(request, env, {
      success: true,
      data: {
        found: Boolean(user),
        masked_email: maskEmail(email),
        message: '입력하신 이메일로 계정 확인과 비밀번호 재설정을 진행할 수 있습니다.',
      },
    });
  } catch (error) {
    console.error('[auth/account-lookup] error:', error);
    return json(request, env, {
      success: false,
      error: '계정 정보를 확인하지 못했습니다.',
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
