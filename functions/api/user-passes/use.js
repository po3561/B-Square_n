import { requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { refreshClassStats } from '../_lib/class_support.js';

function pickRemaining(row) {
  return row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0;
}

function pickTotal(row) {
  return row.total_count ?? row.total_passes ?? row.total ?? pickRemaining(row);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const classId = body.class_id;

    if (!classId) {
      return json(request, env, { success: false, error: 'class_id가 필요합니다.' }, { status: 400 });
    }

    const pass = await env.DB.prepare(`
      SELECT *
      FROM user_passes
      WHERE user_id = ? AND class_id = ? AND status = 'active'
      LIMIT 1
    `).bind(auth.user.id, classId).first();

    if (!pass) {
      return json(request, env, { success: false, error: '사용 가능한 수강권이 없습니다.' }, { status: 404 });
    }

    const remaining = pickRemaining(pass);
    if (remaining <= 0) {
      return json(request, env, { success: false, error: '남은 수강권이 없습니다.' }, { status: 409 });
    }

    const nextRemaining = remaining - 1;
    const total = pickTotal(pass);

    await env.DB.prepare(`
      UPDATE user_passes
      SET remaining_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextRemaining, pass.id).run().catch(async () => {
      await env.DB.prepare(`
        UPDATE user_passes
        SET remaining_passes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(nextRemaining, pass.id).run().catch(async () => {
        await env.DB.prepare(`
          UPDATE user_passes
          SET remaining = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(nextRemaining, pass.id).run();
      });
    });

    await refreshClassStats(env.DB, classId).catch((error) => {
      console.warn('[API /user-passes/use] refreshClassStats after use failed:', error.message);
    });

    return json(request, env, {
      success: true,
      data: {
        class_id: classId,
        user_id: auth.user.id,
        remaining_count: nextRemaining,
        total_count: total,
      },
      message: '수강권 1회가 차감되었습니다.',
    });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: '수강권 사용 처리 중 오류가 발생했습니다.',
      detail: error.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
