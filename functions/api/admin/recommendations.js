import { ensureClassStatsSchema, ensureClassesSchema, ensureRecommendationsSchema } from '../_lib/schema.js';
import { loadClassesByIds } from '../_lib/class_support.js';
import { json as jsonResponse, options } from '../_lib/http.js';

function json(request, env, data, init = {}) {
  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    ...(init.headers || {}),
  };
  return jsonResponse(request, env, data, { ...init, headers });
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function extractClassIds(rawFolder) {
  const directClassIds = parseMaybeJsonArray(rawFolder?.classIds);
  const snakeClassIds = parseMaybeJsonArray(rawFolder?.class_ids);
  const classObjects = Array.isArray(rawFolder?.classes) ? rawFolder.classes : [];
  const objectIds = classObjects.map((item) => item?.id ?? item?.class_id ?? item);

  return uniqueStrings([...directClassIds, ...snakeClassIds, ...objectIds]);
}

function normalizeFolder(rawFolder, fallbackType) {
  if (!rawFolder || typeof rawFolder !== 'object') return null;

  const type = rawFolder.type === 'popular' ? 'popular' : fallbackType;
  const id = String(rawFolder.id || rawFolder.folder_id || (type === 'popular' ? 'popular_main' : '')).trim();
  const title = String(rawFolder.title || '').trim();
  const description = String(rawFolder.description || '').trim();
  const category = String(rawFolder.category || 'all').trim() || 'all';
  const orderNumber = Number(rawFolder.order ?? rawFolder.sort_order ?? 0);
  const order = Number.isFinite(orderNumber) ? orderNumber : 0;
  const classIds = extractClassIds(rawFolder);

  if (!id) {
    return { error: 'Folder id is required' };
  }

  if (type === 'popular') {
    return {
      id,
      title: title || '인기 클래스',
      description,
      category,
      type,
      classIds,
      order,
    };
  }

  if (!title) {
    return { error: 'Folder title is required' };
  }

  return {
    id,
    title,
    description,
    category,
    type,
    classIds,
    order,
  };
}

function parseRequestTargetType(body) {
  const explicitType = body?.targetType;
  if (explicitType === 'popular' || explicitType === 'regular') {
    return explicitType;
  }

  if (Array.isArray(body?.folders) && body.folders.length > 0) {
    return body.folders[0]?.type === 'popular' ? 'popular' : 'regular';
  }

  return 'regular';
}

function parseDeletedFolderIds(body) {
  const raw =
    body?.deletedFolderIds ??
    body?.removedFolderIds ??
    body?.deletedIds ??
    body?.removedIds ??
    [];

  return uniqueStrings(parseMaybeJsonArray(raw));
}

async function enrichFolders(db, folders) {
  const classIds = Array.isArray(folders)
    ? folders.flatMap((folder) => parseMaybeJsonArray(folder.class_ids))
    : [];
  const classMap = await loadClassesByIds(db, classIds, { publicOnly: false });

  return (folders || []).map((folder) => {
    const folderClassIds = parseMaybeJsonArray(folder.class_ids);
    const folderClasses = folderClassIds
      .map((id) => {
        const classData = classMap.get(String(id));
        if (!classData) {
          console.warn('[API /admin/recommendations] Missing class for recommendation entry:', id);
        }
        return classData || null;
      })
      .filter(Boolean);

    return {
      folder_id: folder.folder_id,
      title: folder.title,
      description: folder.description || '',
      category: folder.category || 'all',
      type: folder.type || 'regular',
      sort_order: folder.sort_order,
      class_ids: folderClassIds,
      classes: folderClasses,
    };
  });
}

async function upsertFolders(db, folders) {
  if (!folders.length) return;

  const stmts = folders.map((folder) =>
    db
      .prepare(`
        INSERT INTO recommendations (
          folder_id,
          title,
          description,
          type,
          category,
          class_ids,
          sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(folder_id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          type = excluded.type,
          category = excluded.category,
          class_ids = excluded.class_ids,
          sort_order = excluded.sort_order
      `)
      .bind(
        folder.id,
        folder.title,
        folder.description || '',
        folder.type,
        folder.category || 'all',
        JSON.stringify(folder.classIds || []),
        folder.order || 0,
      ),
  );

  await db.batch(stmts);
}

async function deleteFolders(db, type, folderIds) {
  const ids = uniqueStrings(folderIds);
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');
  await db
    .prepare(`DELETE FROM recommendations WHERE type = ? AND folder_id IN (${placeholders})`)
    .bind(type, ...ids)
    .run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  try {
    await ensureRecommendationsSchema(db);
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);

    if (method === 'GET') {
      const { results: folders } = await db
        .prepare(`
          SELECT folder_id, title, description, type, category, class_ids, sort_order
          FROM recommendations
          ORDER BY CASE WHEN type = 'popular' THEN 0 ELSE 1 END, sort_order ASC, folder_id ASC
        `)
        .all();

      const enrichedFolders = await enrichFolders(db, folders || []);
      return json(request, env, { success: true, data: enrichedFolders });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const incomingFolders = Array.isArray(body?.folders) ? body.folders : [];
      const targetType = parseRequestTargetType(body);
      const deletedFolderIds = parseDeletedFolderIds(body);
      const normalizedFolders = [];

      for (const rawFolder of incomingFolders) {
        const normalized = normalizeFolder(rawFolder, targetType);
        if (!normalized) continue;
        if (normalized.error) {
          return json(request, env, { success: false, error: normalized.error }, { status: 400 });
        }
        if (normalized.type !== targetType) {
          return json(request, env, { success: false, error: 'Mixed recommendation types are not allowed in one request' }, { status: 400 });
        }
        normalizedFolders.push(normalized);
      }

      if (targetType === 'popular' && normalizedFolders.length > 1) {
        return json(request, env, { success: false, error: 'Popular recommendations require exactly one folder payload' }, { status: 400 });
      }

      const incomingIds = new Set(normalizedFolders.map((folder) => folder.id));
      const safeDeletedIds = deletedFolderIds.filter((id) => !incomingIds.has(id));

      await upsertFolders(db, normalizedFolders);
      await deleteFolders(db, targetType, safeDeletedIds);

      return json(request, env, {
        success: true,
        message: 'Saved successfully',
        savedCount: normalizedFolders.length,
        deletedCount: safeDeletedIds.length,
      });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (err) {
    console.error('[API /admin/recommendations] Error:', err);
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions({ request, env }) {
  return options(request, env, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  });
}
