PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  phone TEXT,
  username TEXT UNIQUE,
  sns_link TEXT,
  preferred_category TEXT,
  profile_image_url TEXT,
  birth_year TEXT,
  birth_month TEXT,
  birth_day TEXT,
  gender TEXT,
  nationality TEXT DEFAULT 'local',
  signup_path TEXT,
  role TEXT DEFAULT 'user',
  membership_level TEXT DEFAULT 'Free',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  creator_email TEXT,
  title TEXT NOT NULL,
  category TEXT,
  keywords TEXT,
  summary TEXT,
  description TEXT,
  description_text TEXT,
  price INTEGER DEFAULT 0,
  discount_rate INTEGER DEFAULT 0,
  coupon_pack INTEGER DEFAULT 0,
  class_type TEXT DEFAULT 'VOD',
  operating_mode TEXT DEFAULT 'ONEDAY',
  capacity_min INTEGER,
  capacity_max INTEGER,
  tickets_price_one_time INTEGER,
  tickets_pass_count INTEGER,
  tickets_price_multi INTEGER,
  tickets_price_monthly INTEGER,
  payment_card INTEGER DEFAULT 0,
  payment_bank_transfer INTEGER DEFAULT 0,
  payment_bank_name TEXT,
  payment_bank_account TEXT,
  payment_bank_holder TEXT,
  image_url TEXT,
  image_urls TEXT,
  thumbnail TEXT,
  curriculum TEXT,
  sub_instructors TEXT,
  target_audience TEXT,
  objectives TEXT,
  is_approved INTEGER DEFAULT 0,
  is_free INTEGER DEFAULT 0,
  instructor_phone TEXT,
  instructor_name TEXT,
  instructor_email TEXT,
  current_participants INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 1,
  coupon_detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  payment_id TEXT,
  merchant_uid TEXT,
  amount INTEGER DEFAULT 0,
  paid_at DATETIME,
  receipt_url TEXT,
  pay_method TEXT,
  card_name TEXT,
  status TEXT,
  title TEXT,
  image_url TEXT,
  category TEXT,
  pass_type_purchased TEXT,
  applied_coupon TEXT,
  PRIMARY KEY (user_id, class_id)
);

CREATE TABLE IF NOT EXISTS user_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  pass_type TEXT DEFAULT 'count',
  remaining_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  expires_at DATETIME,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  profile_image_url TEXT,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  instructor_reply TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  helpful_count INTEGER DEFAULT 0,
  is_instructor INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  user_avatar TEXT,
  message TEXT,
  reply_to TEXT,
  reply_data TEXT,
  type TEXT DEFAULT 'text',
  image_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_data TEXT,
  is_edited INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  room_type TEXT DEFAULT 'dm',
  class_id TEXT,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  user_avatar TEXT,
  content TEXT,
  message TEXT,
  type TEXT DEFAULT 'text',
  reply_to TEXT,
  reply_text TEXT,
  reply_user TEXT,
  image_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_data TEXT,
  gather_title TEXT,
  gather_time TEXT,
  gather_place TEXT,
  min_capacity INTEGER,
  max_capacity INTEGER,
  current_count INTEGER DEFAULT 0,
  status TEXT,
  is_edited INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_chats (
  group_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  members TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_chats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  type TEXT NOT NULL,
  class_name TEXT,
  class_image TEXT,
  class_category TEXT,
  total_enrolled INTEGER DEFAULT 0,
  group_name TEXT,
  is_instructor INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  last_message TEXT,
  last_message_at DATETIME,
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  avatar TEXT,
  source_class_id TEXT REFERENCES classes(id),
  status TEXT DEFAULT 'active',
  memo TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'normal',
  author_name TEXT DEFAULT '관리자',
  views INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_notices (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  class_name TEXT,
  author_name TEXT,
  views INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_hidden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  coupon_code TEXT NOT NULL,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT,
  value INTEGER,
  limit_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  PRIMARY KEY (class_id, coupon_code)
);

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  site_name TEXT,
  site_url TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  company_name TEXT,
  ceo_name TEXT,
  address TEXT,
  biz_num TEXT,
  mail_order_num TEXT,
  cs_phone TEXT,
  cs_email TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  seo_image TEXT,
  banners TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendations (
  folder_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'regular',
  category TEXT DEFAULT 'all',
  class_ids TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT,
  email TEXT,
  category TEXT,
  title TEXT,
  content TEXT NOT NULL,
  submitted_by TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_participants (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  online INTEGER DEFAULT 0,
  last_seen DATETIME,
  nickname TEXT,
  user_name TEXT,
  phone TEXT,
  profile_image_url TEXT,
  role TEXT DEFAULT 'student',
  remaining_passes INTEGER DEFAULT 0,
  pass_type TEXT,
  enrolled_at DATETIME,
  is_contact INTEGER DEFAULT 0,
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS class_gatherings (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  instructor_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  gathering_at DATETIME NOT NULL,
  deadline_at DATETIME NOT NULL,
  capacity_min INTEGER DEFAULT 0,
  capacity_max INTEGER NOT NULL,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gathering_participants (
  gathering_id TEXT NOT NULL REFERENCES class_gatherings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (gathering_id, user_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  user_email TEXT,
  class_id TEXT REFERENCES classes(id),
  class_title TEXT,
  order_type TEXT NOT NULL DEFAULT 'class_pass',
  amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  final_amount INTEGER DEFAULT 0,
  coupon_code TEXT,
  pay_method TEXT,
  card_name TEXT,
  status TEXT DEFAULT 'pending',
  merchant_uid TEXT,
  receipt_url TEXT,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME,
  refunded_at DATETIME
);

CREATE TABLE IF NOT EXISTS settlement_info (
  id TEXT PRIMARY KEY DEFAULT 'global',
  company_name TEXT,
  ceo_name TEXT,
  biz_num TEXT,
  address TEXT,
  biz_type TEXT,
  manager_email TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  instructor_id TEXT REFERENCES users(id),
  instructor_name TEXT,
  total_revenue INTEGER DEFAULT 0,
  platform_fee INTEGER DEFAULT 0,
  pg_fee INTEGER DEFAULT 0,
  settlement_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  settled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS financial_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  related_order_id TEXT,
  related_settlement_id TEXT,
  balance_after INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_coupons (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'percent',
  amount INTEGER NOT NULL DEFAULT 0,
  min_order_amount INTEGER DEFAULT 0,
  max_issue_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  starts_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_usage (
  id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES global_coupons(code),
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  order_id TEXT REFERENCES orders(order_id),
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_settings (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT,
  target TEXT DEFAULT '_self',
  visible INTEGER DEFAULT 1,
  audience TEXT DEFAULT 'all',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  page TEXT,
  user_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visitors (
  date TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS class_stats (
  class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  total_visits INTEGER DEFAULT 0,
  total_enrollments INTEGER DEFAULT 0,
  total_passes_issued INTEGER DEFAULT 0,
  total_passes_used INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  total_gatherings INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  UNIQUE(requester_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS pass_issue_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 1,
  reason TEXT DEFAULT 'manual',
  issued_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_title TEXT,
  summary TEXT,
  web_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_classes_creator ON classes(creator_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_user_passes_user_class ON user_passes(user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_reviews_class ON reviews(class_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_class_created ON chat_messages(class_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_messages_room_created ON dm_messages(room_id, room_type, created_at);
CREATE INDEX IF NOT EXISTS idx_user_chats_user ON user_chats(user_id, last_message_at);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_class ON orders(class_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_date ON visitor_logs(date);
CREATE INDEX IF NOT EXISTS idx_friends_receiver_status ON friends(receiver_id, status);
