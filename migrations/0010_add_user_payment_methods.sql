CREATE TABLE IF NOT EXISTS user_payment_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  provider TEXT DEFAULT 'card',
  last4 TEXT,
  is_default INTEGER DEFAULT 0,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'card';
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS last4 TEXT;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS is_default INTEGER DEFAULT 0;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS metadata TEXT;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_payment_methods ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_default
  ON user_payment_methods(user_id, is_default, updated_at);
