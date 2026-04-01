CREATE TABLE IF NOT EXISTS social_verifications (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT,
  provider_email TEXT,
  email_verified INTEGER DEFAULT 0,
  provider_name TEXT,
  provider_nickname TEXT,
  provider_avatar_url TEXT,
  provider_locale TEXT,
  return_to TEXT,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_verifications_token_hash ON social_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_social_verifications_purpose_expires ON social_verifications(purpose, expires_at);
