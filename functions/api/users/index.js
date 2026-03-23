import { applyMasterAdminOverride, isAtLeastRole, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema, ensureClassesSchema } from '../_lib/schema.js';

const MAX_LIMIT = 5000;

function buildBirthdate(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join('-') : '';
}

function normalizeSearch(value) {
  return String(value || '').trim();
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  if (!isAtLeastRole(auth.user.role, 'operator')) {
    return json(request, env, { success: false, error: '운영자 이상만 회원 목록을 볼 수 있습니다.' }, { status: 403 });
  }

  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);

  try {
    const url = new URL(request.url);
    const search = normalizeSearch(url.searchParams.get('q') || url.searchParams.get('search'));
    const role = normalizeSearch(url.searchParams.get('role'));
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || MAX_LIMIT, MAX_LIMIT));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      const term = `%${search}%`;
      where += ' AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
      params.push(term, term, term, term);
    }

    if (role && role !== 'all') {
      where += ' AND u.role = ?';
      params.push(role);
    }

    const { results } = await env.DB.prepare(`
      SELECT
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
        u.operator_seq,
        u.is_blacklisted,
        u.blacklisted_at,
        u.blacklisted_by,
        u.blacklist_reason,
        u.role_updated_by,
        u.role_updated_at,
        u.created_at,
        u.updated_at
      FROM users u
      ${where}
      ORDER BY datetime(COALESCE(u.updated_at, u.created_at)) DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const users = (results || []).map((user) => {
      const normalized = applyMasterAdminOverride(user);
      return {
        ...normalized,
        nickname: normalized.username || '',
        birthdate: buildBirthdate(normalized),
        signup_date: normalized.created_at || '',
        is_blacklisted: normalizeBoolean(normalized.is_blacklisted),
      };
    });

    return json(request, env, {
      success: true,
      data: users,
      total: users.length,
    });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
