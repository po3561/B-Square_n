let authSchemaReady = false;

async function addColumnIfMissing(db, table, columnDefinition) {
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
}

export async function ensureClassesSchema(db) {
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
  await addColumnIfMissing(db, 'classes', 'coupon_detail TEXT');
  await addColumnIfMissing(db, 'classes', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(db, 'classes', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}

export async function ensureReviewsSchema(db) {
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
}

export async function ensureClassStatsSchema(db) {
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
}

export async function ensureDmMessagesSchema(db) {
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
}

export async function ensureUserChatsSchema(db) {
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
}

export async function ensureContactsSchema(db) {
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
}

export async function ensureGroupChatsSchema(db) {
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
}

export async function ensureChatMessagesSchema(db) {
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
  await addColumnIfMissing(db, 'chat_messages', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}

export async function ensureGatheringsSchema(db) {
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
}

export async function ensureOperationsSchema(db) {
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
      discount_amount INTEGER DEFAULT 0,
      final_amount INTEGER DEFAULT 0,
      coupon_code TEXT,
      pay_method TEXT,
      card_name TEXT,
      status TEXT,
      merchant_uid TEXT,
      receipt_url TEXT,
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      refunded_at DATETIME
    )
  `).run();
  await addColumnIfMissing(db, 'orders', 'refunded_at DATETIME');

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      pay_method TEXT,
      amount INTEGER DEFAULT 0,
      applied_coupon TEXT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, 'financial_records', 'type TEXT');
  await addColumnIfMissing(db, 'financial_records', 'amount INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'financial_records', 'description TEXT');
  await addColumnIfMissing(db, 'financial_records', 'related_order_id TEXT');
  await addColumnIfMissing(db, 'financial_records', 'related_settlement_id TEXT');
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
}

export async function ensureSiteSettingsSchema(db) {
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
}
