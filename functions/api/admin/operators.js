import { json, options } from '../_lib/http.js';
import { applyMasterAdminOverride, isMasterAdminUserId } from '../_lib/auth.js';
import { ensureAuthSchema, ensureClassesSchema } from '../_lib/schema.js';
import { getRoleLabel, getRoleRank, isAtLeastRole, requireAdmin } from '../_lib/auth.js';

const MAX_LIMIT = 500;
const ALLOWED_ROLES = new Set(['user', 'instructor', 'operator', 'admin']);

function parseSubInstructors(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.id || item.user_id || item.userId || null;
        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildBirthDate(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join('-') : '';
}

function buildClassSummary(userId, classes) {
  const mainClasses = [];
  const subClasses = [];

  for (const cls of classes) {
    if (cls.creator_id === userId) {
      mainClasses.push({
        id: cls.id,
        title: cls.title || '-',
        category: cls.category || '',
      });
      continue;
    }

    if (cls.sub_instructor_ids.includes(userId)) {
      subClasses.push({
        id: cls.id,
        title: cls.title || '-',
        category: cls.category || '',
      });
    }
  }

  return {
    main_classes: mainClasses,
    sub_classes: subClasses,
    class_count: mainClasses.length + subClasses.length,
    main_class_count: mainClasses.length,
    sub_class_count: subClasses.length,
  };
}

function enrichUser(user, classes) {
  const classSummary = buildClassSummary(user.id, classes);
  const role = user.role || 'user';
  return {
    ...user,
    role,
    role_label: getRoleLabel(role),
    role_rank: getRoleRank(role),
    is_operator: isAtLeastRole(role, 'operator'),
    is_instructor: role === 'instructor',
    birthdate: buildBirthDate(user),
    signup_date: user.created_at || '',
    operator_seq: user.operator_seq || null,
    ...classSummary,
  };
}

async function loadOperators(db, filters = {}) {
  const params = [];
  let where = 'WHERE 1=1';

  if (filters.search) {
    where += ' AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }

  if (filters.role) {
    where += ' AND u.role = ?';
    params.push(filters.role);
  }

  const limit = Math.max(1, Math.min(Number(filters.limit) || MAX_LIMIT, MAX_LIMIT));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const { results: users } = await db.prepare(`
    SELECT
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
      u.created_at,
      u.updated_at,
      u.role_updated_by,
      u.role_updated_at
    FROM users u
    ${where}
    ORDER BY datetime(COALESCE(u.role_updated_at, u.created_at)) DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const { results: classes } = await db.prepare(`
    SELECT id, title, category, creator_id, sub_instructors
    FROM classes
  `).all();

  const normalizedClasses = (classes || []).map((cls) => ({
    ...cls,
    sub_instructor_ids: parseSubInstructors(cls.sub_instructors),
  }));

  const items = (users || []).map((user) => enrichUser(applyMasterAdminOverride(user), normalizedClasses));

  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    if (item.role === 'instructor') acc.instructor += 1;
    else if (item.role === 'operator') acc.operator += 1;
    else if (item.role === 'admin' || item.role === 'super_admin') acc.superAdmin += 1;
    else acc.user += 1;
    return acc;
  }, {
    total: 0,
    superAdmin: 0,
    operator: 0,
    instructor: 0,
    user: 0,
  });

  return { items, summary };
}

function canAssignRoleByCaller(callerRole, targetRole) {
  const callerRank = getRoleRank(callerRole);
  const targetRank = getRoleRank(targetRole);

  if (callerRank >= getRoleRank('admin')) {
    return targetRank <= getRoleRank('admin');
  }

  if (callerRank >= getRoleRank('operator')) {
    return targetRank <= getRoleRank('instructor');
  }

  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') return options(request, env);

  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const search = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
      const role = (url.searchParams.get('role') || '').trim();
      const limit = url.searchParams.get('limit') || MAX_LIMIT;
      const offset = url.searchParams.get('offset') || 0;

      const { items, summary } = await loadOperators(db, {
        search,
        role: role && role !== 'all' ? role : '',
        limit,
        offset,
      });

      return json(request, env, {
        success: true,
        data: items,
        summary,
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      const userIds = Array.isArray(body.user_ids) && body.user_ids.length
        ? body.user_ids
        : [body.user_id || body.id].filter(Boolean);
      const nextRole = String(body.role || '').trim();
      const reason = String(body.reason || '').trim() || null;

      if (!userIds.length) {
        return json(request, env, { success: false, error: 'user_id is required' }, { status: 400 });
      }

      if (!ALLOWED_ROLES.has(nextRole)) {
        return json(request, env, { success: false, error: 'Invalid role' }, { status: 400 });
      }

      if (!canAssignRoleByCaller(auth.user.role, nextRole)) {
        return json(request, env, { success: false, error: '해당 권한으로는 이 역할을 부여할 수 없습니다.' }, { status: 403 });
      }

      const changed = [];

      for (const userId of userIds) {
        const currentUser = applyMasterAdminOverride(await db.prepare('SELECT id, role, operator_seq FROM users WHERE id = ?').bind(userId).first());
        if (!currentUser) continue;

        if (isMasterAdminUserId(userId) && nextRole !== 'super_admin') {
          return json(request, env, { success: false, error: '총괄 운영자 계정은 하위 권한으로 변경할 수 없습니다.' }, { status: 403 });
        }

        if (currentUser.role === nextRole) {
          changed.push(currentUser);
          continue;
        }

        let operatorSeq = currentUser.operator_seq || null;
        if (nextRole === 'operator' || nextRole === 'admin') {
          if (!operatorSeq) {
            const seqRow = await db.prepare('SELECT COALESCE(MAX(operator_seq), 0) AS max_seq FROM users WHERE operator_seq IS NOT NULL').first().catch(() => ({ max_seq: 0 }));
            operatorSeq = Number(seqRow?.max_seq || 0) + 1;
          }
        }

        const now = new Date().toISOString();
        await db.prepare(`
          UPDATE users
          SET role = ?, operator_seq = ?, role_updated_by = ?, role_updated_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(nextRole, operatorSeq, auth.user.id, now, userId).run();

        await db.prepare(`
          INSERT INTO user_role_logs (id, user_id, previous_role, new_role, changed_by, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          currentUser.role || 'user',
          nextRole,
          auth.user.id,
          reason,
        ).run();

        const updatedUser = await db.prepare(`
          SELECT
            id, email, name, username, phone, profile_image_url, role, membership_level,
            birth_year, birth_month, birth_day, operator_seq, created_at, updated_at,
            role_updated_by, role_updated_at
          FROM users
          WHERE id = ?
        `).bind(userId).first();
        if (updatedUser) changed.push(updatedUser);
      }

      const { items } = await loadOperators(db, { search: '', role: '', limit: MAX_LIMIT, offset: 0 });
      const finalItems = userIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);

      return json(request, env, {
        success: true,
        data: finalItems.length <= 1 ? (finalItems[0] || null) : finalItems,
        changed_count: changed.length,
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
