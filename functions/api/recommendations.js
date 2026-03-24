import { ensureRecommendationsSchema, ensureClassesSchema, ensureClassStatsSchema } from './_lib/schema.js';
import { loadClassesByIds } from './_lib/class_support.js';
import { json, options } from './_lib/http.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
};

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function parseClassIds(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? uniqueStrings(parsed) : [];
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  try {
    await ensureRecommendationsSchema(db);
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);

    const { results: folders } = await db
      .prepare('SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY type ASC, sort_order ASC')
      .all();

    if (!folders || folders.length === 0) {
      return json(request, env, { success: true, data: [] }, { headers: RESPONSE_HEADERS });
    }

    const allClassIds = uniqueStrings(folders.flatMap((folder) => parseClassIds(folder.class_ids)));
    const classMap = await loadClassesByIds(db, allClassIds, { publicOnly: true });

    const enrichedFolders = folders.map((folder) => {
      const classIds = parseClassIds(folder.class_ids);
      const folderClasses = classIds
        .map((id) => {
          const classData = classMap.get(String(id));
          if (!classData) {
            console.warn('[API /recommendations] Missing class for recommendation entry:', id);
          }
          return classData || null;
        })
        .filter(Boolean);

      return {
        id: folder.folder_id,
        title: folder.title,
        description: folder.description || '',
        type: folder.type || 'regular',
        category: folder.category || 'all',
        sort_order: folder.sort_order,
        total_classes: classIds.length,
        classes: folderClasses,
      };
    });

    return json(request, env, {
      success: true,
      data: enrichedFolders,
    }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error('[API /recommendations] Error:', error);
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
