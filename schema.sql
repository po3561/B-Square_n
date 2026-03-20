-- 1. users: 회원 기본 정보 
CREATE TABLE users (
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

-- 1-1. sessions: 인증 세션 관리
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. user_passes: 수강권(패스) 정보 
CREATE TABLE user_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  pass_type TEXT NOT NULL,
  remaining_count INTEGER DEFAULT 0,
  expires_at DATETIME,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. classes: 클래스(수업) 전체 정보 
CREATE TABLE classes (
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
  coupon_detail TEXT, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. enrollments: 수강 등록 정보 
CREATE TABLE enrollments (
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

-- 5. reviews: 클래스 후기(리뷰) 
CREATE TABLE reviews (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  profile_image_url TEXT,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  helpful_count INTEGER DEFAULT 0,
  is_instructor INTEGER DEFAULT 0
);

-- 6. chats: 클래스 채팅 메시지 
CREATE TABLE chats (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT,
  text TEXT NOT NULL,
  image_url TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_pinned INTEGER DEFAULT 0,
  meta_class_name TEXT,
  meta_class_category TEXT,
  meta_class_image TEXT,
  meta_total_enrolled INTEGER DEFAULT 0,
  meta_online_count INTEGER DEFAULT 0,
  meta_instructor_id TEXT REFERENCES users(id),
  meta_instructor_name TEXT
);

-- 7. group_chats: 그룹(단체) 채팅 
CREATE TABLE group_chats (
  group_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  members TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. dm: 1:1 개인 메시지 
CREATE TABLE dm (
  push_key TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  image_url TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. user_chats: 사용자별 채팅방 목록 
CREATE TABLE user_chats (
  user_id TEXT NOT NULL REFERENCES users(id),
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

-- 10. contacts: 개인 연락처 목록 
CREATE TABLE contacts (
  user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT,
  avatar TEXT,
  source_class_id TEXT REFERENCES classes(id),
  status TEXT DEFAULT 'active',
  memo TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, target_user_id)
);

-- 11. notices: 운영 공지사항 
CREATE TABLE notices (
  push_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'normal',
  author_name TEXT DEFAULT '관리자',
  views INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. class_notices: 클래스별 공지사항 
CREATE TABLE class_notices (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  title TEXT NOT NULL,
  content TEXT,
  class_name TEXT,
  author_name TEXT,
  views INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. faqs: FAQ 
CREATE TABLE faqs (
  push_key TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_hidden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. notice_likes: 공지사항 좋아요 
CREATE TABLE notice_likes (
  notice_id TEXT NOT NULL REFERENCES notices(push_key),
  user_id TEXT NOT NULL REFERENCES users(id),
  value INTEGER DEFAULT 1,
  PRIMARY KEY (notice_id, user_id)
);

-- 15. notice_comments: 공지사항 댓글 
CREATE TABLE notice_comments (
  push_key TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(push_key),
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. coupons: 클래스별 쿠폰 
CREATE TABLE coupons (
  coupon_code TEXT NOT NULL,
  class_id TEXT NOT NULL REFERENCES classes(id),
  type TEXT,
  value INTEGER,
  limit_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  PRIMARY KEY (class_id, coupon_code)
);

-- 17. site_settings: 글로벌 사이트 설정 
CREATE TABLE site_settings (
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
  banners TEXT 
);

-- 18. recommendations: 추천 클래스 폴더 
CREATE TABLE recommendations (
  folder_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  class_ids TEXT, 
  sort_order INTEGER DEFAULT 0
);

-- 19. inquiries: 문의사항/건의사항 
CREATE TABLE inquiries (
  push_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT,
  user_email TEXT,
  category TEXT,
  title TEXT,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 20. user_passes_fb: 수강권 Firebase 버전 
CREATE TABLE user_passes_fb (
  user_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  count INTEGER DEFAULT 0,
  monthly INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  pass_type TEXT,
  total_count INTEGER DEFAULT 0,
  purchased_at DATETIME,
  status TEXT,
  updated_at DATETIME,
  PRIMARY KEY (user_id, class_id)
);

-- 21. class_participants: 클래스 참여자 상세 
CREATE TABLE class_participants (
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
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

-- 22. class_boards: 클래스 게시판 
CREATE TABLE class_boards (
  push_key TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 23. class_gatherings: 클래스 내 모임 정보
CREATE TABLE IF NOT EXISTS class_gatherings (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT, -- 장소 추가
  gathering_at DATETIME NOT NULL,
  deadline_at DATETIME NOT NULL,
  capacity_max INTEGER NOT NULL,
  status TEXT DEFAULT 'open', -- 'open', 'closed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 24. gathering_participants: 모임 참여자 명단
CREATE TABLE IF NOT EXISTS gathering_participants (
  gathering_id TEXT NOT NULL REFERENCES class_gatherings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (gathering_id, user_id)
);