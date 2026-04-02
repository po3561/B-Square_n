PRAGMA foreign_keys = ON;

ALTER TABLE site_settings ADD COLUMN logo_light_url TEXT;
ALTER TABLE site_settings ADD COLUMN logo_dark_url TEXT;
ALTER TABLE site_settings ADD COLUMN favicon_light_url TEXT;
ALTER TABLE site_settings ADD COLUMN favicon_dark_url TEXT;

ALTER TABLE class_categories ADD COLUMN image_url TEXT;

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  asset_group TEXT NOT NULL DEFAULT 'general',
  asset_type TEXT NOT NULL DEFAULT 'image',
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER DEFAULT 0,
  data_url TEXT NOT NULL,
  alt_text TEXT,
  tags TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_group_type_active ON media_assets(asset_group, asset_type, is_active, sort_order, updated_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_name ON media_assets(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT DEFAULT 'global',
  query TEXT NOT NULL,
  result_type TEXT,
  result_id TEXT,
  result_title TEXT,
  result_url TEXT,
  source_page TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_context_time ON search_history(user_id, context, created_at);
CREATE INDEX IF NOT EXISTS idx_search_history_user_query ON search_history(user_id, query COLLATE NOCASE);
