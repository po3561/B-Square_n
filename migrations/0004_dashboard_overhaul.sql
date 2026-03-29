PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS global_coupons (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'percent',
  amount INTEGER DEFAULT 0,
  min_order_amount INTEGER DEFAULT 0,
  max_issue_count INTEGER DEFAULT 0,
  issued_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  starts_at DATETIME,
  expires_at DATETIME,
  scope TEXT DEFAULT 'all_classes',
  target_class_id TEXT,
  per_user_limit INTEGER DEFAULT 1,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_usage (
  id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  coupon_name TEXT,
  coupon_type TEXT,
  coupon_amount INTEGER DEFAULT 0,
  coupon_image_url TEXT,
  scope TEXT DEFAULT 'all',
  user_id TEXT,
  user_name TEXT,
  order_id TEXT,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_coupon_wallet (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  coupon_code TEXT NOT NULL,
  coupon_name TEXT,
  coupon_type TEXT,
  coupon_amount INTEGER DEFAULT 0,
  coupon_image_url TEXT,
  scope TEXT DEFAULT 'all',
  min_order_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  source TEXT DEFAULT 'manual',
  claimed_via TEXT,
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  used_order_id TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS user_cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  class_title TEXT,
  class_category TEXT,
  class_image_url TEXT,
  class_summary TEXT,
  class_price INTEGER DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  snapshot_json TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_info (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  ceo_name TEXT,
  biz_num TEXT,
  address TEXT,
  biz_type TEXT,
  manager_email TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  card_fee_rate REAL DEFAULT 6,
  tax_rate REAL DEFAULT 3.3,
  platform_fee_rate REAL DEFAULT 1.7,
  settlement_day INTEGER DEFAULT 15,
  settlement_cycle TEXT DEFAULT 'monthly',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT PRIMARY KEY,
  period_year INTEGER DEFAULT 0,
  period_month INTEGER DEFAULT 0,
  period_key TEXT,
  batch_type TEXT DEFAULT 'monthly',
  instructor_id TEXT,
  instructor_name TEXT,
  instructor_email TEXT,
  instructor_phone TEXT,
  profile_image_url TEXT,
  account_bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  class_count INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  gross_amount INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  payment_fee_amount INTEGER DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  platform_fee_amount INTEGER DEFAULT 0,
  deducted_total_amount INTEGER DEFAULT 0,
  final_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  approval_status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at DATETIME,
  settlement_day TEXT,
  notes TEXT,
  fee_snapshot_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  instructor_id TEXT,
  class_id TEXT,
  class_title TEXT,
  class_category TEXT,
  order_count INTEGER DEFAULT 0,
  gross_amount INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  payment_fee_amount INTEGER DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  platform_fee_amount INTEGER DEFAULT 0,
  deducted_total_amount INTEGER DEFAULT 0,
  final_amount INTEGER DEFAULT 0,
  settlement_date TEXT,
  latest_order_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN base_amount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN class_discount_amount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN coupon_discount_amount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN refund_amount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN refund_reason TEXT;
ALTER TABLE orders ADD COLUMN refund_type TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT;
ALTER TABLE orders ADD COLUMN instructor_id TEXT;
ALTER TABLE orders ADD COLUMN instructor_name TEXT;
ALTER TABLE orders ADD COLUMN settlement_batch_id TEXT;
ALTER TABLE orders ADD COLUMN settlement_period_key TEXT;
ALTER TABLE orders ADD COLUMN settlement_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN pay_option TEXT;

ALTER TABLE enrollments ADD COLUMN order_id TEXT;
ALTER TABLE enrollments ADD COLUMN base_amount INTEGER DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN class_discount_amount INTEGER DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN coupon_discount_amount INTEGER DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN final_amount INTEGER DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN coupon_code TEXT;
ALTER TABLE enrollments ADD COLUMN payment_status TEXT DEFAULT 'paid';
ALTER TABLE enrollments ADD COLUMN instructor_id TEXT;
ALTER TABLE enrollments ADD COLUMN instructor_name TEXT;
ALTER TABLE enrollments ADD COLUMN settlement_batch_id TEXT;
ALTER TABLE enrollments ADD COLUMN settlement_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_global_coupons_active ON global_coupons(is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_code_user ON coupon_usage(coupon_code, user_id, used_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupon_wallet_unique ON user_coupon_wallet(user_id, coupon_code);
CREATE INDEX IF NOT EXISTS idx_user_coupon_wallet_user_status ON user_coupon_wallet(user_id, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_user_cart_items_user_class ON user_cart_items(user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(period_year, period_month, instructor_id);
CREATE INDEX IF NOT EXISTS idx_settlement_batch_items_batch ON settlement_batch_items(batch_id, class_id);
