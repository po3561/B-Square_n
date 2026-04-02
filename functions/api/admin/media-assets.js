import { requireAdmin } from '../_lib/auth.js';
import { ensureMediaAssetsSchema } from '../_lib/schema.js';
import { json, options } from '../_lib/http.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

const ALLOWED_GROUPS = new Set([
  'brand',
  'theme',
  'profile',
  'sns',
  'class',
  'footer',
  'business',
  'document',
  'general',
]);

const ALLOWED_TYPES = new Set(['image', 'document', 'icon']);

function trimText(value) {
  return String(value ?? '').trim();
}

function normalizeGroup(value) {
  const text = trimText(value).toLowerCase();
  return ALLOWED_GROUPS.has(text) ? text : 'general';
}

function normalizeType(value) {
  const text = trimText(value).toLowerCase();
  return ALLOWED_TYPES.has(text) ? text : 'image';
}

function normalizeTags(value) {
  const text = trimText(value);
  if (!text) return '';
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeDataUrl(value) {
  const text = trimText(value);
  if (!text) return '';
  return text.startsWith('data:') ? text : '';
}

function buildRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    asset_group: row.asset_group || 'general',
    asset_type: row.asset_type || 'image',
    name: row.name || '',
    description: row.description || '',
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size || 0),
    data_url: row.data_url || '',
    alt_text: row.alt_text || '',
    tags: row.tags || '',
    sort_order: Number(row.sort_order || 0),
    is_active: Number(row.is_active ?? 1) === 1,
    created_by: row.created_by || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function fetchAssets(db, filters = {}) {
  const where = [];
  const binds = [];

  if (filters.id) {
    where.push('id = ?');
    binds.push(filters.id);
  }

  if (filters.group && filters.group !== 'all') {
    where.push('asset_group = ?');
    binds.push(filters.group);
  }

  if (filters.type && filters.type !== 'all') {
    where.push('asset_type = ?');
    binds.push(filters.type);
  }

  if (filters.activeOnly === true) {
    where.push('is_active = 1');
  } else if (filters.activeOnly === false) {
    where.push('is_active IN (0, 1)');
  }

  if (filters.query) {
    const like = `%${filters.query}%`;
    where.push('(' + [
      'name LIKE ?',
      'description LIKE ?',
      'file_name LIKE ?',
      'alt_text LIKE ?',
      'tags LIKE ?',
      'asset_group LIKE ?',
      'asset_type LIKE ?',
    ].join(' OR ') + ')');
    binds.push(like, like, like, like, like, like, like);
  }

  const sql = `
    SELECT *
    FROM media_assets
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY is_active DESC, sort_order ASC, datetime(updated_at) DESC, datetime(created_at) DESC
  `;

  const result = await db.prepare(sql).bind(...binds).all().catch(() => ({ results: [] }));
  return Array.isArray(result.results) ? result.results.map(buildRow).filter(Boolean) : [];
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'OPTIONS') {
    return options(request, env, RESPONSE_HEADERS);
  }

  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  try {
    await ensureMediaAssetsSchema(db);

    if (method === 'GET') {
      const url = new URL(request.url);
      const id = trimText(url.searchParams.get('id'));
      const group = normalizeGroup(url.searchParams.get('group'));
      const type = normalizeType(url.searchParams.get('type'));
      const query = trimText(url.searchParams.get('q'));
      const activeOnly = url.searchParams.get('active') === '1' ? true : url.searchParams.get('active') === '0' ? false : null;

      if (id) {
        const row = await db.prepare('SELECT * FROM media_assets WHERE id = ? LIMIT 1').bind(id).first();
        return json(request, env, { success: true, data: buildRow(row) }, { headers: RESPONSE_HEADERS });
      }

      const rows = await fetchAssets(db, {
        group,
        type,
        query,
        activeOnly,
      });

      return json(request, env, { success: true, data: rows }, { headers: RESPONSE_HEADERS });
    }

    const body = await request.json().catch(() => ({}));

    if (method === 'POST') {
      const name = trimText(body.name);
      const dataUrl = normalizeDataUrl(body.data_url);
      if (!name) {
        return json(request, env, { success: false, error: '이름이 필요합니다.' }, { status: 400 });
      }
      if (!dataUrl) {
        return json(request, env, { success: false, error: '저장할 데이터 URL이 필요합니다.' }, { status: 400 });
      }

      const id = `msa_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const assetGroup = normalizeGroup(body.asset_group);
      const assetType = normalizeType(body.asset_type);
      const description = trimText(body.description);
      const fileName = trimText(body.file_name);
      const mimeType = trimText(body.mime_type);
      const fileSize = normalizeNumber(body.file_size, 0);
      const altText = trimText(body.alt_text);
      const tags = normalizeTags(body.tags);
      const sortOrder = normalizeNumber(body.sort_order, 0);
      const isActive = normalizeBoolean(body.is_active, true) ? 1 : 0;

      await db.prepare(`
        INSERT INTO media_assets (
          id, asset_group, asset_type, name, description, file_name, mime_type, file_size,
          data_url, alt_text, tags, sort_order, is_active, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )
      `).bind(
        id,
        assetGroup,
        assetType,
        name,
        description || null,
        fileName || null,
        mimeType || null,
        fileSize,
        dataUrl,
        altText || null,
        tags || null,
        sortOrder,
        isActive,
        auth.user.id,
      ).run();

      const row = await db.prepare('SELECT * FROM media_assets WHERE id = ?').bind(id).first();
      return json(request, env, {
        success: true,
        message: '보관 항목이 추가되었습니다.',
        data: buildRow(row),
      }, { headers: RESPONSE_HEADERS });
    }

    if (method === 'PUT') {
      const id = trimText(body.id);
      if (!id) {
        return json(request, env, { success: false, error: '수정할 항목 ID가 필요합니다.' }, { status: 400 });
      }

      const existing = await db.prepare('SELECT * FROM media_assets WHERE id = ? LIMIT 1').bind(id).first();
      if (!existing) {
        return json(request, env, { success: false, error: '대상을 찾을 수 없습니다.' }, { status: 404 });
      }

      const nextDataUrl = normalizeDataUrl(body.data_url) || existing.data_url || '';
      const name = trimText(body.name) || existing.name || '';
      const assetGroup = normalizeGroup(body.asset_group || existing.asset_group);
      const assetType = normalizeType(body.asset_type || existing.asset_type);
      const description = trimText(body.description);
      const fileName = trimText(body.file_name);
      const mimeType = trimText(body.mime_type);
      const fileSize = normalizeNumber(body.file_size, Number(existing.file_size || 0));
      const altText = trimText(body.alt_text);
      const tags = normalizeTags(body.tags);
      const sortOrder = normalizeNumber(body.sort_order, Number(existing.sort_order || 0));
      const isActive = normalizeBoolean(body.is_active, Number(existing.is_active ?? 1) === 1) ? 1 : 0;

      await db.prepare(`
        UPDATE media_assets
        SET asset_group = ?, asset_type = ?, name = ?, description = ?, file_name = ?, mime_type = ?, file_size = ?,
            data_url = ?, alt_text = ?, tags = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        assetGroup,
        assetType,
        name,
        description || null,
        fileName || null,
        mimeType || null,
        fileSize,
        nextDataUrl,
        altText || null,
        tags || null,
        sortOrder,
        isActive,
        id,
      ).run();

      const row = await db.prepare('SELECT * FROM media_assets WHERE id = ?').bind(id).first();
      return json(request, env, {
        success: true,
        message: '보관 항목이 수정되었습니다.',
        data: buildRow(row),
      }, { headers: RESPONSE_HEADERS });
    }

    if (method === 'DELETE') {
      const id = trimText(body.id);
      if (!id) {
        return json(request, env, { success: false, error: '삭제할 항목 ID가 필요합니다.' }, { status: 400 });
      }

      const row = await db.prepare('SELECT id FROM media_assets WHERE id = ? LIMIT 1').bind(id).first();
      if (!row) {
        return json(request, env, { success: false, error: '대상을 찾을 수 없습니다.' }, { status: 404 });
      }

      await db.prepare(`
        UPDATE media_assets
        SET is_active = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      return json(request, env, {
        success: true,
        message: '보관 항목이 삭제되었습니다.',
      }, { headers: RESPONSE_HEADERS });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[API /admin/media-assets] Error:', error);
    return json(request, env, { success: false, error: error.message || 'Media assets API failed' }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env, RESPONSE_HEADERS);
}
