import { hashPassword, requireAdmin, requireSession } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const userId = params.id;

  try {
    const user = await env.DB.prepare(
      'SELECT id, email, name, username, phone, profile_image_url, role, membership_level, birth_year, birth_month, birth_day, gender, nationality, sns_link, preferred_category, created_at FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return json(context.request, env, { success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    return json(context.request, env, { success: true, data: user });
  } catch (err) {
    return json(context.request, env, { success: false, error: '프로필 조회 중 오류' }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const allowedFields = ['name', 'phone', 'profile_image_url', 'sns_link', 'preferred_category', 'birth_year', 'birth_month', 'birth_day', 'gender', 'nationality'];
    const isAdmin = auth.user.role === 'admin';

    if (!isAdmin && auth.user.id !== userId) {
      return json(request, env, { success: false, error: '본인 프로필만 수정할 수 있습니다.' }, { status: 403 });
    }

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (isAdmin && body.role !== undefined) {
      updates.push('role = ?');
      values.push(body.role);
    }

    if (body.new_password) {
      if (body.new_password.length < 8) {
        return json(request, env, { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
      }
      const password_hash = await hashPassword(body.new_password);
      updates.push('password_hash = ?');
      values.push(password_hash);
    }

    if (updates.length === 0) {
      return json(request, env, { success: false, error: '수정할 항목이 없습니다.' }, { status: 400 });
    }

    updates.push('updated_at = datetime("now")');
    values.push(userId);

    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    const updated = await env.DB.prepare(
      'SELECT id, email, name, username, phone, profile_image_url, role, membership_level FROM users WHERE id = ?'
    ).bind(userId).first();

    return json(request, env, { success: true, data: updated });
  } catch (err) {
    return json(request, env, { success: false, error: '프로필 수정 중 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const userId = params.id;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

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
