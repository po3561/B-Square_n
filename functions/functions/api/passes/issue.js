import { requireClassManager } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { refreshClassStats } from '../_lib/class_support.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { class_id, user_id, amount, reason } = body;

    if (!class_id || !user_id || !amount) {
      return json(request, env, { success: false, error: 'class_id, user_id, amount 필수' }, { status: 400 });
    }

    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;

    try {
      const existing = await env.DB.prepare(`
        SELECT * FROM user_passes WHERE user_id = ? AND class_id = ?
      `).bind(user_id, class_id).first();

      if (existing) {
        const newRemaining = (existing.remaining_count ?? existing.remaining_passes ?? existing.remaining ?? 0) + amount;
        const newTotal = (existing.total_count ?? existing.total_passes ?? existing.total ?? 0) + amount;
        await env.DB.prepare(`
          UPDATE user_passes SET remaining_count = ?, total_count = ?, updated_at = datetime('now')
          WHERE user_id = ? AND class_id = ?
        `).bind(newRemaining, newTotal, user_id, class_id).run();
      } else {
        const passId = 'pass_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT INTO user_passes (id, user_id, class_id, pass_type, remaining_count, total_count, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `).bind(passId, user_id, class_id, 'count', amount, amount).run();
      }
    } catch (e) {
      console.warn('[Pass Issue] canonical upsert failed, trying legacy columns:', e.message);
      try {
        const passId = 'pass_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT OR REPLACE INTO user_passes (id, user_id, class_id, remaining, total, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `).bind(passId, user_id, class_id, amount, amount).run();
      } catch (e2) {
        console.error('[Pass Issue] All insert attempts failed:', e2.message);
      }
    }

    const logReason = reason || 'manual';
    try {
      await env.DB.prepare(`
        INSERT INTO pass_issue_logs (class_id, user_id, amount, reason, issued_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(class_id, user_id, amount, logReason, auth.user.id).run();
    } catch (e) {
      console.warn('[Pass Issue] Log insert failed:', e.message);
    }

    await refreshClassStats(env.DB, class_id).catch((error) => {
      console.warn('[Pass Issue] refreshClassStats after issue failed:', error.message);
    });

    return json(request, env, {
      success: true,
      message: `수강권 ${amount}개가 발행되었습니다.`,
      data: { class_id, user_id, amount, reason: logReason }
    });

  } catch (err) {
    return json(request, env, { success: false, error: '수강권 발행 오류', detail: err.message }, { status: 500 });
  }
}

// GET — 발행 로그 조회
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  if (!class_id) {
    return json(request, env, { success: false, error: 'class_id 필수' }, { status: 400 });
  }

  try {
    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;

    const { results } = await env.DB.prepare(`
      SELECT * FROM pass_issue_logs WHERE class_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(class_id).all();

    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: '로그 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
