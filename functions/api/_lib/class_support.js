import { addColumnIfMissing, ensureClassesSchema } from './schema.js';

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
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await addColumnIfMissing(db, 'class_categories', "emoji TEXT NOT NULL DEFAULT '✨'");
    await addColumnIfMissing(db, 'class_categories', 'sort_order INTEGER DEFAULT 0');
    await addColumnIfMissing(db, 'class_categories', 'is_active INTEGER DEFAULT 1');
    await addColumnIfMissing(db, 'class_categories', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(db, 'class_categories', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

    classCategoriesSchemaReady = true;
  }

  if (!classCategoriesSeeded) {
    const existingCategories = await db.prepare(`
      SELECT DISTINCT TRIM(category) AS name
      FROM classes
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    `).all().catch(() => ({ results: [] }));

    const merged = uniqueCategories([
      ...DEFAULT_CLASS_CATEGORIES.map((item) => item.name),
      ...(existingCategories?.results || []).map((row) => row.name),
    ]);

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

export async function loadClassCategories(db, { activeOnly = true } = {}) {
  await ensureClassCategoriesSchema(db);

  const activeClause = activeOnly ? 'WHERE is_active = 1' : '';
  const { results } = await db.prepare(`
    SELECT
      cat.name,
      cat.emoji,
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
