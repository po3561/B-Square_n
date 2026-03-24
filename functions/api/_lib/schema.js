let authSchemaReady = false;
let recommendationsSchemaReady = false;
let classesSchemaReady = false;
let reviewsSchemaReady = false;
let classStatsSchemaReady = false;
let dmMessagesSchemaReady = false;
let userChatsSchemaReady = false;
let contactsSchemaReady = false;
let groupChatsSchemaReady = false;
let chatMessagesSchemaReady = false;
let gatheringsSchemaReady = false;
let operationsSchemaReady = false;
let siteSettingsSchemaReady = false;
let commerceSchemaReady = false;

export async function addColumnIfMissing(db, table, columnDefinition) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`).run();
  } catch (error) {
    const message = error.message || '';
    if (/duplicate column name/i.test(message)) {
      return;
    }

    if (/non-constant default/i.test(message)) {
      const sanitized = columnDefinition
        .replace(/\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, '')
        .replace(/\s+DEFAULT\s+datetime\((?:'now'|"now")\)/gi, '')
        .replace(/\s+DEFAULT\s+datetime\([^)]*\)/gi, '');

      if (sanitized !== columnDefinition) {
        try {
          await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${sanitized}`).run();
          return;
        } catch (retryError) {
          if (/duplicate column name/i.test(retryError.message || '')) {
            return;
          }
          throw retryError;
        }
      }
    }

    throw error;
  }
}

export async function ensureAuthSchema(db) {
  if (authSchemaReady) return;

  await db.prepare(`
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
      operator_seq INTEGER,
      role_updated_by TEXT,
      role_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await addColumnIfMissing(db, 'users', 'password_hash TEXT');
  await addColumnIfMissing(db, 'users', 'name TEXT');
  await addColumnIfMissing(db, 'users', 'phone TEXT');
  await addColumnIfMissing(db, 'users', 'username TEXT UNIQUE');
  await addColumnIfMissing(db, 'users', 'sns_link TEXT');
  await addColumnIfMissing(db, 'users', 'preferred_category TEXT');
  await addColumnIfMissing(db, 'users', 'profile_image_url TEXT');
  await addColumnIfMissing(db, 'users', 'birth_year TEXT');
  await addColumnIfMissing(db, 'users', 'birth_month TEXT');
  await addColumnIfMissing(db, 'users', 'birth_day TEXT');
  await addColumnIfMissing(db, 'users', 'gender TEXT');
  await addColumnIfMissing(db, 'users', "nationality TEXT DEFAULT 'local'");
  await addColumnIfMissing(db, 'users', 'signup_path TEXT');
  await addColumnIfMissing(db, 'users', "role TEXT DEFAULT 'user'");
  await addColumnIfMissing(db, 'users', "membership_level TEXT DEFAULT 'Free'");
  await addColumnIfMissing(db, 'users', 'operator_seq INTEGER');
  await addColumnIfMissing(db, 'users', 'role_updated_by TEXT');
  await addColumnIfMissing(db, 'users', 'role_updated_at DATETIME');
  await addColumnIfMissing(db, 'users', 'is_blacklisted INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'users', 'blacklisted_at DATETIME');
  await addColumnIfMissing(db, 'users', 'blacklisted_by TEXT');
  await addColumnIfMissing(db, 'users', 'blacklist_reason TEXT');
  await addColumnIfMissing(db, 'users', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'users', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await addColumnIfMissing(db, 'sessions', 'user_id TEXT');
  await addColumnIfMissing(db, 'sessions', 'token TEXT');
  await addColumnIfMissing(db, 'sessions', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'sessions', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await addColumnIfMissing(db, 'password_reset_tokens', 'user_id TEXT');
  await addColumnIfMissing(db, 'password_reset_tokens', 'token_hash TEXT');
  await addColumnIfMissing(db, 'password_reset_tokens', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'password_reset_tokens', 'used_at DATETIME');
  await addColumnIfMissing(db, 'password_reset_tokens', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_role_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      previous_role TEXT,
      new_role TEXT NOT NULL,
      changed_by TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_blacklist_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      previous_state INTEGER DEFAULT 0,
      new_state INTEGER DEFAULT 0,
      changed_by TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'user_blacklist_logs', 'previous_state INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_blacklist_logs', 'new_state INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_blacklist_logs', 'changed_by TEXT');
  await addColumnIfMissing(db, 'user_blacklist_logs', 'reason TEXT');
  await addColumnIfMissing(db, 'user_blacklist_logs', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_refund_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      class_id TEXT,
      class_title TEXT,
      refund_type TEXT NOT NULL,
      original_amount INTEGER DEFAULT 0,
      refund_amount INTEGER DEFAULT 0,
      reason_tags TEXT,
      reason_note TEXT,
      status TEXT DEFAULT 'completed',
      processed_by TEXT,
      processed_at DATETIME,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'user_refund_logs', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'order_id TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'class_id TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'class_title TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', "refund_type TEXT DEFAULT 'full'");
  await addColumnIfMissing(db, 'user_refund_logs', 'original_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_refund_logs', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_refund_logs', 'reason_tags TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'reason_note TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', "status TEXT DEFAULT 'completed'");
  await addColumnIfMissing(db, 'user_refund_logs', 'processed_by TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'processed_at DATETIME');
  await addColumnIfMissing(db, 'user_refund_logs', 'metadata TEXT');
  await addColumnIfMissing(db, 'user_refund_logs', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id, expires_at)').run();

  authSchemaReady = true;
}

export async function ensureRecommendationsSchema(db) {
  if (recommendationsSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS recommendations (
      folder_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'regular',
      category TEXT DEFAULT 'all',
      class_ids TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `).run();
  await addColumnIfMissing(db, 'recommendations', "description TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'recommendations', "type TEXT DEFAULT 'regular'");
  await addColumnIfMissing(db, 'recommendations', "category TEXT DEFAULT 'all'");

  recommendationsSchemaReady = true;
}

export async function ensureClassesSchema(db) {
  if (classesSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
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
    )
  `).run();

  await addColumnIfMissing(db, 'classes', 'creator_id TEXT');
  await addColumnIfMissing(db, 'classes', 'creator_email TEXT');
  await addColumnIfMissing(db, 'classes', 'title TEXT');
  await addColumnIfMissing(db, 'classes', 'category TEXT');
  await addColumnIfMissing(db, 'classes', 'keywords TEXT');
  await addColumnIfMissing(db, 'classes', 'summary TEXT');
  await addColumnIfMissing(db, 'classes', 'description TEXT');
  await addColumnIfMissing(db, 'classes', 'description_text TEXT');
  await addColumnIfMissing(db, 'classes', 'price INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'discount_rate INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'coupon_pack INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', "class_type TEXT DEFAULT 'VOD'");
  await addColumnIfMissing(db, 'classes', "operating_mode TEXT DEFAULT 'ONEDAY'");
  await addColumnIfMissing(db, 'classes', 'capacity_min INTEGER');
  await addColumnIfMissing(db, 'classes', 'capacity_max INTEGER');
  await addColumnIfMissing(db, 'classes', 'tickets_price_one_time INTEGER');
  await addColumnIfMissing(db, 'classes', 'tickets_pass_count INTEGER');
  await addColumnIfMissing(db, 'classes', 'tickets_price_multi INTEGER');
  await addColumnIfMissing(db, 'classes', 'tickets_price_monthly INTEGER');
  await addColumnIfMissing(db, 'classes', 'payment_card INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'payment_bank_transfer INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'payment_bank_name TEXT');
  await addColumnIfMissing(db, 'classes', 'payment_bank_account TEXT');
  await addColumnIfMissing(db, 'classes', 'payment_bank_holder TEXT');
  await addColumnIfMissing(db, 'classes', 'image_url TEXT');
  await addColumnIfMissing(db, 'classes', 'image_urls TEXT');
  await addColumnIfMissing(db, 'classes', 'thumbnail TEXT');
  await addColumnIfMissing(db, 'classes', 'curriculum TEXT');
  await addColumnIfMissing(db, 'classes', 'sub_instructors TEXT');
  await addColumnIfMissing(db, 'classes', 'target_audience TEXT');
  await addColumnIfMissing(db, 'classes', 'objectives TEXT');
  await addColumnIfMissing(db, 'classes', 'is_approved INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'is_free INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'instructor_phone TEXT');
  await addColumnIfMissing(db, 'classes', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'classes', 'instructor_email TEXT');
  await addColumnIfMissing(db, 'classes', 'current_participants INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'classes', 'is_public INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'classes', 'coupon_detail TEXT');
  await addColumnIfMissing(db, 'classes', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'classes', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_creator_id ON classes(creator_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_category ON classes(category)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_public ON classes(is_public)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_created_at ON classes(created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_public_created ON classes(is_public, created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_category_created ON classes(category, created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_classes_creator_created ON classes(creator_id, created_at)').run();

  classesSchemaReady = true;
}

export async function ensureReviewsSchema(db) {
  if (reviewsSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS reviews (
      push_key TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      profile_image_url TEXT,
      rating INTEGER,
      content TEXT NOT NULL,
      instructor_reply TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      helpful_count INTEGER DEFAULT 0,
      is_instructor INTEGER DEFAULT 0
    )
  `).run();
  await addColumnIfMissing(db, 'reviews', 'class_id TEXT');
  await addColumnIfMissing(db, 'reviews', 'user_id TEXT');
  await addColumnIfMissing(db, 'reviews', 'user_name TEXT');
  await addColumnIfMissing(db, 'reviews', 'profile_image_url TEXT');
  await addColumnIfMissing(db, 'reviews', 'rating INTEGER');
  await addColumnIfMissing(db, 'reviews', 'content TEXT');
  await addColumnIfMissing(db, 'reviews', 'instructor_reply TEXT');
  await addColumnIfMissing(db, 'reviews', 'image_url TEXT');
  await addColumnIfMissing(db, 'reviews', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'reviews', 'helpful_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'reviews', 'is_instructor INTEGER DEFAULT 0');
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_reviews_class_created ON reviews(class_id, created_at)').run();

  reviewsSchemaReady = true;
}

export async function ensureClassStatsSchema(db) {
  if (classStatsSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_stats (
      class_id TEXT PRIMARY KEY,
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
    )
  `).run();
  await addColumnIfMissing(db, 'class_stats', 'total_visits INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'total_enrollments INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'total_passes_issued INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'total_passes_used INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'total_revenue INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'total_gatherings INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'avg_rating REAL DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'review_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'bookmark_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_stats', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  classStatsSchemaReady = true;
}

export async function ensureDmMessagesSchema(db) {
  if (dmMessagesSchemaReady) return;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      room_type TEXT DEFAULT 'dm',
      class_id TEXT,
      sender_id TEXT NOT NULL,
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
    )
  `).run();
  await addColumnIfMissing(db, 'dm_messages', "room_type TEXT DEFAULT 'dm'");
  await addColumnIfMissing(db, 'dm_messages', 'class_id TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'content TEXT');
  await addColumnIfMissing(db, 'dm_messages', "message TEXT");
  await addColumnIfMissing(db, 'dm_messages', "type TEXT DEFAULT 'text'");
  await addColumnIfMissing(db, 'dm_messages', 'sender_id TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'user_name TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'user_avatar TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'reply_to TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'reply_text TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'reply_user TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'image_url TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'file_name TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'file_size INTEGER');
  await addColumnIfMissing(db, 'dm_messages', 'file_data TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'gather_title TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'gather_time TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'gather_place TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'min_capacity INTEGER');
  await addColumnIfMissing(db, 'dm_messages', 'max_capacity INTEGER');
  await addColumnIfMissing(db, 'dm_messages', 'current_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'dm_messages', 'status TEXT');
  await addColumnIfMissing(db, 'dm_messages', 'is_edited INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'dm_messages', 'is_pinned INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'dm_messages', "reactions TEXT DEFAULT '{}'");
  await addColumnIfMissing(db, 'dm_messages', "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_dm_messages_room_created ON dm_messages(room_id, room_type, created_at)'
  ).run();

  dmMessagesSchemaReady = true;
}

export async function ensureUserChatsSchema(db) {
  if (userChatsSchemaReady) return;

  await ensureAuthSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_chats (
      user_id TEXT NOT NULL,
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
    )
  `).run();
  await addColumnIfMissing(db, 'user_chats', 'class_name TEXT');
  await addColumnIfMissing(db, 'user_chats', 'class_image TEXT');
  await addColumnIfMissing(db, 'user_chats', 'class_category TEXT');
  await addColumnIfMissing(db, 'user_chats', 'total_enrolled INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_chats', 'group_name TEXT');
  await addColumnIfMissing(db, 'user_chats', 'is_instructor INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_chats', 'unread_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_chats', 'last_message TEXT');
  await addColumnIfMissing(db, 'user_chats', 'last_message_at DATETIME');

  userChatsSchemaReady = true;
}

export async function ensureContactsSchema(db) {
  if (contactsSchemaReady) return;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS contacts (
      user_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      source_class_id TEXT,
      status TEXT DEFAULT 'active',
      memo TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, target_user_id)
    )
  `).run();
  await addColumnIfMissing(db, 'contacts', 'name TEXT');
  await addColumnIfMissing(db, 'contacts', 'avatar TEXT');
  await addColumnIfMissing(db, 'contacts', 'source_class_id TEXT');
  await addColumnIfMissing(db, 'contacts', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'contacts', 'memo TEXT');
  await addColumnIfMissing(db, 'contacts', 'added_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  contactsSchemaReady = true;
}

export async function ensureGroupChatsSchema(db) {
  if (groupChatsSchemaReady) return;

  await ensureAuthSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS group_chats (
      group_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'group_chats', 'created_by TEXT');
  await addColumnIfMissing(db, 'group_chats', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  groupChatsSchemaReady = true;
}

export async function ensureChatMessagesSchema(db) {
  if (chatMessagesSchemaReady) return;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
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
      is_pinned INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      reactions TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'chat_messages', 'user_name TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'user_avatar TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'reply_to TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'reply_data TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'type TEXT DEFAULT \'text\'');
  await addColumnIfMissing(db, 'chat_messages', 'image_url TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'file_name TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'file_size INTEGER');
  await addColumnIfMissing(db, 'chat_messages', 'file_data TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'is_pinned INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'chat_messages', 'is_edited INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'chat_messages', "reactions TEXT DEFAULT '{}'");
  await addColumnIfMissing(db, 'chat_messages', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_chat_messages_class_created ON chat_messages(class_id, created_at)').run();

  chatMessagesSchemaReady = true;
}

export async function ensureGatheringsSchema(db) {
  if (gatheringsSchemaReady) return;

  await ensureClassesSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_gatherings (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      instructor_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      gathering_at DATETIME NOT NULL,
      deadline_at DATETIME NOT NULL,
      capacity_min INTEGER DEFAULT 0,
      capacity_max INTEGER NOT NULL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS gathering_participants (
      gathering_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (gathering_id, user_id)
    )
  `).run();
  await addColumnIfMissing(db, 'class_gatherings', 'description TEXT');
  await addColumnIfMissing(db, 'class_gatherings', 'location TEXT');
  await addColumnIfMissing(db, 'class_gatherings', 'capacity_min INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'class_gatherings', "status TEXT DEFAULT 'open'");
  await addColumnIfMissing(db, 'class_gatherings', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_class_gatherings_class_time ON class_gatherings(class_id, gathering_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gathering_participants_gathering_user ON gathering_participants(gathering_id, user_id)').run();

  gatheringsSchemaReady = true;
}

export async function ensureOperationsSchema(db) {
  if (operationsSchemaReady) return;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      email TEXT,
      subject TEXT,
      content TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_participants (
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      remaining_passes INTEGER DEFAULT 0,
      pass_type TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, user_id)
    )
  `).run();
  await addColumnIfMissing(db, 'class_participants', 'joined_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS visitors (
      date TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_email TEXT,
      class_id TEXT,
      class_title TEXT,
      order_type TEXT,
      amount INTEGER DEFAULT 0,
      base_amount INTEGER DEFAULT 0,
      discount_amount INTEGER DEFAULT 0,
      class_discount_amount INTEGER DEFAULT 0,
      coupon_discount_amount INTEGER DEFAULT 0,
      final_amount INTEGER DEFAULT 0,
      coupon_code TEXT,
      pay_method TEXT,
      card_name TEXT,
      status TEXT,
      merchant_uid TEXT,
      receipt_url TEXT,
      coupon_scope TEXT,
      coupon_name TEXT,
      payment_provider TEXT,
      payment_reference TEXT,
      payment_payload TEXT,
      source_enrollment_id TEXT,
      source_type TEXT DEFAULT 'class',
      instructor_id TEXT,
      instructor_name TEXT,
      refund_amount INTEGER DEFAULT 0,
      refund_reason TEXT,
      refund_reason_note TEXT,
      refund_processed_by TEXT,
      refund_processed_at DATETIME,
      settlement_status TEXT DEFAULT 'pending',
      settlement_batch_id TEXT,
      settlement_item_id TEXT,
      settlement_month TEXT,
      settlement_period_key TEXT,
      pay_option TEXT,
      card_fee_amount INTEGER DEFAULT 0,
      tax_fee_amount INTEGER DEFAULT 0,
      platform_fee_amount INTEGER DEFAULT 0,
      net_revenue_amount INTEGER DEFAULT 0,
      instructor_settlement_amount INTEGER DEFAULT 0,
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      refunded_at DATETIME
    )
  `).run();
  await addColumnIfMissing(db, 'orders', 'refunded_at DATETIME');
  await addColumnIfMissing(db, 'orders', 'discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'coupon_scope TEXT');
  await addColumnIfMissing(db, 'orders', 'coupon_name TEXT');
  await addColumnIfMissing(db, 'orders', 'base_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'class_discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'coupon_discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'payment_provider TEXT');
  await addColumnIfMissing(db, 'orders', 'payment_reference TEXT');
  await addColumnIfMissing(db, 'orders', 'payment_payload TEXT');
  await addColumnIfMissing(db, 'orders', 'source_enrollment_id TEXT');
  await addColumnIfMissing(db, 'orders', "source_type TEXT DEFAULT 'class'");
  await addColumnIfMissing(db, 'orders', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'orders', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'orders', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'refund_reason TEXT');
  await addColumnIfMissing(db, 'orders', 'refund_reason_note TEXT');
  await addColumnIfMissing(db, 'orders', 'refund_processed_by TEXT');
  await addColumnIfMissing(db, 'orders', 'refund_processed_at DATETIME');
  await addColumnIfMissing(db, 'orders', "settlement_status TEXT DEFAULT 'pending'");
  await addColumnIfMissing(db, 'orders', 'settlement_batch_id TEXT');
  await addColumnIfMissing(db, 'orders', 'settlement_item_id TEXT');
  await addColumnIfMissing(db, 'orders', 'settlement_month TEXT');
  await addColumnIfMissing(db, 'orders', 'settlement_period_key TEXT');
  await addColumnIfMissing(db, 'orders', 'pay_option TEXT');
  await addColumnIfMissing(db, 'orders', 'card_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'tax_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'platform_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'net_revenue_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'instructor_settlement_amount INTEGER DEFAULT 0');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      pay_method TEXT,
      amount INTEGER DEFAULT 0,
      applied_coupon TEXT,
      order_id TEXT,
      base_amount INTEGER DEFAULT 0,
      class_discount_amount INTEGER DEFAULT 0,
      coupon_discount_amount INTEGER DEFAULT 0,
      final_amount INTEGER DEFAULT 0,
      coupon_code TEXT,
      payment_status TEXT,
      instructor_id TEXT,
      instructor_name TEXT,
      settlement_batch_id TEXT,
      settlement_status TEXT DEFAULT 'pending',
      status TEXT DEFAULT 'active',
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'enrollments', 'user_id TEXT');
  await addColumnIfMissing(db, 'enrollments', 'class_id TEXT');
  await addColumnIfMissing(db, 'enrollments', 'pay_method TEXT');
  await addColumnIfMissing(db, 'enrollments', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'enrollments', 'applied_coupon TEXT');
  await addColumnIfMissing(db, 'enrollments', 'order_id TEXT');
  await addColumnIfMissing(db, 'enrollments', 'base_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'enrollments', 'class_discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'enrollments', 'coupon_discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'enrollments', 'final_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'enrollments', 'coupon_code TEXT');
  await addColumnIfMissing(db, 'enrollments', 'payment_status TEXT');
  await addColumnIfMissing(db, 'enrollments', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'enrollments', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'enrollments', 'settlement_batch_id TEXT');
  await addColumnIfMissing(db, 'enrollments', "settlement_status TEXT DEFAULT 'pending'");
  await addColumnIfMissing(db, 'enrollments', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'enrollments', 'enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'enrollments', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'enrollments', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_passes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      pass_type TEXT,
      remaining_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'user_passes', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_passes', 'class_id TEXT');
  await addColumnIfMissing(db, 'user_passes', 'pass_type TEXT');
  await addColumnIfMissing(db, 'user_passes', 'remaining_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_passes', 'total_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_passes', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'user_passes', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_passes', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY,
      type TEXT,
      amount INTEGER DEFAULT 0,
      description TEXT,
      related_order_id TEXT,
      related_settlement_id TEXT,
      related_user_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'financial_records', 'type TEXT');
  await addColumnIfMissing(db, 'financial_records', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'financial_records', 'description TEXT');
  await addColumnIfMissing(db, 'financial_records', 'related_order_id TEXT');
  await addColumnIfMissing(db, 'financial_records', 'related_settlement_id TEXT');
  await addColumnIfMissing(db, 'financial_records', 'related_user_id TEXT');
  await addColumnIfMissing(db, 'financial_records', 'metadata TEXT');
  await addColumnIfMissing(db, 'financial_records', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      coupon_code TEXT NOT NULL,
      type TEXT DEFAULT 'amount',
      value INTEGER DEFAULT 0,
      limit_count INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(class_id, coupon_code)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS global_coupons (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      type TEXT DEFAULT 'percent',
      amount INTEGER DEFAULT 0,
      min_order_amount INTEGER DEFAULT 0,
      max_issue_count INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 1,
      issue_method TEXT DEFAULT 'claim',
      scope TEXT DEFAULT 'all_classes',
      target_kind TEXT DEFAULT 'class',
      target_ids TEXT,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      starts_at DATETIME,
      expires_at DATETIME,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'global_coupons', 'description TEXT');
  await addColumnIfMissing(db, 'global_coupons', 'image_url TEXT');
  await addColumnIfMissing(db, 'global_coupons', "type TEXT DEFAULT 'percent'");
  await addColumnIfMissing(db, 'global_coupons', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'min_order_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'max_issue_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'per_user_limit INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'global_coupons', "issue_method TEXT DEFAULT 'claim'");
  await addColumnIfMissing(db, 'global_coupons', "scope TEXT DEFAULT 'all_classes'");
  await addColumnIfMissing(db, 'global_coupons', "target_kind TEXT DEFAULT 'class'");
  await addColumnIfMissing(db, 'global_coupons', 'target_ids TEXT');
  await addColumnIfMissing(db, 'global_coupons', 'used_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'is_active INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'global_coupons', 'starts_at DATETIME');
  await addColumnIfMissing(db, 'global_coupons', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'global_coupons', 'created_by TEXT');
  await addColumnIfMissing(db, 'global_coupons', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'global_coupons', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_code TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'user_coupon_wallet', "claimed_via TEXT DEFAULT 'manual'");
  await addColumnIfMissing(db, 'user_coupon_wallet', 'issued_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'used_at DATETIME');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'used_order_id TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'metadata TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id TEXT PRIMARY KEY,
      wallet_id TEXT,
      coupon_code TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      order_id TEXT,
      class_id TEXT,
      discount_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'used',
      metadata TEXT,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'coupon_usage', 'wallet_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'coupon_code TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'user_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'user_name TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'order_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'class_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'discount_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'coupon_usage', "status TEXT DEFAULT 'used'");
  await addColumnIfMissing(db, 'coupon_usage', 'metadata TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'used_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'user_cart_items', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', "item_type TEXT DEFAULT 'class'");
  await addColumnIfMissing(db, 'user_cart_items', 'reference_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'title TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'thumbnail_url TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'list_price INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_cart_items', 'sale_price INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_cart_items', 'metadata TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_cart_items', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlement_fee_settings (
      id TEXT PRIMARY KEY DEFAULT 'global',
      card_fee_rate REAL DEFAULT 6.0,
      tax_rate REAL DEFAULT 3.3,
      platform_fee_rate REAL DEFAULT 1.7,
      payout_day INTEGER DEFAULT 15,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_fee_settings', 'card_fee_rate REAL DEFAULT 6.0');
  await addColumnIfMissing(db, 'settlement_fee_settings', 'tax_rate REAL DEFAULT 3.3');
  await addColumnIfMissing(db, 'settlement_fee_settings', 'platform_fee_rate REAL DEFAULT 1.7');
  await addColumnIfMissing(db, 'settlement_fee_settings', 'payout_day INTEGER DEFAULT 15');
  await addColumnIfMissing(db, 'settlement_fee_settings', 'updated_by TEXT');
  await addColumnIfMissing(db, 'settlement_fee_settings', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_batches', 'year INTEGER');
  await addColumnIfMissing(db, 'settlement_batches', 'month INTEGER');
  await addColumnIfMissing(db, 'settlement_batches', 'period_start TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'period_end TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'payout_date TEXT');
  await addColumnIfMissing(db, 'settlement_batches', "status TEXT DEFAULT 'draft'");
  await addColumnIfMissing(db, 'settlement_batches', 'class_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'instructor_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'order_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'gross_revenue INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'net_revenue INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'card_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'tax_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'platform_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'settlement_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'approved_by TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'approved_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batches', 'approval_result TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'manager_code TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'completed_by TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'completed_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batches', 'notes TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'settlement_batches', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlement_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      instructor_id TEXT,
      instructor_name TEXT,
      instructor_email TEXT,
      instructor_phone TEXT,
      profile_image_url TEXT,
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
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_batch_items', 'batch_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'instructor_email TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'instructor_phone TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'profile_image_url TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'class_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'class_title TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'bank_name TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'bank_account TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'bank_holder TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'order_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'payment_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'refund_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'gross_revenue INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'net_revenue INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'card_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'tax_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'platform_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'settlement_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', "status TEXT DEFAULT 'pending'");
  await addColumnIfMissing(db, 'settlement_batch_items', 'approval_result TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'approved_by TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'approved_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batch_items', 'completed_by TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'completed_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batch_items', 'metadata TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'settlement_batch_items', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
      support_phone TEXT,
      tax_email TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_info', 'support_phone TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'tax_email TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_notices (
      id TEXT PRIMARY KEY,
      push_key TEXT,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      author_name TEXT,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_boards (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      title TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pass_issue_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      issued_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_pass_issue_logs_class_created ON pass_issue_logs(class_id, created_at)').run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_class_paid_at ON orders(class_id, paid_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_settlement_status ON orders(settlement_status, paid_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_settlement_month ON orders(settlement_month, settlement_status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_class_user ON enrollments(class_id, user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_user_class ON enrollments(user_id, class_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_class_time ON enrollments(class_id, enrolled_at, created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_time ON enrollments(enrolled_at, class_id, user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_created_time ON enrollments(created_at, class_id, user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_user_passes_class_user ON user_passes(class_id, user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_user_passes_user_status ON user_passes(user_id, status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enrollments_user_time ON enrollments(user_id, enrolled_at, created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_user_refund_logs_class_time ON user_refund_logs(class_id, processed_at, created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_class_boards_class ON class_boards(class_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_class_notices_class ON class_notices(class_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_financial_records_order ON financial_records(related_order_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_global_coupons_active ON global_coupons(is_active, starts_at, expires_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_coupon_wallet_user_status ON user_coupon_wallet(user_id, status, expires_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_used ON coupon_usage(coupon_code, used_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cart_user_updated ON user_cart_items(user_id, updated_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(year, month, status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_items_batch_instructor ON settlement_batch_items(batch_id, instructor_id)').run();

  operationsSchemaReady = true;
}

export async function ensureSiteSettingsSchema(db) {
  if (siteSettingsSchemaReady) return;

  await db.prepare(`
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
    )
  `).run();

  await addColumnIfMissing(db, 'site_settings', 'site_name TEXT');
  await addColumnIfMissing(db, 'site_settings', 'site_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'logo_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'favicon_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'company_name TEXT');
  await addColumnIfMissing(db, 'site_settings', 'ceo_name TEXT');
  await addColumnIfMissing(db, 'site_settings', 'address TEXT');
  await addColumnIfMissing(db, 'site_settings', 'biz_num TEXT');
  await addColumnIfMissing(db, 'site_settings', 'mail_order_num TEXT');
  await addColumnIfMissing(db, 'site_settings', 'cs_phone TEXT');
  await addColumnIfMissing(db, 'site_settings', 'cs_email TEXT');
  await addColumnIfMissing(db, 'site_settings', 'seo_title TEXT');
  await addColumnIfMissing(db, 'site_settings', 'seo_description TEXT');
  await addColumnIfMissing(db, 'site_settings', 'seo_keywords TEXT');
  await addColumnIfMissing(db, 'site_settings', 'seo_image TEXT');
  await addColumnIfMissing(db, 'site_settings', 'banners TEXT');
  await addColumnIfMissing(db, 'site_settings', 'bottom_banners TEXT');
  await addColumnIfMissing(db, 'site_settings', 'footer_hours TEXT');
  await addColumnIfMissing(db, 'site_settings', 'footer_terms_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'footer_privacy_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'footer_instagram_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'footer_youtube_url TEXT');
  await addColumnIfMissing(db, 'site_settings', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  siteSettingsSchemaReady = true;
}

export async function ensureCommerceSchema(db) {
  if (commerceSchemaReady) return;

  await ensureAuthSchema(db);
  await ensureClassesSchema(db);
  await ensureOperationsSchema(db);

  await db.prepare(`
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
    )
  `).run();

  await addColumnIfMissing(db, 'global_coupons', 'description TEXT');
  await addColumnIfMissing(db, 'global_coupons', "type TEXT DEFAULT 'percent'");
  await addColumnIfMissing(db, 'global_coupons', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'min_order_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'max_issue_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'issued_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'used_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'is_active INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'global_coupons', 'starts_at DATETIME');
  await addColumnIfMissing(db, 'global_coupons', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'global_coupons', "scope TEXT DEFAULT 'all_classes'");
  await addColumnIfMissing(db, 'global_coupons', 'target_class_id TEXT');
  await addColumnIfMissing(db, 'global_coupons', 'per_user_limit INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'global_coupons', 'image_url TEXT');
  await addColumnIfMissing(db, 'global_coupons', 'display_order INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'global_coupons', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'global_coupons', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'coupon_usage', 'coupon_name TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'coupon_type TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'coupon_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'coupon_usage', 'coupon_image_url TEXT');
  await addColumnIfMissing(db, 'coupon_usage', "scope TEXT DEFAULT 'all'");
  await addColumnIfMissing(db, 'coupon_usage', 'user_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'user_name TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'order_id TEXT');
  await addColumnIfMissing(db, 'coupon_usage', 'used_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'coupon_usage', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'user_coupon_wallet', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_code TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_name TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_type TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'coupon_image_url TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', "scope TEXT DEFAULT 'all'");
  await addColumnIfMissing(db, 'user_coupon_wallet', 'min_order_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_coupon_wallet', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'user_coupon_wallet', "source TEXT DEFAULT 'manual'");
  await addColumnIfMissing(db, 'user_coupon_wallet', 'claimed_via TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'issued_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'expires_at DATETIME');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'used_at DATETIME');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'used_order_id TEXT');
  await addColumnIfMissing(db, 'user_coupon_wallet', 'metadata TEXT');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'user_cart_items', 'user_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_id TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_title TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_category TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_image_url TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_summary TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'class_price INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'user_cart_items', 'quantity INTEGER DEFAULT 1');
  await addColumnIfMissing(db, 'user_cart_items', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'user_cart_items', 'snapshot_json TEXT');
  await addColumnIfMissing(db, 'user_cart_items', 'added_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'user_cart_items', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
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
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_info', 'company_name TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'ceo_name TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'biz_num TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'address TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'biz_type TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'manager_email TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'bank_name TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'bank_account TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'bank_holder TEXT');
  await addColumnIfMissing(db, 'settlement_info', 'card_fee_rate REAL DEFAULT 6');
  await addColumnIfMissing(db, 'settlement_info', 'tax_rate REAL DEFAULT 3.3');
  await addColumnIfMissing(db, 'settlement_info', 'platform_fee_rate REAL DEFAULT 1.7');
  await addColumnIfMissing(db, 'settlement_info', 'settlement_day INTEGER DEFAULT 15');
  await addColumnIfMissing(db, 'settlement_info', "settlement_cycle TEXT DEFAULT 'monthly'");
  await addColumnIfMissing(db, 'settlement_info', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlement_batches (
      id TEXT PRIMARY KEY,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      batch_type TEXT DEFAULT 'monthly',
      instructor_id TEXT NOT NULL,
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
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_batches', 'period_year INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'period_month INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'period_key TEXT');
  await addColumnIfMissing(db, 'settlement_batches', "batch_type TEXT DEFAULT 'monthly'");
  await addColumnIfMissing(db, 'settlement_batches', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'instructor_name TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'instructor_email TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'instructor_phone TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'profile_image_url TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'account_bank_name TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'account_number TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'account_holder TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'class_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'order_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'gross_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'payment_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'tax_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'platform_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'deducted_total_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', 'final_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batches', "status TEXT DEFAULT 'draft'");
  await addColumnIfMissing(db, 'settlement_batches', "approval_status TEXT DEFAULT 'pending'");
  await addColumnIfMissing(db, 'settlement_batches', 'approved_by TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'approved_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batches', 'settlement_day TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'notes TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'fee_snapshot_json TEXT');
  await addColumnIfMissing(db, 'settlement_batches', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'settlement_batches', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlement_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      instructor_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
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
    )
  `).run();
  await addColumnIfMissing(db, 'settlement_batch_items', 'batch_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'instructor_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'class_id TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'class_title TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'class_category TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'order_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'gross_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'refund_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'payment_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'tax_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'platform_fee_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'deducted_total_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'final_amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'settlement_batch_items', 'settlement_date TEXT');
  await addColumnIfMissing(db, 'settlement_batch_items', 'latest_order_at DATETIME');
  await addColumnIfMissing(db, 'settlement_batch_items', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'settlement_batch_items', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_global_coupons_active ON global_coupons(is_active, starts_at, expires_at)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coupon_usage_code_user ON coupon_usage(coupon_code, user_id, used_at)`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupon_wallet_unique ON user_coupon_wallet(user_id, coupon_code)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_coupon_wallet_user_status ON user_coupon_wallet(user_id, status, claimed_at)`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cart_items_unique ON user_cart_items(user_id, class_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_cart_items_user_class ON user_cart_items(user_id, class_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(period_year, period_month, instructor_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_settlement_batch_items_batch ON settlement_batch_items(batch_id, class_id)`).run();

  commerceSchemaReady = true;
}
