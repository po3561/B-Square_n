import { applyMasterAdminOverride, hashPassword, isAtLeastRole, isMasterAdminUserId, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureAuthSchema, ensureClassesSchema, ensureOperationsSchema } from '../_lib/schema.js';
import { normalizeLanguagePreference, normalizeThemePreference } from '../_lib/preferences.js';

function buildBirthDate(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join('-') : '';
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

function normalizeDate(value) {
  return value || null;
}

function sumMoney(rows, fields) {
  return rows.reduce((total, row) => {
    for (const field of fields) {
      const value = Number(row[field] || 0);
      if (Number.isFinite(value) && value > 0) return total + value;
    }
    return total;
  }, 0);
}

function classKey(row) {
  return row?.class_id || row?.id || row?.title || '';
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function dedupeBySignature(items, getSignature) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const signature = getSignature(item);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }

  return result;
}

function blacklistSignature(row) {
  return [
    normalizeText(row?.user_id),
    normalizeText(row?.previous_state),
    normalizeText(row?.new_state),
    normalizeText(row?.changed_by),
    normalizeText(row?.reason),
  ].join('|');
}

function refundSignature(row) {
  return [
    normalizeText(row?.user_id),
    normalizeText(row?.order_id),
    normalizeText(row?.class_id),
    normalizeText(row?.refund_type),
    normalizeText(row?.original_amount),
    normalizeText(row?.refund_amount),
    normalizeText(row?.reason_tags),
    normalizeText(row?.reason_note),
    normalizeText(row?.status),
    normalizeText(row?.processed_by),
  ].join('|');
}

async function safeQueryAll(db, sql, binds = []) {
  try {
    const result = await db.prepare(sql).bind(...binds).all();
    return result.results || [];
  } catch (error) {
    console.warn('[API /users/:id] query failed:', error.message);
    return [];
  }
}

async function safeQueryOne(db, sql, binds = []) {
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch (error) {
    console.warn('[API /users/:id] query failed:', error.message);
    return null;
  }
}

async function loadMemberDetail(db, userId) {
  const user = applyMasterAdminOverride(await safeQueryOne(db, `
    SELECT
      id, email, name, username, phone, profile_image_url, role, membership_level,
      birth_year, birth_month, birth_day, gender, nationality, sns_link,
      preferred_category, preferred_language, preferred_theme, mfa_active,
      marketing_sms_consent, marketing_email_consent, marketing_consent_updated_at,
      operator_seq, role_updated_by, role_updated_at,
      is_blacklisted, blacklisted_at, blacklisted_by, blacklist_reason,
      referrer_code, created_at, updated_at
    FROM users
    WHERE id = ?
  `, [userId]));

  if (!user) return null;

  const enrollments = await safeQueryAll(db, `
    SELECT
      e.id,
      e.user_id,
      e.class_id,
      e.pay_method,
      e.amount,
      e.applied_coupon,
      e.status,
      e.enrolled_at,
      e.created_at,
      e.updated_at,
      c.title AS class_title,
      c.category AS class_category,
      c.image_url AS class_image_url,
      c.creator_id AS instructor_id,
      c.creator_email AS instructor_email,
      c.operating_mode,
      c.class_type
    FROM enrollments e
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE e.user_id = ?
    ORDER BY datetime(COALESCE(e.enrolled_at, e.created_at)) DESC
  `, [userId]);

  const ongoingClasses = enrollments.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    return ['active', 'enrolled', 'ongoing', 'progress'].includes(status);
  });

  const paymentRows = await safeQueryAll(db, `
    SELECT
      order_id,
      class_id,
      class_title,
      order_type,
      amount,
      discount_amount,
      final_amount,
      pay_method,
      status,
      created_at,
      paid_at,
      refunded_at
    FROM orders
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(paid_at, created_at)) DESC
  `, [userId]);

  const passRows = await safeQueryAll(db, `
    SELECT
      up.id,
      up.user_id,
      up.class_id,
      up.pass_type,
      up.remaining_count,
      up.total_count,
      up.status,
      up.created_at,
      up.updated_at,
      c.title AS class_title,
      c.category AS class_category
    FROM user_passes up
    LEFT JOIN classes c ON c.id = up.class_id
    WHERE up.user_id = ?
    ORDER BY datetime(COALESCE(up.updated_at, up.created_at)) DESC
  `, [userId]);

  const refundRows = await safeQueryAll(db, `
    SELECT
      id,
      user_id,
      order_id,
      class_id,
      class_title,
      refund_type,
      original_amount,
      refund_amount,
      reason_tags,
      reason_note,
      status,
      processed_by,
      processed_at,
      metadata,
      created_at
    FROM user_refund_logs
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(processed_at, created_at)) DESC
  `, [userId]);

  const blacklistRows = await safeQueryAll(db, `
    SELECT
      id,
      user_id,
      previous_state,
      new_state,
      changed_by,
      reason,
      created_at
    FROM user_blacklist_logs
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `, [userId]);

  const instructorClasses = await safeQueryAll(db, `
    SELECT
      id,
      creator_id,
      creator_email,
      title,
      category,
      image_url,
      operating_mode,
      class_type,
      price,
      is_approved,
      current_participants,
      created_at,
      updated_at
    FROM classes
    WHERE creator_id = ?
    ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
  `, [userId]);

  const participantRows = await safeQueryAll(db, `
    SELECT
      cp.class_id,
      cp.role,
      cp.remaining_passes,
      cp.pass_type,
      COALESCE(e.enrolled_at, e.created_at) AS joined_at,
      c.title AS class_title,
      c.category AS class_category,
      c.image_url AS class_image_url
    FROM class_participants cp
    LEFT JOIN classes c ON c.id = cp.class_id
    LEFT JOIN enrollments e ON e.class_id = cp.class_id AND e.user_id = cp.user_id
    WHERE cp.user_id = ?
    ORDER BY datetime(COALESCE(e.enrolled_at, e.created_at)) DESC
  `, [userId]);

  const passTotals = passRows.reduce((acc, row) => {
    const remaining = Number(row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0) || 0;
    const total = Number(row.total_count ?? row.total_passes ?? row.total ?? remaining) || 0;
    acc.remaining += remaining;
    acc.total += total;
    return acc;
  }, { remaining: 0, total: 0 });

  const paidOrders = paymentRows.filter((row) => {
    const status = String(row.status || '').toLowerCase();
    return status !== 'refunded' && (row.paid_at || ['paid', 'completed', 'done', 'success'].includes(status));
  });

  const activeClassMap = new Map();
  for (const row of ongoingClasses) {
    activeClassMap.set(classKey(row), {
      class_id: row.class_id,
      class_title: row.class_title || '-',
      class_category: row.class_category || '',
      class_image_url: row.class_image_url || '',
      instructor_id: row.instructor_id || null,
      instructor_email: row.instructor_email || null,
      operating_mode: row.operating_mode || '',
      class_type: row.class_type || '',
      enrollment_status: row.status || '',
      enrolled_at: row.enrolled_at || row.created_at || null,
      amount: Number(row.amount || 0),
      pay_method: row.pay_method || '',
    });
  }

  for (const row of participantRows) {
    const key = row.class_id;
    if (!activeClassMap.has(key)) {
      activeClassMap.set(key, {
        class_id: row.class_id,
        class_title: row.class_title || '-',
        class_category: row.class_category || '',
        class_image_url: row.class_image_url || '',
        instructor_id: null,
        instructor_email: null,
        operating_mode: '',
        class_type: '',
        enrollment_status: row.role || '',
        enrolled_at: row.joined_at || null,
        amount: 0,
        pay_method: '',
      });
    }
  }

  const refundLogs = dedupeBySignature(refundRows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    order_id: row.order_id,
    class_id: row.class_id,
    class_title: row.class_title || '',
    refund_type: row.refund_type || 'full',
    original_amount: Number(row.original_amount || 0),
    refund_amount: Number(row.refund_amount || 0),
    reason_tags: row.reason_tags || '',
    reason_note: row.reason_note || '',
    status: row.status || '',
    processed_by: row.processed_by || '',
    processed_at: row.processed_at || '',
    metadata: row.metadata || '',
    created_at: row.created_at || '',
  })), refundSignature);

  const blacklistLogs = dedupeBySignature(blacklistRows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    previous_state: normalizeBoolean(row.previous_state),
    new_state: normalizeBoolean(row.new_state),
    changed_by: row.changed_by || '',
    reason: row.reason || '',
    created_at: row.created_at || '',
  })), blacklistSignature);

  return {
    user: {
      ...user,
      nickname: user.username || '',
      birthdate: buildBirthDate(user),
      signup_date: user.created_at || '',
      is_blacklisted: normalizeBoolean(user.is_blacklisted),
      blacklisted_at: normalizeDate(user.blacklisted_at),
    },
    summary: {
      subscribed_class_count: enrollments.length,
      ongoing_class_count: ongoingClasses.length || activeClassMap.size,
      paid_order_count: paidOrders.length,
      total_paid_amount: sumMoney(paidOrders, ['final_amount', 'amount']),
      pass_total_count: passTotals.total,
      pass_remaining_count: passTotals.remaining,
      refund_count: refundLogs.length,
      refund_total_amount: sumMoney(refundLogs, ['refund_amount']),
      instructor_class_count: instructorClasses.length,
    },
    subscribed_classes: enrollments.map((row) => ({
      class_id: row.class_id,
      class_title: row.class_title || '-',
      class_category: row.class_category || '',
      class_image_url: row.class_image_url || '',
      instructor_id: row.instructor_id || null,
      instructor_email: row.instructor_email || null,
      operating_mode: row.operating_mode || '',
      class_type: row.class_type || '',
      status: row.status || '',
      enrolled_at: row.enrolled_at || row.created_at || null,
      amount: Number(row.amount || 0),
      pay_method: row.pay_method || '',
      applied_coupon: row.applied_coupon || '',
    })),
    ongoing_classes: Array.from(activeClassMap.values()),
    payments: paymentRows.map((row) => ({
      order_id: row.order_id,
      class_id: row.class_id,
      class_title: row.class_title || '',
      order_type: row.order_type || '',
      amount: Number(row.amount || 0),
      discount_amount: Number(row.discount_amount || 0),
      final_amount: Number(row.final_amount || 0),
      pay_method: row.pay_method || '',
      status: row.status || '',
      created_at: row.created_at || '',
      paid_at: row.paid_at || null,
      refunded_at: row.refunded_at || null,
    })),
    passes: passRows.map((row) => ({
      id: row.id,
      class_id: row.class_id,
      class_title: row.class_title || '',
      class_category: row.class_category || '',
      pass_type: row.pass_type || '',
      remaining_count: Number(row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0) || 0,
      total_count: Number(row.total_count ?? row.total_passes ?? row.total ?? 0) || 0,
      status: row.status || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    })),
    refund_logs: refundLogs,
    blacklist_logs: blacklistLogs,
    instructor_classes: instructorClasses.map((row) => ({
      id: row.id,
      creator_id: row.creator_id,
      creator_email: row.creator_email || '',
      title: row.title || '',
      category: row.category || '',
      image_url: row.image_url || '',
      operating_mode: row.operating_mode || '',
      class_type: row.class_type || '',
      price: Number(row.price || 0),
      is_approved: normalizeBoolean(row.is_approved),
      current_participants: Number(row.current_participants || 0),
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    })),
    class_participants: participantRows,
  };
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);
  await ensureOperationsSchema(env.DB);

  try {
    const detailedAccess = isAtLeastRole(auth.user.role, 'operator') || auth.user.id === userId;
    if (!detailedAccess) {
      return json(request, env, { success: false, error: '조회 권한이 없습니다.' }, { status: 403 });
    }

    const detail = await loadMemberDetail(env.DB, userId);
    if (!detail) {
      return json(request, env, { success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    return json(request, env, { success: true, data: detail });
  } catch (err) {
    return json(request, env, { success: false, error: '사용자 조회 중 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);
  await ensureOperationsSchema(env.DB);

  try {
    const body = await request.json();
    const currentUser = applyMasterAdminOverride(await safeQueryOne(env.DB, `
      SELECT id, role, is_blacklisted
      FROM users
      WHERE id = ?
    `, [userId]));

    if (!currentUser) {
      return json(request, env, { success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const updates = [];
    const values = [];
    const canEditSelf = auth.user.id === userId;
    const canManageMembers = isAtLeastRole(auth.user.role, 'operator');
    const canEditRole = isAtLeastRole(auth.user.role, 'admin');

    if (isMasterAdminUserId(userId) && body.role !== undefined && body.role !== 'super_admin') {
      return json(request, env, { success: false, error: '총괄 운영자 계정은 변경할 수 없습니다.' }, { status: 403 });
    }

    const editableFields = [
      'name',
      'phone',
      'profile_image_url',
      'sns_link',
      'preferred_category',
      'preferred_language',
      'preferred_theme',
      'referrer_code',
      'birth_year',
      'birth_month',
      'birth_day',
      'gender',
      'nationality',
    ];

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        if (!canEditSelf && !canManageMembers) {
          return json(request, env, { success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
        }
        let nextValue = typeof body[field] === 'string' ? body[field].trim() : body[field];
        if (field === 'preferred_language') {
          nextValue = normalizeLanguagePreference(nextValue);
        } else if (field === 'preferred_theme') {
          nextValue = normalizeThemePreference(nextValue);
        }
        updates.push(`${field} = ?`);
        values.push(nextValue === '' ? null : nextValue);
      }
    }

    if (body.mfa_active !== undefined) {
      if (!canEditSelf && !canManageMembers) {
        return json(request, env, { success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
      }
      updates.push('mfa_active = ?');
      values.push(normalizeBoolean(body.mfa_active) ? 1 : 0);
    }

    const marketingTouched = body.marketing_sms_consent !== undefined || body.marketing_email_consent !== undefined;
    if (marketingTouched) {
      if (!canEditSelf && !canManageMembers) {
        return json(request, env, { success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
      }

      if (body.marketing_sms_consent !== undefined) {
        updates.push('marketing_sms_consent = ?');
        values.push(normalizeBoolean(body.marketing_sms_consent) ? 1 : 0);
      }
      if (body.marketing_email_consent !== undefined) {
        updates.push('marketing_email_consent = ?');
        values.push(normalizeBoolean(body.marketing_email_consent) ? 1 : 0);
      }

      updates.push('marketing_consent_updated_at = ?');
      values.push(new Date().toISOString());
    }

    if (body.membership_level !== undefined) {
      if (!canEditSelf && !canManageMembers) {
        return json(request, env, { success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
      }
      updates.push('membership_level = ?');
      values.push(normalizeText(body.membership_level));
    }

    let blacklistNoop = false;
    let skipUpdatedAt = false;
    if (body.blacklisted !== undefined) {
      if (!canManageMembers) {
        return json(request, env, { success: false, error: '블랙리스트 관리 권한이 없습니다.' }, { status: 403 });
      }

      const nextBlacklisted = normalizeBoolean(body.blacklisted);
      const currentBlacklisted = normalizeBoolean(currentUser.is_blacklisted);
      if (nextBlacklisted === currentBlacklisted) {
        blacklistNoop = true;
        skipUpdatedAt = true;
        updates.push('updated_at = datetime("now")');
        values.push(userId);
      } else {
        const reason = String(body.blacklist_reason || body.reason || '').trim() || null;
        updates.push('is_blacklisted = ?');
        values.push(nextBlacklisted ? 1 : 0);
        updates.push('blacklisted_at = ?');
        values.push(nextBlacklisted ? new Date().toISOString() : null);
        updates.push('blacklisted_by = ?');
        values.push(nextBlacklisted ? auth.user.id : null);
        updates.push('blacklist_reason = ?');
        values.push(nextBlacklisted ? reason : null);

        await env.DB.prepare(`
          INSERT INTO user_blacklist_logs (id, user_id, previous_state, new_state, changed_by, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          currentBlacklisted ? 1 : 0,
          nextBlacklisted ? 1 : 0,
          auth.user.id,
          reason,
        ).run();
      }
    }

    if (body.role !== undefined) {
      if (!canEditRole) {
        return json(request, env, { success: false, error: '역할 수정 권한이 없습니다.' }, { status: 403 });
      }

      updates.push('role = ?');
      values.push(body.role);
      updates.push('role_updated_by = ?');
      values.push(auth.user.id);
      updates.push('role_updated_at = ?');
      values.push(new Date().toISOString());

      await env.DB.prepare(`
        INSERT INTO user_role_logs (id, user_id, previous_role, new_role, changed_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        `rol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        currentUser.role || 'user',
        body.role,
        auth.user.id,
        body.reason || null,
      ).run();
    }

    if (body.new_password) {
      if (!canEditSelf && !canEditRole) {
        return json(request, env, { success: false, error: '비밀번호 수정 권한이 없습니다.' }, { status: 403 });
      }

      if (String(body.new_password).length < 8) {
        return json(request, env, { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
      }

      const password_hash = await hashPassword(String(body.new_password));
      updates.push('password_hash = ?');
      values.push(password_hash);
    }

    if (updates.length === 0) {
      return json(request, env, { success: false, error: '수정할 항목이 없습니다.' }, { status: 400 });
    }

    if (!skipUpdatedAt) {
      updates.push('updated_at = datetime("now")');
      values.push(userId);
    }

    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    const detail = await loadMemberDetail(env.DB, userId);
    return json(request, env, { success: true, data: detail?.user || null, detail });
  } catch (err) {
    return json(request, env, { success: false, error: '사용자 수정 중 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  if (!isAtLeastRole(auth.user.role, 'admin')) {
    return json(context.request, env, { success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
    return json(context.request, env, { success: true, message: '사용자가 삭제되었습니다.' });
  } catch (err) {
    return json(context.request, env, { success: false, error: '사용자 삭제 중 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
