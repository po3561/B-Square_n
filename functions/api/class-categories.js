import { json, options } from './_lib/http.js';
import { loadClassCategories } from './_lib/class_support.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return options(request, env, RESPONSE_HEADERS);
  }

  if (request.method !== 'GET') {
    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405, headers: RESPONSE_HEADERS });
  }

  try {
    const categories = await loadClassCategories(env.DB, { activeOnly: true });
    return json(request, env, {
      success: true,
      data: categories.map((row) => ({
        name: row.name,
        emoji: row.emoji || '✨',
        image_url: row.image_url || '',
        sort_order: Number(row.sort_order || 0),
        class_count: Number(row.class_count || 0),
      })),
    }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env, RESPONSE_HEADERS);
}
