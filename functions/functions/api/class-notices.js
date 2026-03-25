import { requireSession, normalizeRole, isAtLeastRole } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import {
  ensureBoardCompatSchema,
  labelClassNoticeRoleText,
  normalizeClassNotice,
} from './_lib/board_compat.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
};

function parseSubInstructorIds(rawValue) {
  if (!rawValue) return [];

  let parsed = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.id || item.user_id || item.userId || '';
      }
      return '';
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function getAuthorRole(user, classRow) {
  const normalizedRole = normalizeRole(user?.role);
  if (normalizedRole === 'admin' || normalizedRole === 'super_admin' || normalizedRole === 'operator') {
    return normalizedRole;
  }

  const userId = String(user?.id || '').trim();
  if (userId && String(classRow?.creator_id || '').trim() === userId) {
    return 'main_instructor';
  }

  if (userId && parseSubInstructorIds(classRow?.sub_instructors).includes(userId)) {
    return 'sub_instructor';
  }

  return 'instructor';
}

function canManageClassNotice(user, classRow) {
  const normalizedRole = normalizeRole(user?.role);
  if (isAtLeastRole(normalizedRole, 'operator')) return true;
  if (normalizedRole === 'instructor') return true;

  const userId = String(user?.id || '').trim();
  if (userId && String(classRow?.creator_id || '').trim() === userId) return true;
  if (userId && parseSubInstructorIds(classRow?.sub_instructors).includes(userId)) return true;

  return false;
}

async function loadClassRow(db, classId) {
  return await db.prepare(`
    SELECT id, title, creator_id, sub_instructors
    FROM classes
    WHERE id = ?
  `).bind(classId).first().catch(() => null);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  try {
    await ensureBoardCompatSchema(env.DB);

    let query = `
      SELECT
        cn.*,
        c.title AS class_title,
        c.creator_id AS class_creator_id,
        c.sub_instructors AS class_sub_instructors
      FROM class_notices cn
      LEFT JOIN classes c ON c.id = cn.class_id
    `;
    const binds = [];

    if (class_id) {
      query += ' WHERE cn.class_id = ?';
      binds.push(class_id);
    }

    query += ' ORDER BY datetime(cn.created_at) DESC, cn.id DESC';

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    const items = Array.isArray(results)
      ? results.map((row) => {
          const normalized = normalizeClassNotice(row);
          if (!normalized) return null;
          let authorRole = normalized.author_role;
          if (!authorRole && normalized.author_id) {
            const authorId = String(normalized.author_id || '').trim();
            if (authorId && String(row.class_creator_id || '').trim() === authorId) {
              authorRole = 'main_instructor';
            } else if (authorId && parseSubInstructorIds(row.class_sub_instructors).includes(authorId)) {
              authorRole = 'sub_instructor';
            }
          }
          return {
            ...normalized,
            class_title: normalized.class_title || normalized.class_name || normalized.class_id || '',
            author_role: authorRole || normalized.author_role || null,
            author_role_label: labelClassNoticeRoleText(authorRole || normalized.author_role),
          };
        }).filter(Boolean)
      : [];

    return json(request, env, { success: true, data: items }, { headers: RESPONSE_HEADERS });
  } catch (err) {
    return json(request, env, { success: false, error: '클래스 공지 조회 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureBoardCompatSchema(env.DB);
    const body = await request.json();
    const { class_id, title, content, author_name } = body;

    if (!class_id || !title) {
      return json(request, env, { success: false, error: '필수 항목(class_id, title) 누락' }, { status: 400 });
    }

    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;

    const classRow = await loadClassRow(env.DB, class_id);
    if (!canManageClassNotice(auth.user, classRow)) {
      return json(request, env, { success: false, error: '클래스 공지 작성 권한이 없습니다.' }, { status: 403 });
    }

    const noticeId = 'noti_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const authorRole = getAuthorRole(auth.user, classRow);
    const snapshotClassName = classRow?.title || body.class_name || '';
    const authorName = author_name || auth.user.name || auth.user.username || '강사';

    await env.DB.prepare(`
      INSERT INTO class_notices (
        id, push_key, class_id, class_name, title, content,
        author_id, author_name, author_role, views
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      noticeId,
      noticeId,
      class_id,
      snapshotClassName,
      title,
      content || '',
      auth.user.id || null,
      authorName,
      authorRole,
      0,
    ).run();

    return json(request, env, {
      success: true,
      data: {
        id: noticeId,
        author_role: authorRole,
        author_role_label: labelClassNoticeRoleText(authorRole),
      },
    }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: '클래스 공지 작성 오류', detail: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await ensureBoardCompatSchema(env.DB);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return json(request, env, { success: false, error: 'ID is required' }, { status: 400 });
    }

    const notice = await env.DB.prepare('SELECT * FROM class_notices WHERE id = ? OR push_key = ?').bind(id, id).first();
    if (!notice) {
      return json(request, env, { success: true, message: 'Deleted' });
    }

    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;

    const classRow = await loadClassRow(env.DB, notice.class_id);
    if (!canManageClassNotice(auth.user, classRow)) {
      return json(request, env, { success: false, error: '클래스 공지 삭제 권한이 없습니다.' }, { status: 403 });
    }

    await env.DB.prepare('DELETE FROM class_notices WHERE id = ? OR push_key = ?').bind(id, id).run();
    return json(request, env, { success: true, message: 'Deleted' });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
