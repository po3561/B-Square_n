PRAGMA foreign_keys = ON;

ALTER TABLE sessions ADD COLUMN auth_provider TEXT;
ALTER TABLE sessions ADD COLUMN auth_provider_user_id TEXT;
