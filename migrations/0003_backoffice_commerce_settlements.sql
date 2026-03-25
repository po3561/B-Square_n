CREATE TABLE IF NOT EXISTS user_coupon_wallet (
  id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  claimed_via TEXT DEFAULT 'manual',
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  used_at DATETIME,
  used_order_id TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, coupon_code)
);

CREATE TABLE IF NOT EXISTS user_cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_type TEXT DEFAULT 'class',
  reference_id TEXT NOT NULL,
  class_id TEXT,
  title TEXT,
  instructor_id TEXT,
  instructor_name TEXT,
  thumbnail_url TEXT,
  list_price INTEGER DEFAULT 0,
  sale_price INTEGER DEFAULT 0,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, reference_id)
);

CREATE TABLE IF NOT EXISTS settlement_fee_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  card_fee_rate REAL DEFAULT 6.0,
  tax_rate REAL DEFAULT 3.3,
  platform_fee_rate REAL DEFAULT 1.7,
  payout_day INTEGER DEFAULT 15,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_start TEXT,
  period_end TEXT,
  payout_date TEXT,
  status TEXT DEFAULT 'draft',
  class_count INTEGER DEFAULT 0,
  instructor_count INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  gross_revenue INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  net_revenue INTEGER DEFAULT 0,
  card_fee_amount INTEGER DEFAULT 0,
  tax_fee_amount INTEGER DEFAULT 0,
  platform_fee_amount INTEGER DEFAULT 0,
  settlement_amount INTEGER DEFAULT 0,
  approved_by TEXT,
  approved_at DATETIME,
  approval_result TEXT,
  manager_code TEXT,
  completed_by TEXT,
  completed_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS settlement_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  instructor_id TEXT,
  instructor_name TEXT,
  class_id TEXT,
  class_title TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  order_count INTEGER DEFAULT 0,
  payment_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  gross_revenue INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  net_revenue INTEGER DEFAULT 0,
  card_fee_amount INTEGER DEFAULT 0,
  tax_fee_amount INTEGER DEFAULT 0,
  platform_fee_amount INTEGER DEFAULT 0,
  settlement_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  approval_result TEXT,
  approved_by TEXT,
  approved_at DATETIME,
  completed_by TEXT,
  completed_at DATETIME,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_wallet_user_status ON user_coupon_wallet(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_cart_user_updated ON user_cart_items(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(year, month, status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch_instructor ON settlement_batch_items(batch_id, instructor_id);
