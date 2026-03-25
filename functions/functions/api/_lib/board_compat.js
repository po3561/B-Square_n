import { addColumnIfMissing } from './schema.js';

let boardCompatReady = false;

function tableColumnsKey(table) {
  return String(table || '').trim().toLowerCase();
}

const tableColumnsCache = new Map();

async function readTableColumns(db, table, refresh = false) {
  const key = tableColumnsKey(table);
  if (!refresh && tableColumnsCache.has(key)) {
    return tableColumnsCache.get(key);
  }

  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all().catch(() => ({ results: [] }));
  const columns = new Set((results || []).map((row) => String(row.name || '').trim()).filter(Boolean));
  tableColumnsCache.set(key, columns);
  return columns;
}

async function ensureColumns(db, table, definitions) {
  const columns = await readTableColumns(db, table, true);
  for (const definition of definitions) {
    if (!columns.has(definition.name)) {
      await addColumnIfMissing(db, table, definition.sql);
      columns.add(definition.name);
    }
  }
  tableColumnsCache.set(tableColumnsKey(table), await readTableColumns(db, table, true));
}

async function backfillIdentifierColumns(db, table, primary = 'id', legacy = 'push_key') {
  const columns = await readTableColumns(db, table, true);
  if (!columns.has(primary) || !columns.has(legacy)) return;

  await db.prepare(`
    UPDATE ${table}
    SET ${primary} = COALESCE(${primary}, ${legacy}),
        ${legacy} = COALESCE(${legacy}, ${primary})
    WHERE ${primary} IS NULL OR ${legacy} IS NULL
  `).run().catch(() => {});
}

function normalizeId(row) {
  if (!row || typeof row !== 'object') return null;
  return row.id || row.push_key || row.notice_id || null;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = normalizeId(row);
  return {
    ...row,
    id,
    push_key: row.push_key || id || null,
    notice_id: row.notice_id || id || null,
  };
}

function labelClassNoticeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return '미상';
  if (value === 'main_instructor') return '메인 강사';
  if (value === 'sub_instructor') return '서브 강사';
  if (value === 'operator') return '운영자';
  if (value === 'admin' || value === 'super_admin') return '총괄 관리자';
  if (value === 'instructor') return '강사';
  return value;
}

export async function ensureBoardCompatSchema(db) {
  if (boardCompatReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      push_key TEXT UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'normal',
      author_name TEXT DEFAULT '관리자',
      views INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notice_likes (
      notice_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      value INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notice_id, user_id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notice_comments (
      id TEXT PRIMARY KEY,
      push_key TEXT UNIQUE,
      notice_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      push_key TEXT UNIQUE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_notices (
      id TEXT PRIMARY KEY,
      push_key TEXT UNIQUE,
      class_id TEXT NOT NULL,
      class_name TEXT,
      title TEXT NOT NULL,
      content TEXT,
      author_id TEXT,
      author_name TEXT,
      author_role TEXT,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await ensureColumns(db, 'notices', [
    { name: 'id', sql: 'id TEXT' },
    { name: 'push_key', sql: 'push_key TEXT' },
    { name: 'type', sql: "type TEXT DEFAULT 'normal'" },
    { name: 'author_name', sql: "author_name TEXT DEFAULT '관리자'" },
    { name: 'views', sql: 'views INTEGER DEFAULT 0' },
    { name: 'is_hidden', sql: 'is_hidden INTEGER DEFAULT 0' },
    { name: 'created_at', sql: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', sql: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ]);

  await ensureColumns(db, 'notice_likes', [
    { name: 'notice_id', sql: 'notice_id TEXT' },
    { name: 'user_id', sql: 'user_id TEXT' },
    { name: 'value', sql: 'value INTEGER DEFAULT 1' },
    { name: 'created_at', sql: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ]);

  await ensureColumns(db, 'notice_comments', [
    { name: 'id', sql: 'id TEXT' },
    { name: 'push_key', sql: 'push_key TEXT' },
    { name: 'notice_id', sql: 'notice_id TEXT' },
    { name: 'user_id', sql: 'user_id TEXT' },
    { name: 'user_name', sql: 'user_name TEXT' },
    { name: 'content', sql: 'content TEXT' },
    { name: 'created_at', sql: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', sql: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ]);

  await ensureColumns(db, 'faqs', [
    { name: 'id', sql: 'id TEXT' },
    { name: 'push_key', sql: 'push_key TEXT' },
    { name: 'question', sql: 'question TEXT NOT NULL' },
    { name: 'answer', sql: 'answer TEXT NOT NULL' },
    { name: 'is_hidden', sql: 'is_hidden INTEGER DEFAULT 0' },
    { name: 'created_at', sql: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', sql: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ]);

  await ensureColumns(db, 'class_notices', [
    { name: 'id', sql: 'id TEXT' },
    { name: 'push_key', sql: 'push_key TEXT' },
    { name: 'class_id', sql: 'class_id TEXT NOT NULL' },
    { name: 'class_name', sql: 'class_name TEXT' },
    { name: 'title', sql: 'title TEXT NOT NULL' },
    { name: 'content', sql: 'content TEXT' },
    { name: 'author_id', sql: 'author_id TEXT' },
    { name: 'author_name', sql: 'author_name TEXT' },
    { name: 'author_role', sql: 'author_role TEXT' },
    { name: 'views', sql: 'views INTEGER DEFAULT 0' },
    { name: 'created_at', sql: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', sql: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ]);

  await backfillIdentifierColumns(db, 'notices');
  await backfillIdentifierColumns(db, 'notice_comments');
  await backfillIdentifierColumns(db, 'faqs');
  await backfillIdentifierColumns(db, 'class_notices');

  boardCompatReady = true;
}

export function normalizeNotice(row) {
  return normalizeRow(row);
}

export function normalizeFaq(row) {
  return normalizeRow(row);
}

export function normalizeClassNotice(row) {
  const normalized = normalizeRow(row);
  if (!normalized) return null;

  return {
    ...normalized,
    class_name: normalized.class_name || normalized.class_title || normalized.class_id || '',
    // Never fall back to notice title; only use class-related fields.
    class_title: normalized.class_title || normalized.class_name || normalized.class_id || '',
    author_role: normalized.author_role || null,
    author_role_label: labelClassNoticeRole(normalized.author_role),
  };
}

export function labelClassNoticeRoleText(role) {
  return labelClassNoticeRole(role);
}
