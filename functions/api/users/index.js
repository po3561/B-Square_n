import { applyMasterAdminOverride, isAtLeastRole, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema, ensureClassesSchema, ensureOperationsSchema } from '../_lib/schema.js';

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
  await ensureOperationsSchema(env.DB);

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
      WITH recent_enrollments AS (
        SELECT
          e.user_id,
          e.class_id,
          e.enrolled_at,
          e.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY e.user_id
            ORDER BY datetime(COALESCE(e.enrolled_at, e.created_at)) DESC, datetime(COALESCE(e.created_at, e.enrolled_at)) DESC
          ) AS rn
        FROM enrollments e
      ),
      active_pass_counts AS (
        SELECT
          user_id,
          COUNT(*) AS active_pass_count
        FROM user_passes
        WHERE COALESCE(status, 'active') = 'active'
        GROUP BY user_id
      )
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
        u.updated_at,
        c.title AS recent_class_title,
        datetime(COALESCE(re.enrolled_at, re.created_at)) AS recent_class_at,
        COALESCE(ap.active_pass_count, 0) AS active_pass_count
      FROM users u
      LEFT JOIN recent_enrollments re
        ON re.user_id = u.id
       AND re.rn = 1
      LEFT JOIN classes c
        ON c.id = re.class_id
      LEFT JOIN active_pass_counts ap
        ON ap.user_id = u.id
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
        recent_class_title: normalized.recent_class_title || '',
        recent_class_at: normalized.recent_class_at || '',
        active_pass_count: Number(normalized.active_pass_count || 0),
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
