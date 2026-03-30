-- Add user preference fields (idempotent if supported by D1/SQLite)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_theme TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_active INTEGER DEFAULT 0;
