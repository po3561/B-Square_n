import { getCurrentUser, normalizeRole, isAtLeastRole } from './_lib/auth.js';
import { json, options } from './_lib/http.js';
import { ensureClassesSchema, ensureOperationsSchema, ensureSearchHistorySchema } from './_lib/schema.js';
import { ensureBoardCompatSchema } from './_lib/board_compat.js';
import { loadClassCategories } from './_lib/class_support.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

function trimText(value) {
  return String(value ?? '').trim();
}

function clamp(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoolean(value, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function buildLike(term) {
  return `%${String(term || '').trim()}%`;
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSnippet(...values) {
  for (const value of values) {
    const text = stripHtml(value);
    if (!text) continue;
    return text.length > 110 ? `${text.slice(0, 110).trimEnd()}…` : text;
  }
  return '';
}

function normalizeScope(value) {
  const text = String(value || 'global').trim().toLowerCase();
  const allowed = new Set(['global', 'classes', 'categories', 'notices', 'class-notices', 'faqs', 'inquiries']);
  return allowed.has(text) ? text : 'global';
}

function normalizeQuery(value) {
  return trimText(value).replace(/\s+/g, ' ').slice(0, 120);
}

function resolveSearchUrl(basePath, params = {}) {
  const url = new URL(basePath, 'http://bsq.local');
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

function mapCombinedItem(item, kind, url, title, subtitle, snippet, extra = {}) {
  return {
    kind,
    url,
    title,
    subtitle,
    snippet,
    ...extra,
  };
}

async function loadHistory(db, userId, context, limit = 8) {
  const { results } = await db.prepare(`
    SELECT id, user_id, context, query, result_type, result_id, result_title, result_url, source_page, created_at, updated_at
    FROM search_history
    WHERE user_id = ? AND context = ?
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
    LIMIT ?
  `).bind(userId, context, limit).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results : [];
}

async function recordHistory(db, userId, entry) {
  const query = normalizeQuery(entry.query);
  if (!userId || !query) return null;

  const context = normalizeScope(entry.context || 'global');
  const id = `srh_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const resultType = trimText(entry.result_type);
  const resultId = trimText(entry.result_id);
  const resultTitle = trimText(entry.result_title);
  const resultUrl = trimText(entry.result_url);
  const sourcePage = trimText(entry.source_page);

  await db.prepare(`
    DELETE FROM search_history
    WHERE user_id = ? AND context = ? AND query = ?
  `).bind(userId, context, query).run();

  await db.prepare(`
    INSERT INTO search_history (
      id, user_id, context, query, result_type, result_id, result_title, result_url, source_page, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    userId,
    context,
    query,
    resultType || null,
    resultId || null,
    resultTitle || null,
    resultUrl || null,
    sourcePage || null,
  ).run();

  await db.prepare(`
    DELETE FROM search_history
    WHERE user_id = ? AND context = ?
      AND id NOT IN (
        SELECT id
        FROM search_history
        WHERE user_id = ? AND context = ?
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        LIMIT 20
      )
  `).bind(userId, context, userId, context).run().catch(() => {});

  return id;
}

async function searchCategories(db, query, limit = 8) {
  const categories = await loadClassCategories(db, { activeOnly: true }).catch(() => []);
  const normalizedQuery = normalizeQuery(query);
  const lower = normalizedQuery.toLowerCase();

  const rows = categories.filter((row) => {
    if (!normalizedQuery) return true;
    return String(row.name || '').toLowerCase().includes(lower);
  });

  return rows.slice(0, limit).map((row) => ({
    name: row.name,
    emoji: row.emoji || '✨',
    image_url: row.image_url || '',
    sort_order: Number(row.sort_order || 0),
    class_count: Number(row.class_count || 0),
    public_class_count: Number(row.public_class_count || 0),
    url: resolveSearchUrl('/class/class_list.html', { cat: row.name }),
    title: row.name,
    subtitle: `클래스 ${Number(row.public_class_count || row.class_count || 0)}개`,
    snippet: row.image_url ? '카테고리 이미지가 등록되어 있습니다.' : '카테고리 바로가기',
    kind: 'category',
  }));
}

async function searchClasses(db, query, limit = 6, isStaff = false) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const like = buildLike(normalizedQuery);
  const publicClause = isStaff ? '' : 'AND COALESCE(c.is_public, 1) = 1';

  const { results } = await db.prepare(`
    SELECT
      c.id,
      c.title,
      c.category,
      c.summary,
      c.description,
      c.description_text,
      c.keywords,
      c.image_url,
      c.thumbnail,
      c.created_at,
      c.is_public,
      c.price,
      c.discount_rate,
      c.coupon_pack,
      c.creator_id AS instructor_id,
      COALESCE(u.name, c.instructor_name) AS instructor_name,
      COALESCE(u.email, c.creator_email, c.instructor_email) AS instructor_email
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    WHERE (
      c.title LIKE ?
      OR c.category LIKE ?
      OR c.keywords LIKE ?
      OR c.summary LIKE ?
      OR c.description LIKE ?
      OR c.description_text LIKE ?
      OR c.instructor_name LIKE ?
      OR c.creator_email LIKE ?
      OR u.name LIKE ?
      OR u.email LIKE ?
    )
    ${publicClause}
    ORDER BY
      CASE
        WHEN c.title LIKE ? THEN 0
        WHEN c.keywords LIKE ? THEN 1
        WHEN c.category LIKE ? THEN 2
        ELSE 3
      END,
      c.created_at DESC,
      c.title ASC
    LIMIT ?
  `).bind(
    like, like, like, like, like, like, like, like, like, like,
    like, like, like,
    limit,
  ).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results.map((row) => ({
    kind: 'class',
    id: row.id,
    title: row.title,
    subtitle: `${row.category || '미분류'} · ${row.instructor_name || '강사 정보 없음'}`,
    snippet: buildSnippet(row.summary, row.description_text, row.description, row.keywords),
    url: resolveSearchUrl('/class_view/class_view.html', { id: row.id }),
    image_url: row.image_url || row.thumbnail || '',
    category: row.category || '미분류',
    instructor_name: row.instructor_name || '',
    instructor_email: row.instructor_email || '',
    is_public: Number(row.is_public ?? 1) === 1,
    price: Number(row.price || 0),
    discount_rate: Number(row.discount_rate || 0),
    coupon_pack: Number(row.coupon_pack || 0),
  })) : [];
}

async function searchNotices(db, query, limit = 6, isStaff = false) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const like = buildLike(normalizedQuery);
  const hiddenClause = isStaff ? '' : 'WHERE COALESCE(is_hidden, 0) = 0';

  const { results } = await db.prepare(`
    SELECT id, push_key, title, content, type, author_name, views, is_hidden, created_at
    FROM notices
    ${hiddenClause ? `${hiddenClause} AND (` : 'WHERE ('}
      title LIKE ?
      OR content LIKE ?
      OR author_name LIKE ?
    )
    ORDER BY
      CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
      CASE WHEN type = 'important' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `).bind(like, like, like, like, limit).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results.map((row) => ({
    kind: 'notice',
    id: row.id || row.push_key,
    title: row.title,
    subtitle: row.type === 'important' ? '중요 공지' : '공지사항',
    snippet: buildSnippet(row.content),
    url: resolveSearchUrl('/notice/notice.html', { id: row.id || row.push_key }),
    author_name: row.author_name || '',
    created_at: row.created_at || null,
  })) : [];
}

async function searchClassNotices(db, query, limit = 6, isStaff = false) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const like = buildLike(normalizedQuery);
  const publicClause = isStaff ? '' : 'AND COALESCE(c.is_public, 1) = 1';

  const { results } = await db.prepare(`
    SELECT
      cn.id,
      cn.push_key,
      cn.class_id,
      cn.class_name,
      cn.title,
      cn.content,
      cn.author_name,
      cn.author_role,
      cn.views,
      cn.created_at,
      c.title AS class_title,
      c.is_public AS class_is_public
    FROM class_notices cn
    LEFT JOIN classes c ON c.id = cn.class_id
    WHERE (
      cn.title LIKE ?
      OR cn.content LIKE ?
      OR cn.class_name LIKE ?
      OR c.title LIKE ?
      OR cn.author_name LIKE ?
    )
    ${publicClause}
    ORDER BY
      CASE WHEN cn.title LIKE ? THEN 0 ELSE 1 END,
      cn.created_at DESC
    LIMIT ?
  `).bind(like, like, like, like, like, like, limit).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results.map((row) => ({
    kind: 'class_notice',
    id: row.id || row.push_key,
    class_id: row.class_id,
    class_title: row.class_title || row.class_name || row.class_id,
    title: row.title,
    subtitle: `${row.class_title || row.class_name || '클래스'} · 클래스 공지`,
    snippet: buildSnippet(row.content),
    url: resolveSearchUrl('/class_view/class_view.html', {
      id: row.class_id,
      tab: 'notice',
      notice: row.id || row.push_key,
    }),
    author_name: row.author_name || '',
    created_at: row.created_at || null,
  })) : [];
}

async function searchFaqs(db, query, limit = 6, isStaff = false) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const like = buildLike(normalizedQuery);
  const hiddenClause = isStaff ? '' : 'WHERE COALESCE(is_hidden, 0) = 0';

  const { results } = await db.prepare(`
    SELECT id, push_key, question, answer, is_hidden, created_at
    FROM faqs
    ${hiddenClause ? `${hiddenClause} AND (` : 'WHERE ('}
      question LIKE ?
      OR answer LIKE ?
    )
    ORDER BY
      CASE WHEN question LIKE ? THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `).bind(like, like, like, limit).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results.map((row) => ({
    kind: 'faq',
    id: row.id || row.push_key,
    title: row.question,
    subtitle: 'FAQ',
    snippet: buildSnippet(row.answer),
    url: resolveSearchUrl('/notice/notice.html', { faq: row.id || row.push_key }),
    created_at: row.created_at || null,
  })) : [];
}

async function searchInquiries(db, query, limit = 6, auth = null) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery || !auth?.user) return [];

  const like = buildLike(normalizedQuery);
  const isStaff = isAtLeastRole(normalizeRole(auth.user.role), 'operator');
  const userId = trimText(auth.user.id);
  const userEmail = trimText(auth.user.email);

  let where = `
    WHERE (
      title LIKE ?
      OR subject LIKE ?
      OR content LIKE ?
      OR category LIKE ?
      OR name LIKE ?
      OR email LIKE ?
    )
  `;

  const binds = [like, like, like, like, like, like];

  if (!isStaff) {
    where += ' AND (user_id = ? OR submitted_by = ? OR email = ?)';
    binds.push(userId, userId, userEmail);
  }

  const { results } = await db.prepare(`
    SELECT id, user_id, name, email, category, title, subject, content, status, created_at, updated_at
    FROM inquiries
    ${where}
    ORDER BY
      CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `).bind(...binds, like, limit).all().catch(() => ({ results: [] }));

  return Array.isArray(results) ? results.map((row) => ({
    kind: 'inquiry',
    id: row.id,
    title: row.title,
    subtitle: `${row.category || '일반 문의'} · ${row.status === 'replied' ? '답변완료' : '대기중'}`,
    snippet: buildSnippet(row.content),
    url: resolveSearchUrl('/contact/contact.html', { q: normalizedQuery }),
    created_at: row.created_at || null,
    status: row.status || 'pending',
  })) : [];
}

async function buildSearchPayload(context, query, options = {}) {
  const db = context.env.DB;
  const normalizedQuery = normalizeQuery(query);
  const scope = normalizeScope(options.scope || 'global');
  const historyLimit = clamp(options.historyLimit, 1, 20, 8);
  const bucketLimit = clamp(options.limit, 1, 20, 6);
  const includeHistory = options.includeHistory !== false;

  const current = await getCurrentUser(context).catch(() => null);
  const isStaff = isAtLeastRole(normalizeRole(current?.user?.role), 'operator');
  const canSearchInquiries = !!current?.user;

  const [categories, classes, notices, classNotices, faqs, inquiries, history] = await Promise.all([
    (scope === 'global' || scope === 'categories')
      ? searchCategories(db, normalizedQuery, bucketLimit)
      : Promise.resolve([]),
    (scope === 'global' || scope === 'classes')
      ? searchClasses(db, normalizedQuery, bucketLimit, isStaff)
      : Promise.resolve([]),
    (scope === 'global' || scope === 'notices')
      ? searchNotices(db, normalizedQuery, bucketLimit, isStaff)
      : Promise.resolve([]),
    (scope === 'global' || scope === 'class-notices')
      ? searchClassNotices(db, normalizedQuery, bucketLimit, isStaff)
      : Promise.resolve([]),
    (scope === 'global' || scope === 'faqs')
      ? searchFaqs(db, normalizedQuery, bucketLimit, isStaff)
      : Promise.resolve([]),
    (scope === 'global' || scope === 'inquiries')
      ? searchInquiries(db, normalizedQuery, bucketLimit, current)
      : Promise.resolve([]),
    includeHistory && current?.user
      ? loadHistory(db, current.user.id, scope, historyLimit)
      : Promise.resolve([]),
  ]);

  const suggestionBuckets = [
    ...categories,
    ...classes,
    ...notices,
    ...classNotices,
    ...faqs,
    ...inquiries,
  ];

  const results = {
    categories,
    classes,
    notices,
    class_notices: classNotices,
    faqs,
    inquiries,
  };

  return {
    query: normalizedQuery,
    scope,
    history,
    results,
    suggestions: suggestionBuckets,
    summary: {
      categories: categories.length,
      classes: classes.length,
      notices: notices.length,
      class_notices: classNotices.length,
      faqs: faqs.length,
      inquiries: inquiries.length,
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') {
    return options(request, env, RESPONSE_HEADERS);
  }

  try {
    await ensureClassesSchema(env.DB);
    await ensureOperationsSchema(env.DB);
    await ensureSearchHistorySchema(env.DB);
    await ensureBoardCompatSchema(env.DB);

    if (method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const scope = url.searchParams.get('scope') || 'global';
      const limit = clamp(url.searchParams.get('limit'), 1, 20, 6);
      const historyLimit = clamp(url.searchParams.get('history_limit'), 1, 20, 8);
      const includeHistory = parseBoolean(url.searchParams.get('include_history'), true);
      const payload = await buildSearchPayload(context, query, {
        scope,
        limit,
        historyLimit,
        includeHistory,
      });
      return json(request, env, { success: true, data: payload }, { headers: RESPONSE_HEADERS });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = trimText(body.action || 'record').toLowerCase();

      if (action === 'record') {
        const current = await getCurrentUser(context).catch(() => null);
        if (!current?.user) {
          return json(request, env, { success: true, data: { recorded: false } }, { headers: RESPONSE_HEADERS });
        }

        const query = normalizeQuery(body.query);
        if (!query) {
          return json(request, env, { success: true, data: { recorded: false } }, { headers: RESPONSE_HEADERS });
        }

        const recordedId = await recordHistory(env.DB, current.user.id, {
          query,
          context: body.context || 'global',
          result_type: body.result_type || body.kind || '',
          result_id: body.result_id || body.id || '',
          result_title: body.result_title || body.title || '',
          result_url: body.result_url || body.url || '',
          source_page: body.source_page || body.page || '',
        });

        return json(request, env, { success: true, data: { recorded: !!recordedId, id: recordedId } }, { headers: RESPONSE_HEADERS });
      }

      if (action === 'history') {
        const current = await getCurrentUser(context).catch(() => null);
        if (!current?.user) {
          return json(request, env, { success: true, data: [] }, { headers: RESPONSE_HEADERS });
        }

        const history = await loadHistory(env.DB, current.user.id, body.context || 'global', clamp(body.limit, 1, 20, 8));
        return json(request, env, { success: true, data: history }, { headers: RESPONSE_HEADERS });
      }

      return json(request, env, { success: false, error: 'Unsupported search action.' }, { status: 400 });
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[API /search] Error:', error);
    return json(request, env, {
      success: false,
      error: error.message || 'Search failed',
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env, RESPONSE_HEADERS);
}
