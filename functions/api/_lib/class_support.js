import { addColumnIfMissing, ensureClassStatsSchema, ensureClassesSchema } from './schema.js';

let classCategoriesSchemaReady = false;
let classBookmarksSchemaReady = false;
let classCategoriesSeeded = false;

const DEFAULT_CLASS_CATEGORIES = [
  { name: '소모임/동아리', emoji: '👥', sort_order: 10 },
  { name: '맛있는 클래스', emoji: '🍽️', sort_order: 20 },
  { name: '운동 클래스', emoji: '🏋️', sort_order: 30 },
  { name: '디자인', emoji: '🎨', sort_order: 40 },
  { name: '생산성', emoji: '⚡', sort_order: 50 },
  { name: '스포츠', emoji: '🏅', sort_order: 60 },
  { name: '디지털 드로잉', emoji: '✏️', sort_order: 70 },
  { name: '성공 마인드', emoji: '🧠', sort_order: 80 },
  { name: '음악', emoji: '🎵', sort_order: 90 },
  { name: '요리', emoji: '🍳', sort_order: 100 },
  { name: '베이킹', emoji: '🧁', sort_order: 110 },
  { name: '사진', emoji: '📷', sort_order: 120 },
  { name: '영상', emoji: '🎬', sort_order: 130 },
  { name: '공예', emoji: '🧵', sort_order: 140 },
  { name: '여행', emoji: '🧭', sort_order: 150 },
];

const CATEGORY_EMOJI_MAP = new Map(DEFAULT_CLASS_CATEGORIES.map((item) => [item.name, item.emoji]));

export function normalizeCategoryName(value) {
  return String(value ?? '').trim();
}

export function defaultCategoryEmoji(name) {
  return CATEGORY_EMOJI_MAP.get(normalizeCategoryName(name)) || '✨';
}

export function getDefaultClassCategories() {
  return DEFAULT_CLASS_CATEGORIES.map((item) => ({ ...item }));
}

function uniqueCategories(values) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeCategoryName(value))
        .filter(Boolean),
    ),
  );
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

async function loadDeletedClassCategoryNames(db) {
  const { results } = await db.prepare(`
    SELECT name
    FROM deleted_class_categories
  `).all().catch(() => ({ results: [] }));

  return new Set(
    (results || [])
      .map((row) => normalizeCategoryName(row.name))
      .filter(Boolean),
  );
}

function extractSubInstructorIds(rawValue) {
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

  return uniqueStrings(parsed.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.id || item.user_id || item.userId || '';
    }
    return '';
  }));
}

function buildNotInClause(column, values = []) {
  const ids = uniqueStrings(values);
  if (!ids.length) {
    return { clause: '', binds: [] };
  }

  return {
    clause: ` AND ${column} NOT IN (${ids.map(() => '?').join(',')})`,
    binds: ids,
  };
}

function categorySortOrder(name, fallbackIndex) {
  const normalized = normalizeCategoryName(name);
  const match = DEFAULT_CLASS_CATEGORIES.find((item) => item.name === normalized);
  return match ? match.sort_order : 1000 + fallbackIndex;
}

export async function ensureClassCategoriesSchema(db) {
  await ensureClassesSchema(db);

  if (!classCategoriesSchemaReady) {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS class_categories (
        name TEXT PRIMARY KEY,
        emoji TEXT NOT NULL DEFAULT '✨',
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deleted_class_categories (
        name TEXT PRIMARY KEY,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await addColumnIfMissing(db, 'class_categories', "emoji TEXT NOT NULL DEFAULT '✨'");
    await addColumnIfMissing(db, 'class_categories', 'image_url TEXT');
    await addColumnIfMissing(db, 'class_categories', 'sort_order INTEGER DEFAULT 0');
    await addColumnIfMissing(db, 'class_categories', 'is_active INTEGER DEFAULT 1');
    await addColumnIfMissing(db, 'class_categories', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(db, 'class_categories', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

    classCategoriesSchemaReady = true;
  }

  if (!classCategoriesSeeded) {
    const deletedNames = await loadDeletedClassCategoryNames(db).catch(() => new Set());
    const existingCategories = await db.prepare(`
      SELECT DISTINCT TRIM(category) AS name
      FROM classes
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    `).all().catch(() => ({ results: [] }));

    const merged = uniqueCategories([
      ...DEFAULT_CLASS_CATEGORIES.map((item) => item.name),
      ...(existingCategories?.results || []).map((row) => row.name),
    ]).filter((name) => !deletedNames.has(name));

    if (merged.length) {
      const stmts = merged.map((name, index) => {
        const meta = DEFAULT_CLASS_CATEGORIES.find((item) => item.name === name);
        return db.prepare(`
          INSERT OR IGNORE INTO class_categories (name, emoji, sort_order, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
        `).bind(
          name,
          meta?.emoji || defaultCategoryEmoji(name),
          meta?.sort_order ?? categorySortOrder(name, index),
        );
      });
      await db.batch(stmts);
    }

    classCategoriesSeeded = true;
  }
}

export async function ensureClassBookmarksSchema(db) {
  await ensureClassesSchema(db);

  if (!classBookmarksSchemaReady) {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS class_bookmarks (
        class_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (class_id, user_id)
      )
    `).run();

    await addColumnIfMissing(db, 'class_bookmarks', 'class_id TEXT');
    await addColumnIfMissing(db, 'class_bookmarks', 'user_id TEXT');
    await addColumnIfMissing(db, 'class_bookmarks', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_class_bookmarks_class ON class_bookmarks(class_id)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_class_bookmarks_user ON class_bookmarks(user_id)').run();

    classBookmarksSchemaReady = true;
  }
}

export async function loadClassStaffIds(db, classId) {
  const id = String(classId || '').trim();
  if (!id) return [];

  await ensureClassesSchema(db);

  const row = await db.prepare(`
    SELECT creator_id, sub_instructors
    FROM classes
    WHERE id = ?
  `).bind(id).first().catch(() => null);

  if (!row) return [];

  return uniqueStrings([
    row.creator_id,
    ...extractSubInstructorIds(row.sub_instructors),
  ]);
}

export async function refreshClassStats(db, classId) {
  const id = String(classId || '').trim();
  if (!id) return null;

  await ensureClassesSchema(db);
  await ensureClassStatsSchema(db);

  const staffIds = await loadClassStaffIds(db, id).catch(() => []);
  const enrollmentFilter = buildNotInClause('user_id', staffIds);
  const reviewFilter = buildNotInClause('user_id', staffIds);
  const bookmarkFilter = buildNotInClause('user_id', staffIds);
  const passFilter = buildNotInClause('user_id', staffIds);

  const [
    enrollmentRow,
    reviewRow,
    bookmarkRow,
    revenueRow,
    gatheringRow,
    passRow,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT user_id) AS total_enrollments FROM enrollments WHERE class_id = ?${enrollmentFilter.clause}`).bind(id, ...enrollmentFilter.binds).first().catch(() => ({ total_enrollments: 0 })),
    db.prepare(`SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE class_id = ?${reviewFilter.clause}`).bind(id, ...reviewFilter.binds).first().catch(() => ({ avg_rating: 0, review_count: 0 })),
    db.prepare(`SELECT COUNT(*) AS bookmark_count FROM class_bookmarks WHERE class_id = ?${bookmarkFilter.clause}`).bind(id, ...bookmarkFilter.binds).first().catch(() => ({ bookmark_count: 0 })),
    db.prepare('SELECT COALESCE(SUM(final_amount), 0) AS total_revenue FROM orders WHERE class_id = ? AND paid_at IS NOT NULL').bind(id).first().catch(() => ({ total_revenue: 0 })),
    db.prepare('SELECT COUNT(*) AS total_gatherings FROM class_gatherings WHERE class_id = ?').bind(id).first().catch(() => ({ total_gatherings: 0 })),
    db.prepare(`
      SELECT
        COALESCE(SUM(COALESCE(total_count, total_passes, total, remaining_count, remaining_passes, remaining, 0)), 0) AS total_passes_issued,
        COALESCE(SUM(
          COALESCE(total_count, total_passes, total, remaining_count, remaining_passes, remaining, 0)
          - COALESCE(remaining_count, remaining_passes, remaining, 0)
        ), 0) AS total_passes_used
      FROM user_passes
      WHERE class_id = ?${passFilter.clause}
    `).bind(id, ...passFilter.binds).first().catch(() => ({ total_passes_issued: 0, total_passes_used: 0 })),
  ]);

  const totalEnrollments = Number(enrollmentRow?.total_enrollments || 0);
  const reviewCount = Number(reviewRow?.review_count || 0);
  const avgRating = Number(reviewRow?.avg_rating || 0);
  const bookmarkCount = Number(bookmarkRow?.bookmark_count || 0);
  const totalRevenue = Number(revenueRow?.total_revenue || 0);
  const totalGatherings = Number(gatheringRow?.total_gatherings || 0);
  const totalPassesIssued = Number(passRow?.total_passes_issued || 0);
  const totalPassesUsed = Number(passRow?.total_passes_used || 0);

  const statements = [
    db.prepare(`
      INSERT INTO class_stats (
        class_id, total_enrollments, total_passes_issued, total_passes_used,
        total_revenue, total_gatherings, avg_rating, review_count,
        bookmark_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(class_id) DO UPDATE SET
        total_enrollments = excluded.total_enrollments,
        total_passes_issued = excluded.total_passes_issued,
        total_passes_used = excluded.total_passes_used,
        total_revenue = excluded.total_revenue,
        total_gatherings = excluded.total_gatherings,
        avg_rating = excluded.avg_rating,
        review_count = excluded.review_count,
        bookmark_count = excluded.bookmark_count,
        updated_at = excluded.updated_at
    `).bind(
      id,
      totalEnrollments,
      totalPassesIssued,
      totalPassesUsed,
      totalRevenue,
      totalGatherings,
      avgRating,
      reviewCount,
      bookmarkCount,
    ),
    db.prepare(`
      UPDATE classes
      SET current_participants = ?
      WHERE id = ?
    `).bind(totalEnrollments, id),
  ];

  await db.batch(statements);

  return {
    total_enrollments: totalEnrollments,
    total_passes_issued: totalPassesIssued,
    total_passes_used: totalPassesUsed,
    total_revenue: totalRevenue,
    total_gatherings: totalGatherings,
    avg_rating: avgRating,
    review_count: reviewCount,
    bookmark_count: bookmarkCount,
  };
}

export async function loadClassCategories(db, { activeOnly = true } = {}) {
  await ensureClassCategoriesSchema(db);

  const activeClause = activeOnly ? 'WHERE is_active = 1' : '';
  const { results } = await db.prepare(`
    SELECT
      cat.name,
      cat.emoji,
      cat.image_url,
      cat.sort_order,
      cat.is_active,
      cat.created_at,
      cat.updated_at,
      COALESCE(cnt.class_count, 0) AS class_count,
      COALESCE(cnt.public_class_count, 0) AS public_class_count
    FROM class_categories cat
    LEFT JOIN (
      SELECT
        category,
        COUNT(*) AS class_count,
        COUNT(CASE WHEN COALESCE(is_public, 1) = 1 THEN 1 END) AS public_class_count
      FROM classes
      GROUP BY category
    ) cnt
      ON cnt.category = cat.name
    ${activeClause}
    ORDER BY cat.sort_order ASC, cat.name COLLATE NOCASE ASC
  `).all();

  return Array.isArray(results) ? results : [];
}

export async function loadBookmarkCountMap(db, classIds = []) {
  await ensureClassBookmarksSchema(db);

  const ids = uniqueCategories(classIds);
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`
    SELECT class_id, COUNT(*) AS bookmark_count
    FROM class_bookmarks
    WHERE class_id IN (${placeholders})
    GROUP BY class_id
  `).bind(...ids).all();

  return new Map((results || []).map((row) => [String(row.class_id), Number(row.bookmark_count || 0)]));
}

function chunkArray(values, size = 200) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function loadClassesByIds(db, classIds = [], { publicOnly = true } = {}) {
  await ensureClassesSchema(db);
  await ensureClassStatsSchema(db);

  const ids = uniqueStrings(classIds);
  if (!ids.length) return new Map();

  const classMap = new Map();
  const publicClause = publicOnly ? 'AND COALESCE(c.is_public, 1) = 1' : '';

  for (const chunk of chunkArray(ids, 200)) {
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db.prepare(`
      SELECT
        c.id,
        c.title,
        c.thumbnail,
        c.image_url,
        c.category,
        c.price,
        c.discount_rate,
        c.coupon_pack,
        c.class_type,
        c.is_free,
        c.is_public,
        c.current_participants,
        c.created_at,
        c.updated_at,
        c.creator_id AS instructor_id,
        c.instructor_name,
        c.instructor_email,
        c.instructor_phone,
        u.name AS creator_name,
        COALESCE(u.email, c.creator_email) AS creator_email,
        u.phone AS creator_phone,
        COALESCE(s.avg_rating, 0) AS avg_rating,
        COALESCE(s.review_count, 0) AS review_count,
        COALESCE(s.bookmark_count, 0) AS bookmark_count,
        COALESCE(s.total_enrollments, c.current_participants, 0) AS total_enrollments
      FROM classes c
      LEFT JOIN users u ON u.id = c.creator_id
      LEFT JOIN class_stats s ON s.class_id = c.id
      WHERE c.id IN (${placeholders})
      ${publicClause}
    `).bind(...chunk).all();

    for (const row of results || []) {
      classMap.set(String(row.id), row);
    }
  }

  return classMap;
}

export function getEffectiveClassPrice(row) {
  const price = Number(row?.price || 0);
  const discount = Number(row?.discount_rate || 0);
  if (!Number.isFinite(price)) return 0;
  if (!Number.isFinite(discount) || discount <= 0) return Math.max(price, 0);
  return Math.max(Math.round(price * (1 - discount / 100)), 0);
}

export function getClassHotScore(row) {
  const bookmarks = Number(row?.bookmarks ?? row?.bookmark_count ?? row?.like_count ?? 0) || 0;
  const reviews = Number(row?.review_count ?? 0) || 0;
  const avgRating = Number(row?.avg_rating ?? 0) || 0;
  const visits = Number(row?.visits ?? row?.total_visits ?? 0) || 0;
  const enrollments = Number(row?.enrollments ?? row?.total_enrollments ?? row?.current_participants ?? 0) || 0;
  const gatherings = Number(row?.gatherings ?? row?.total_gatherings ?? 0) || 0;

  return Math.round(
    (bookmarks * 24)
    + (reviews * 18)
    + (avgRating * 32)
    + (visits * 0.5)
    + (enrollments * 10)
    + (gatherings * 4),
  );
}
