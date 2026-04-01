PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  email_verified INTEGER DEFAULT 0,
  provider_name TEXT,
  provider_nickname TEXT,
  provider_avatar_url TEXT,
  provider_locale TEXT,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id),
  UNIQUE(user_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_provider_user
  ON social_accounts(provider, provider_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_user_provider
  ON social_accounts(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user_last_login
  ON social_accounts(user_id, last_login_at);
