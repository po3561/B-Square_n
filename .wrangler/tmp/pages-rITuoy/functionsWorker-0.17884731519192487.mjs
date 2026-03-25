var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-ydC2jv/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// api/_lib/http.js
var LOCAL_ORIGINS = /* @__PURE__ */ new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:8788",
  "http://localhost:8788"
]);
function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
__name(normalizeOrigin, "normalizeOrigin");
function getAllowedOrigin(request, env) {
  const requestOrigin = normalizeOrigin(request.headers.get("Origin"));
  const requestUrlOrigin = normalizeOrigin(request.url);
  const appOrigin = normalizeOrigin(env.APP_BASE_URL || env.PUBLIC_APP_URL || "");
  if (!requestOrigin) return appOrigin || requestUrlOrigin || "http://localhost:8788";
  if (LOCAL_ORIGINS.has(requestOrigin)) return requestOrigin;
  if (appOrigin && requestOrigin === appOrigin) return requestOrigin;
  if (requestUrlOrigin && requestOrigin === requestUrlOrigin) return requestOrigin;
  if (requestOrigin.endsWith(".pages.dev")) return requestOrigin;
  return appOrigin || requestUrlOrigin || "http://localhost:8788";
}
__name(getAllowedOrigin, "getAllowedOrigin");
function createCorsHeaders(request, env, extra = {}) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(request, env),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra
  };
}
__name(createCorsHeaders, "createCorsHeaders");
function json(request, env, payload, init = {}) {
  const headers = createCorsHeaders(request, env, {
    "Content-Type": "application/json",
    ...init.headers || {}
  });
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}
__name(json, "json");
function options(request, env, extra = {}) {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(request, env, extra)
  });
}
__name(options, "options");

// api/_lib/schema.js
var authSchemaReady = false;
async function addColumnIfMissing(db, table, columnDefinition) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`).run();
  } catch (error) {
    const message = error.message || "";
    if (/duplicate column name/i.test(message)) {
      return;
    }
    if (/non-constant default/i.test(message)) {
      const sanitized = columnDefinition.replace(/\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, "").replace(/\s+DEFAULT\s+datetime\((?:'now'|"now")\)/gi, "").replace(/\s+DEFAULT\s+datetime\([^)]*\)/gi, "");
      if (sanitized !== columnDefinition) {
        try {
          await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${sanitized}`).run();
          return;
        } catch (retryError) {
          if (/duplicate column name/i.test(retryError.message || "")) {
            return;
          }
          throw retryError;
        }
      }
    }
    throw error;
  }
}
__name(addColumnIfMissing, "addColumnIfMissing");
async function ensureAuthSchema(db) {
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
  await addColumnIfMissing(db, "users", "password_hash TEXT");
  await addColumnIfMissing(db, "users", "name TEXT");
  await addColumnIfMissing(db, "users", "phone TEXT");
  await addColumnIfMissing(db, "users", "username TEXT UNIQUE");
  await addColumnIfMissing(db, "users", "sns_link TEXT");
  await addColumnIfMissing(db, "users", "preferred_category TEXT");
  await addColumnIfMissing(db, "users", "profile_image_url TEXT");
  await addColumnIfMissing(db, "users", "birth_year TEXT");
  await addColumnIfMissing(db, "users", "birth_month TEXT");
  await addColumnIfMissing(db, "users", "birth_day TEXT");
  await addColumnIfMissing(db, "users", "gender TEXT");
  await addColumnIfMissing(db, "users", "nationality TEXT DEFAULT 'local'");
  await addColumnIfMissing(db, "users", "signup_path TEXT");
  await addColumnIfMissing(db, "users", "role TEXT DEFAULT 'user'");
  await addColumnIfMissing(db, "users", "membership_level TEXT DEFAULT 'Free'");
  await addColumnIfMissing(db, "users", "operator_seq INTEGER");
  await addColumnIfMissing(db, "users", "role_updated_by TEXT");
  await addColumnIfMissing(db, "users", "role_updated_at DATETIME");
  await addColumnIfMissing(db, "users", "is_blacklisted INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "users", "blacklisted_at DATETIME");
  await addColumnIfMissing(db, "users", "blacklisted_by TEXT");
  await addColumnIfMissing(db, "users", "blacklist_reason TEXT");
  await addColumnIfMissing(db, "users", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "users", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await addColumnIfMissing(db, "sessions", "user_id TEXT");
  await addColumnIfMissing(db, "sessions", "token TEXT");
  await addColumnIfMissing(db, "sessions", "expires_at DATETIME");
  await addColumnIfMissing(db, "sessions", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
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
  await addColumnIfMissing(db, "password_reset_tokens", "user_id TEXT");
  await addColumnIfMissing(db, "password_reset_tokens", "token_hash TEXT");
  await addColumnIfMissing(db, "password_reset_tokens", "expires_at DATETIME");
  await addColumnIfMissing(db, "password_reset_tokens", "used_at DATETIME");
  await addColumnIfMissing(db, "password_reset_tokens", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
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
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id, expires_at)").run();
  authSchemaReady = true;
}
__name(ensureAuthSchema, "ensureAuthSchema");
async function ensureRecommendationsSchema(db) {
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
  await addColumnIfMissing(db, "recommendations", "description TEXT DEFAULT ''");
  await addColumnIfMissing(db, "recommendations", "type TEXT DEFAULT 'regular'");
  await addColumnIfMissing(db, "recommendations", "category TEXT DEFAULT 'all'");
}
__name(ensureRecommendationsSchema, "ensureRecommendationsSchema");
async function ensureClassesSchema(db) {
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
  await addColumnIfMissing(db, "classes", "creator_id TEXT");
  await addColumnIfMissing(db, "classes", "creator_email TEXT");
  await addColumnIfMissing(db, "classes", "title TEXT");
  await addColumnIfMissing(db, "classes", "category TEXT");
  await addColumnIfMissing(db, "classes", "keywords TEXT");
  await addColumnIfMissing(db, "classes", "summary TEXT");
  await addColumnIfMissing(db, "classes", "description TEXT");
  await addColumnIfMissing(db, "classes", "description_text TEXT");
  await addColumnIfMissing(db, "classes", "price INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "discount_rate INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "coupon_pack INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "class_type TEXT DEFAULT 'VOD'");
  await addColumnIfMissing(db, "classes", "operating_mode TEXT DEFAULT 'ONEDAY'");
  await addColumnIfMissing(db, "classes", "capacity_min INTEGER");
  await addColumnIfMissing(db, "classes", "capacity_max INTEGER");
  await addColumnIfMissing(db, "classes", "tickets_price_one_time INTEGER");
  await addColumnIfMissing(db, "classes", "tickets_pass_count INTEGER");
  await addColumnIfMissing(db, "classes", "tickets_price_multi INTEGER");
  await addColumnIfMissing(db, "classes", "tickets_price_monthly INTEGER");
  await addColumnIfMissing(db, "classes", "payment_card INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "payment_bank_transfer INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "payment_bank_name TEXT");
  await addColumnIfMissing(db, "classes", "payment_bank_account TEXT");
  await addColumnIfMissing(db, "classes", "payment_bank_holder TEXT");
  await addColumnIfMissing(db, "classes", "image_url TEXT");
  await addColumnIfMissing(db, "classes", "image_urls TEXT");
  await addColumnIfMissing(db, "classes", "thumbnail TEXT");
  await addColumnIfMissing(db, "classes", "curriculum TEXT");
  await addColumnIfMissing(db, "classes", "sub_instructors TEXT");
  await addColumnIfMissing(db, "classes", "target_audience TEXT");
  await addColumnIfMissing(db, "classes", "objectives TEXT");
  await addColumnIfMissing(db, "classes", "is_approved INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "is_free INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "instructor_phone TEXT");
  await addColumnIfMissing(db, "classes", "instructor_name TEXT");
  await addColumnIfMissing(db, "classes", "instructor_email TEXT");
  await addColumnIfMissing(db, "classes", "current_participants INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "classes", "coupon_detail TEXT");
  await addColumnIfMissing(db, "classes", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "classes", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureClassesSchema, "ensureClassesSchema");
async function ensureReviewsSchema(db) {
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
  await addColumnIfMissing(db, "reviews", "class_id TEXT");
  await addColumnIfMissing(db, "reviews", "user_id TEXT");
  await addColumnIfMissing(db, "reviews", "user_name TEXT");
  await addColumnIfMissing(db, "reviews", "profile_image_url TEXT");
  await addColumnIfMissing(db, "reviews", "rating INTEGER");
  await addColumnIfMissing(db, "reviews", "content TEXT");
  await addColumnIfMissing(db, "reviews", "instructor_reply TEXT");
  await addColumnIfMissing(db, "reviews", "image_url TEXT");
  await addColumnIfMissing(db, "reviews", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "reviews", "helpful_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "reviews", "is_instructor INTEGER DEFAULT 0");
}
__name(ensureReviewsSchema, "ensureReviewsSchema");
async function ensureClassStatsSchema(db) {
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
  await addColumnIfMissing(db, "class_stats", "total_visits INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "total_enrollments INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "total_passes_issued INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "total_passes_used INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "total_revenue INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "total_gatherings INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "avg_rating REAL DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "review_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "bookmark_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_stats", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureClassStatsSchema, "ensureClassStatsSchema");
async function ensureDmMessagesSchema(db) {
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
  await addColumnIfMissing(db, "dm_messages", "room_type TEXT DEFAULT 'dm'");
  await addColumnIfMissing(db, "dm_messages", "class_id TEXT");
  await addColumnIfMissing(db, "dm_messages", "content TEXT");
  await addColumnIfMissing(db, "dm_messages", "message TEXT");
  await addColumnIfMissing(db, "dm_messages", "type TEXT DEFAULT 'text'");
  await addColumnIfMissing(db, "dm_messages", "reply_to TEXT");
  await addColumnIfMissing(db, "dm_messages", "reply_text TEXT");
  await addColumnIfMissing(db, "dm_messages", "reply_user TEXT");
  await addColumnIfMissing(db, "dm_messages", "image_url TEXT");
  await addColumnIfMissing(db, "dm_messages", "file_name TEXT");
  await addColumnIfMissing(db, "dm_messages", "file_size INTEGER");
  await addColumnIfMissing(db, "dm_messages", "file_data TEXT");
  await addColumnIfMissing(db, "dm_messages", "gather_title TEXT");
  await addColumnIfMissing(db, "dm_messages", "gather_time TEXT");
  await addColumnIfMissing(db, "dm_messages", "gather_place TEXT");
  await addColumnIfMissing(db, "dm_messages", "min_capacity INTEGER");
  await addColumnIfMissing(db, "dm_messages", "max_capacity INTEGER");
  await addColumnIfMissing(db, "dm_messages", "current_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "dm_messages", "status TEXT");
  await addColumnIfMissing(db, "dm_messages", "is_edited INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "dm_messages", "is_pinned INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "dm_messages", "reactions TEXT DEFAULT '{}'");
  await addColumnIfMissing(db, "dm_messages", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_dm_messages_room_created ON dm_messages(room_id, room_type, created_at)"
  ).run();
}
__name(ensureDmMessagesSchema, "ensureDmMessagesSchema");
async function ensureUserChatsSchema(db) {
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
  await addColumnIfMissing(db, "user_chats", "class_name TEXT");
  await addColumnIfMissing(db, "user_chats", "class_image TEXT");
  await addColumnIfMissing(db, "user_chats", "class_category TEXT");
  await addColumnIfMissing(db, "user_chats", "total_enrolled INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "user_chats", "group_name TEXT");
  await addColumnIfMissing(db, "user_chats", "is_instructor INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "user_chats", "unread_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "user_chats", "last_message TEXT");
  await addColumnIfMissing(db, "user_chats", "last_message_at DATETIME");
}
__name(ensureUserChatsSchema, "ensureUserChatsSchema");
async function ensureContactsSchema(db) {
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
  await addColumnIfMissing(db, "contacts", "name TEXT");
  await addColumnIfMissing(db, "contacts", "avatar TEXT");
  await addColumnIfMissing(db, "contacts", "source_class_id TEXT");
  await addColumnIfMissing(db, "contacts", "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, "contacts", "memo TEXT");
  await addColumnIfMissing(db, "contacts", "added_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureContactsSchema, "ensureContactsSchema");
async function ensureGroupChatsSchema(db) {
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
  await addColumnIfMissing(db, "group_chats", "created_by TEXT");
  await addColumnIfMissing(db, "group_chats", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureGroupChatsSchema, "ensureGroupChatsSchema");
async function ensureChatMessagesSchema(db) {
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
  await addColumnIfMissing(db, "chat_messages", "user_name TEXT");
  await addColumnIfMissing(db, "chat_messages", "user_avatar TEXT");
  await addColumnIfMissing(db, "chat_messages", "reply_to TEXT");
  await addColumnIfMissing(db, "chat_messages", "reply_data TEXT");
  await addColumnIfMissing(db, "chat_messages", "type TEXT DEFAULT 'text'");
  await addColumnIfMissing(db, "chat_messages", "image_url TEXT");
  await addColumnIfMissing(db, "chat_messages", "file_name TEXT");
  await addColumnIfMissing(db, "chat_messages", "file_size INTEGER");
  await addColumnIfMissing(db, "chat_messages", "file_data TEXT");
  await addColumnIfMissing(db, "chat_messages", "is_pinned INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "chat_messages", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureChatMessagesSchema, "ensureChatMessagesSchema");
async function ensureGatheringsSchema(db) {
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
  await addColumnIfMissing(db, "class_gatherings", "description TEXT");
  await addColumnIfMissing(db, "class_gatherings", "location TEXT");
  await addColumnIfMissing(db, "class_gatherings", "capacity_min INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "class_gatherings", "status TEXT DEFAULT 'open'");
  await addColumnIfMissing(db, "class_gatherings", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureGatheringsSchema, "ensureGatheringsSchema");
async function ensureOperationsSchema(db) {
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
  await addColumnIfMissing(db, "orders", "refunded_at DATETIME");
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
  await addColumnIfMissing(db, "enrollments", "user_id TEXT");
  await addColumnIfMissing(db, "enrollments", "class_id TEXT");
  await addColumnIfMissing(db, "enrollments", "pay_method TEXT");
  await addColumnIfMissing(db, "enrollments", "amount INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "enrollments", "applied_coupon TEXT");
  await addColumnIfMissing(db, "enrollments", "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, "enrollments", "enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "enrollments", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "enrollments", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
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
  await addColumnIfMissing(db, "user_passes", "user_id TEXT");
  await addColumnIfMissing(db, "user_passes", "class_id TEXT");
  await addColumnIfMissing(db, "user_passes", "pass_type TEXT");
  await addColumnIfMissing(db, "user_passes", "remaining_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "user_passes", "total_count INTEGER DEFAULT 0");
  await addColumnIfMissing(db, "user_passes", "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, "user_passes", "created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(db, "user_passes", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
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
__name(ensureOperationsSchema, "ensureOperationsSchema");
async function ensureSiteSettingsSchema(db) {
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
  await addColumnIfMissing(db, "site_settings", "site_name TEXT");
  await addColumnIfMissing(db, "site_settings", "site_url TEXT");
  await addColumnIfMissing(db, "site_settings", "logo_url TEXT");
  await addColumnIfMissing(db, "site_settings", "favicon_url TEXT");
  await addColumnIfMissing(db, "site_settings", "company_name TEXT");
  await addColumnIfMissing(db, "site_settings", "ceo_name TEXT");
  await addColumnIfMissing(db, "site_settings", "address TEXT");
  await addColumnIfMissing(db, "site_settings", "biz_num TEXT");
  await addColumnIfMissing(db, "site_settings", "mail_order_num TEXT");
  await addColumnIfMissing(db, "site_settings", "cs_phone TEXT");
  await addColumnIfMissing(db, "site_settings", "cs_email TEXT");
  await addColumnIfMissing(db, "site_settings", "seo_title TEXT");
  await addColumnIfMissing(db, "site_settings", "seo_description TEXT");
  await addColumnIfMissing(db, "site_settings", "seo_keywords TEXT");
  await addColumnIfMissing(db, "site_settings", "seo_image TEXT");
  await addColumnIfMissing(db, "site_settings", "banners TEXT");
  await addColumnIfMissing(db, "site_settings", "bottom_banners TEXT");
  await addColumnIfMissing(db, "site_settings", "footer_hours TEXT");
  await addColumnIfMissing(db, "site_settings", "footer_terms_url TEXT");
  await addColumnIfMissing(db, "site_settings", "footer_privacy_url TEXT");
  await addColumnIfMissing(db, "site_settings", "footer_instagram_url TEXT");
  await addColumnIfMissing(db, "site_settings", "footer_youtube_url TEXT");
  await addColumnIfMissing(db, "site_settings", "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}
__name(ensureSiteSettingsSchema, "ensureSiteSettingsSchema");

// api/_lib/auth.js
var PASSWORD_SALT = "_bsq_salt_2024";
var MASTER_ADMIN_USER_ID = "user_b7a935e26112";
var ROLE_RANK = {
  user: 0,
  student: 0,
  member: 0,
  instructor: 1,
  operator: 2,
  admin: 3,
  super_admin: 3
};
var ROLE_LABEL = {
  user: "\uC77C\uBC18\uC218\uAC15\uC0DD",
  student: "\uC77C\uBC18\uC218\uAC15\uC0DD",
  member: "\uC77C\uBC18\uC218\uAC15\uC0DD",
  instructor: "\uAC15\uC0AC",
  operator: "\uC6B4\uC601\uAD00\uB9AC\uC790",
  admin: "\uCD1D\uAD04\uC6B4\uC601\uAD00\uB9AC\uC790",
  super_admin: "\uCD1D\uAD04\uC6B4\uC601\uAD00\uB9AC\uC790"
};
function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (!value) return "user";
  if (["super-admin", "superadmin", "root", "owner"].includes(value)) return "super_admin";
  if (["manager", "operator_admin", "ops"].includes(value)) return "operator";
  if (["teacher", "lecturer"].includes(value)) return "instructor";
  return value in ROLE_RANK ? value : "user";
}
__name(normalizeRole, "normalizeRole");
function getRoleRank(role) {
  return ROLE_RANK[normalizeRole(role)] ?? 0;
}
__name(getRoleRank, "getRoleRank");
function getRoleLabel(role) {
  return ROLE_LABEL[normalizeRole(role)] || ROLE_LABEL.user;
}
__name(getRoleLabel, "getRoleLabel");
function isAtLeastRole(role, minimumRole) {
  return getRoleRank(role) >= getRoleRank(minimumRole);
}
__name(isAtLeastRole, "isAtLeastRole");
function isMasterAdminUserId(userId) {
  return String(userId || "") === MASTER_ADMIN_USER_ID;
}
__name(isMasterAdminUserId, "isMasterAdminUserId");
function applyMasterAdminOverride(user) {
  if (!user || !isMasterAdminUserId(user.id)) return user;
  return {
    ...user,
    role: "super_admin",
    membership_level: user.membership_level || "Admin",
    operator_seq: user.operator_seq || 1
  };
}
__name(applyMasterAdminOverride, "applyMasterAdminOverride");
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return;
    cookies[key] = rest.join("=");
  });
  return cookies;
}
__name(parseCookies, "parseCookies");
function getSessionToken(request) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  if (cookies.bsq_session) return cookies.bsq_session;
  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();
  const headerToken = request.headers.get("X-Session-Token");
  if (headerToken) return headerToken.trim();
  return null;
}
__name(getSessionToken, "getSessionToken");
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
function createSessionCookie(token, request) {
  const url = new URL(request.url);
  const parts = [
    `bsq_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${30 * 24 * 60 * 60}`
  ];
  if (url.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}
__name(createSessionCookie, "createSessionCookie");
function clearSessionCookie(request) {
  const url = new URL(request.url);
  const parts = [
    "bsq_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (url.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}
__name(clearSessionCookie, "clearSessionCookie");
async function getCurrentUser(context) {
  const { request, env } = context;
  await ensureAuthSchema(env.DB);
  const token = getSessionToken(request);
  if (!token) return null;
  const session = await env.DB.prepare(`
    SELECT
      s.id AS session_id,
      s.token,
      s.expires_at,
      u.id,
      u.email,
      u.name,
      u.username,
      u.phone,
      u.profile_image_url,
      u.role,
      u.operator_seq,
      u.membership_level,
      u.birth_year,
      u.birth_month,
      u.birth_day,
      u.gender,
      u.nationality
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
      AND s.expires_at > datetime('now')
  `).bind(token).first();
  if (!session) return null;
  const user = applyMasterAdminOverride({
    id: session.id,
    email: session.email,
    name: session.name,
    username: session.username,
    phone: session.phone,
    profile_image_url: session.profile_image_url,
    role: session.role,
    operator_seq: session.operator_seq,
    membership_level: session.membership_level,
    birth_year: session.birth_year,
    birth_month: session.birth_month,
    birth_day: session.birth_day,
    gender: session.gender,
    nationality: session.nationality
  });
  return {
    session: {
      id: session.session_id,
      token: session.token,
      expires_at: session.expires_at
    },
    user
  };
}
__name(getCurrentUser, "getCurrentUser");
async function requireSession(context) {
  const current = await getCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."
      }, { status: 401 })
    };
  }
  return { ok: true, ...current };
}
__name(requireSession, "requireSession");
async function requireAdmin(context) {
  const current = await requireSession(context);
  if (!current.ok) return current;
  if (!isAtLeastRole(current.user.role, "admin")) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."
      }, { status: 403 })
    };
  }
  return current;
}
__name(requireAdmin, "requireAdmin");
async function requireClassManager(context, classId) {
  const current = await requireSession(context);
  if (!current.ok) return current;
  await ensureAuthSchema(context.env.DB);
  await ensureClassesSchema(context.env.DB);
  const cls = await context.env.DB.prepare(`
    SELECT id, creator_id, sub_instructors
    FROM classes
    WHERE id = ?
  `).bind(classId).first();
  if (!cls) {
    return {
      ok: false,
      response: json(context.request, context.env, {
        success: false,
        error: "\uB300\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
      }, { status: 404 })
    };
  }
  const userId = current.user.id;
  if (isAtLeastRole(current.user.role, "operator") || cls.creator_id === userId || String(cls.sub_instructors || "").includes(userId)) {
    return current;
  }
  return {
    ok: false,
    response: json(context.request, context.env, {
      success: false,
      error: "\uD074\uB798\uC2A4 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."
    }, { status: 403 })
  };
}
__name(requireClassManager, "requireClassManager");

// api/admin/classes.js
function buildLike(value) {
  return `%${String(value || "").trim()}%`;
}
__name(buildLike, "buildLike");
function parseIntSafe(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
__name(parseIntSafe, "parseIntSafe");
async function loadClasses(db, params) {
  let sql = `
    SELECT
      c.*,
      u.name AS creator_name,
      u.email AS creator_email,
      u.phone AS creator_phone,
      COALESCE(s.avg_rating, 0) AS avg_rating,
      COALESCE(s.review_count, 0) AS review_count,
      COALESCE(s.total_visits, 0) AS total_visits,
      COALESCE(s.total_enrollments, 0) AS total_enrollments,
      COALESCE(s.total_passes_issued, 0) AS total_passes_issued,
      COALESCE(s.total_passes_used, 0) AS total_passes_used,
      COALESCE(s.total_revenue, 0) AS total_revenue,
      COALESCE(s.bookmark_count, 0) AS bookmark_count
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    LEFT JOIN class_stats s ON s.class_id = c.id
    WHERE 1=1
  `;
  const bindings = [];
  if (params.q) {
    sql += `
      AND (
        c.title LIKE ?
        OR c.category LIKE ?
        OR c.keywords LIKE ?
        OR c.summary LIKE ?
        OR c.description LIKE ?
        OR c.description_text LIKE ?
        OR c.instructor_name LIKE ?
        OR c.creator_email LIKE ?
        OR u.name LIKE ?
        OR u.email LIKE ?
      )
    `;
    const like = buildLike(params.q);
    bindings.push(like, like, like, like, like, like, like, like, like, like);
  }
  if (params.category) {
    sql += " AND (c.category LIKE ? OR c.keywords LIKE ?)";
    const like = buildLike(params.category);
    bindings.push(like, like);
  }
  if (params.instructorId) {
    sql += " AND c.creator_id = ?";
    bindings.push(params.instructorId);
  }
  if (params.approved !== null) {
    sql += " AND c.is_approved = ?";
    bindings.push(params.approved ? 1 : 0);
  }
  sql += " ORDER BY c.created_at DESC, c.title ASC";
  if (params.limit !== null) {
    sql += " LIMIT ? OFFSET ?";
    bindings.push(params.limit, params.offset);
  }
  const { results } = await db.prepare(sql).bind(...bindings).all();
  return Array.isArray(results) ? results : [];
}
__name(loadClasses, "loadClasses");
async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return options(request, env);
  }
  if (request.method !== "GET") {
    return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
  }
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);
    const limitParam = url.searchParams.get("limit");
    const hasLimit = limitParam !== null && limitParam !== "";
    const limit = hasLimit ? Math.min(Math.max(parseIntSafe(limitParam, 0), 1), 5e3) : null;
    const offset = Math.max(parseIntSafe(url.searchParams.get("offset"), 0), 0);
    const q = String(url.searchParams.get("q") || "").trim();
    const category = String(url.searchParams.get("category") || "").trim();
    const instructorId = String(url.searchParams.get("instructor_id") || url.searchParams.get("creator_id") || "").trim();
    const approvedParam = url.searchParams.get("is_approved");
    const approved = approvedParam === "1" ? true : approvedParam === "0" ? false : null;
    const data = await loadClasses(db, {
      q,
      category,
      instructorId,
      approved,
      limit,
      offset
    });
    return json(request, env, {
      success: true,
      data,
      meta: {
        count: data.length,
        limit,
        offset,
        q,
        category,
        instructorId,
        is_approved: approvedParam
      }
    });
  } catch (error) {
    console.error("[API /admin/classes] Error:", error);
    return json(request, env, {
      success: false,
      error: "\uAD00\uB9AC\uC790 \uD074\uB798\uC2A4 \uCE74\uD0C8\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequest, "onRequest");
async function onRequestOptions(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions, "onRequestOptions");

// api/admin/recommendations.js
function json2(request, env, data, init = {}) {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    ...init.headers || {}
  };
  return json(request, env, data, { ...init, headers });
}
__name(json2, "json");
function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(parseMaybeJsonArray, "parseMaybeJsonArray");
function uniqueStrings(values) {
  return Array.from(
    new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean)
    )
  );
}
__name(uniqueStrings, "uniqueStrings");
function extractClassIds(rawFolder) {
  const directClassIds = parseMaybeJsonArray(rawFolder?.classIds);
  const snakeClassIds = parseMaybeJsonArray(rawFolder?.class_ids);
  const classObjects = Array.isArray(rawFolder?.classes) ? rawFolder.classes : [];
  const objectIds = classObjects.map((item) => item?.id ?? item?.class_id ?? item);
  return uniqueStrings([...directClassIds, ...snakeClassIds, ...objectIds]);
}
__name(extractClassIds, "extractClassIds");
function normalizeFolder(rawFolder, fallbackType) {
  if (!rawFolder || typeof rawFolder !== "object") return null;
  const type = rawFolder.type === "popular" ? "popular" : fallbackType;
  const id = String(rawFolder.id || rawFolder.folder_id || (type === "popular" ? "popular_main" : "")).trim();
  const title = String(rawFolder.title || "").trim();
  const description = String(rawFolder.description || "").trim();
  const category = String(rawFolder.category || "all").trim() || "all";
  const orderNumber = Number(rawFolder.order ?? rawFolder.sort_order ?? 0);
  const order = Number.isFinite(orderNumber) ? orderNumber : 0;
  const classIds = extractClassIds(rawFolder);
  if (!id) {
    return { error: "Folder id is required" };
  }
  if (type === "popular") {
    return {
      id,
      title: title || "\uC778\uAE30 \uD074\uB798\uC2A4",
      description,
      category,
      type,
      classIds,
      order
    };
  }
  if (!title) {
    return { error: "Folder title is required" };
  }
  return {
    id,
    title,
    description,
    category,
    type,
    classIds,
    order
  };
}
__name(normalizeFolder, "normalizeFolder");
function parseRequestTargetType(body) {
  const explicitType = body?.targetType;
  if (explicitType === "popular" || explicitType === "regular") {
    return explicitType;
  }
  if (Array.isArray(body?.folders) && body.folders.length > 0) {
    return body.folders[0]?.type === "popular" ? "popular" : "regular";
  }
  return "regular";
}
__name(parseRequestTargetType, "parseRequestTargetType");
function parseDeletedFolderIds(body) {
  const raw = body?.deletedFolderIds ?? body?.removedFolderIds ?? body?.deletedIds ?? body?.removedIds ?? [];
  return uniqueStrings(parseMaybeJsonArray(raw));
}
__name(parseDeletedFolderIds, "parseDeletedFolderIds");
async function enrichFolders(db, folders) {
  const enrichedFolders = [];
  for (const folder of folders) {
    let classIds = [];
    try {
      classIds = JSON.parse(folder.class_ids || "[]");
      if (!Array.isArray(classIds)) classIds = [];
    } catch {
      classIds = [];
    }
    let folderClasses = [];
    if (classIds.length > 0) {
      const placeholders = classIds.map(() => "?").join(",");
      const { results } = await db.prepare(`
          SELECT
            c.id, c.title, c.thumbnail, c.image_url, c.category, c.price,
            c.instructor_name, c.creator_id AS instructor_id, c.discount_rate,
            COALESCE(s.avg_rating, 0) AS avg_rating,
            COALESCE(s.review_count, 0) AS review_count
          FROM classes c
          LEFT JOIN class_stats s ON c.id = s.class_id
          WHERE c.id IN (${placeholders})
        `).bind(...classIds).all();
      const classMap = new Map((results || []).map((item) => [String(item.id), item]));
      folderClasses = classIds.map((id) => {
        const classData = classMap.get(String(id));
        if (!classData) {
          console.warn("[API /admin/recommendations] Missing class for recommendation entry:", id);
        }
        return classData || null;
      }).filter(Boolean);
    }
    enrichedFolders.push({
      folder_id: folder.folder_id,
      title: folder.title,
      description: folder.description || "",
      category: folder.category || "all",
      type: folder.type || "regular",
      sort_order: folder.sort_order,
      class_ids: classIds,
      classes: folderClasses
    });
  }
  return enrichedFolders;
}
__name(enrichFolders, "enrichFolders");
async function upsertFolders(db, folders) {
  if (!folders.length) return;
  const stmts = folders.map(
    (folder) => db.prepare(`
        INSERT INTO recommendations (
          folder_id,
          title,
          description,
          type,
          category,
          class_ids,
          sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(folder_id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          type = excluded.type,
          category = excluded.category,
          class_ids = excluded.class_ids,
          sort_order = excluded.sort_order
      `).bind(
      folder.id,
      folder.title,
      folder.description || "",
      folder.type,
      folder.category || "all",
      JSON.stringify(folder.classIds || []),
      folder.order || 0
    )
  );
  await db.batch(stmts);
}
__name(upsertFolders, "upsertFolders");
async function deleteFolders(db, type, folderIds) {
  const ids = uniqueStrings(folderIds);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.prepare(`DELETE FROM recommendations WHERE type = ? AND folder_id IN (${placeholders})`).bind(type, ...ids).run();
}
__name(deleteFolders, "deleteFolders");
async function onRequest2(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  try {
    await ensureRecommendationsSchema(db);
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);
    if (method === "GET") {
      const { results: folders } = await db.prepare(`
          SELECT folder_id, title, description, type, category, class_ids, sort_order
          FROM recommendations
          ORDER BY CASE WHEN type = 'popular' THEN 0 ELSE 1 END, sort_order ASC, folder_id ASC
        `).all();
      const enrichedFolders = await enrichFolders(db, folders || []);
      return json2(request, env, { success: true, data: enrichedFolders });
    }
    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const incomingFolders = Array.isArray(body?.folders) ? body.folders : [];
      const targetType = parseRequestTargetType(body);
      const deletedFolderIds = parseDeletedFolderIds(body);
      const normalizedFolders = [];
      for (const rawFolder of incomingFolders) {
        const normalized = normalizeFolder(rawFolder, targetType);
        if (!normalized) continue;
        if (normalized.error) {
          return json2(request, env, { success: false, error: normalized.error }, { status: 400 });
        }
        if (normalized.type !== targetType) {
          return json2(request, env, { success: false, error: "Mixed recommendation types are not allowed in one request" }, { status: 400 });
        }
        normalizedFolders.push(normalized);
      }
      if (targetType === "popular" && normalizedFolders.length > 1) {
        return json2(request, env, { success: false, error: "Popular recommendations require exactly one folder payload" }, { status: 400 });
      }
      const incomingIds = new Set(normalizedFolders.map((folder) => folder.id));
      const safeDeletedIds = deletedFolderIds.filter((id) => !incomingIds.has(id));
      await upsertFolders(db, normalizedFolders);
      await deleteFolders(db, targetType, safeDeletedIds);
      return json2(request, env, {
        success: true,
        message: "Saved successfully",
        savedCount: normalizedFolders.length,
        deletedCount: safeDeletedIds.length
      });
    }
    return json2(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("[API /admin/recommendations] Error:", err);
    return json2(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequest2, "onRequest");
async function onRequestOptions2({ request, env }) {
  return options(request, env, {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
  });
}
__name(onRequestOptions2, "onRequestOptions");

// api/admin/stats.js
async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const range = Math.max(1, Math.min(parseInt(url.searchParams.get("range")) || 7, 30));
  try {
    await ensureAuthSchema(db);
    await ensureClassesSchema(db);
    await ensureOperationsSchema(db);
    const [userCount, classCount, enrollmentCount, inquiryCount] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS cnt FROM users").first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM classes").first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM enrollments").first().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) AS cnt FROM inquiries WHERE status = 'pending'").first().catch(() => ({ cnt: 0 }))
    ]);
    let totalRevenue = { total: 0 };
    try {
      totalRevenue = await db.prepare("SELECT COALESCE(SUM(final_amount), 0) AS total FROM orders WHERE status = 'paid'").first();
    } catch {
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let todayVisitors = { count: 0 };
    try {
      todayVisitors = await db.prepare("SELECT count FROM visitors WHERE date = ?").bind(today).first() || { count: 0 };
    } catch {
    }
    const chartLabels = [];
    const chartNewUsers = [];
    const chartRevenue = [];
    const chartVisitors = [];
    for (let i = range - 1; i >= 0; i -= 1) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      chartLabels.push(dateStr);
      try {
        const u = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE date(created_at) = ?").bind(dateStr).first();
        chartNewUsers.push(u?.cnt || 0);
      } catch {
        chartNewUsers.push(0);
      }
      try {
        const r = await db.prepare("SELECT COALESCE(SUM(final_amount), 0) AS total FROM orders WHERE status = 'paid' AND date(paid_at) = ?").bind(dateStr).first();
        chartRevenue.push(r?.total || 0);
      } catch {
        chartRevenue.push(0);
      }
      try {
        const v = await db.prepare("SELECT count FROM visitors WHERE date = ?").bind(dateStr).first();
        chartVisitors.push(v?.count || 0);
      } catch {
        chartVisitors.push(0);
      }
    }
    let recentOrders = [];
    try {
      const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5").all();
      recentOrders = results || [];
    } catch {
    }
    const instructorCount = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'instructor'").first().catch(() => ({ cnt: 0 }));
    const adminCount = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first().catch(() => ({ cnt: 0 }));
    return json(request, env, {
      success: true,
      data: {
        total_users: userCount?.cnt || 0,
        total_classes: classCount?.cnt || 0,
        total_enrollments: enrollmentCount?.cnt || 0,
        pending_inquiries: inquiryCount?.cnt || 0,
        total_revenue: totalRevenue?.total || 0,
        today_visitors: todayVisitors?.count || 0,
        instructor_count: instructorCount?.cnt || 0,
        admin_count: adminCount?.cnt || 0,
        chart: {
          labels: chartLabels,
          newUsers: chartNewUsers,
          revenue: chartRevenue,
          visitors: chartVisitors
        },
        recent_orders: recentOrders
      }
    });
  } catch (err) {
    return json(request, env, { success: false, error: "Failed to load admin stats", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestOptions3(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions3, "onRequestOptions");

// api/auth/check-username.js
async function onRequestGet2(context) {
  const { request, env } = context;
  try {
    await ensureAuthSchema(env.DB);
    const url = new URL(request.url);
    const username = (url.searchParams.get("username") || "").trim();
    if (username.length < 2) {
      return json(request, env, { success: false, error: "Username must be at least 2 characters." }, { status: 400 });
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    return json(request, env, {
      success: true,
      data: {
        available: !existing,
        message: existing ? "Username is already in use." : "Username is available."
      }
    });
  } catch (err) {
    console.error("Check-username error:", err);
    return json(request, env, { success: false, error: "Username check failed." }, { status: 500 });
  }
}
__name(onRequestGet2, "onRequestGet");
async function onRequestOptions4(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions4, "onRequestOptions");

// api/auth/login.js
async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const username = (body?.username || "").trim();
    const password = body?.password || "";
    if (!username || !password) {
      return json(request, env, { success: false, error: "Username and password are required." }, { status: 400 });
    }
    await ensureAuthSchema(env.DB);
    let user;
    if (username.includes("@")) {
      user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(username).first();
    } else {
      user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    }
    if (!user) {
      return json(request, env, { success: false, error: "Invalid account credentials." }, { status: 401 });
    }
    const inputHash = await hashPassword(password);
    if (inputHash !== user.password_hash) {
      return json(request, env, { success: false, error: "Invalid account credentials." }, { status: 401 });
    }
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime("now")').bind(user.id).run();
    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const sessionId = "sess_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, user.id, token, expiresAt).run();
    const { password_hash, ...safeUser } = user;
    return json(request, env, {
      success: true,
      data: { user: safeUser },
      token
    }, {
      headers: { "Set-Cookie": createSessionCookie(token, request) }
    });
  } catch (err) {
    console.error("Login error:", err);
    return json(request, env, { success: false, error: "Login failed." }, { status: 500 });
  }
}
__name(onRequestPost, "onRequestPost");
async function onRequestOptions5(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions5, "onRequestOptions");

// api/auth/register.js
async function onRequestPost2(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const email = (body?.email || "").trim().toLowerCase();
    const password = body?.password || "";
    const name = body?.name || null;
    const phone = body?.phone || null;
    const username = (body?.username || "").trim() || null;
    const birth_year = body?.birth_year || null;
    const birth_month = body?.birth_month || null;
    const birth_day = body?.birth_day || null;
    const gender = body?.gender || null;
    const nationality = body?.nationality || "local";
    const signup_path = body?.signup_path || null;
    if (!email || !password) {
      return json(request, env, { success: false, error: "Email and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return json(request, env, { success: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }
    await ensureAuthSchema(env.DB);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) {
      return json(request, env, { success: false, error: "Email already exists." }, { status: 409 });
    }
    if (username) {
      const existingUser = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
      if (existingUser) {
        return json(request, env, { success: false, error: "Username is already in use." }, { status: 409 });
      }
    }
    const password_hash = await hashPassword(password);
    const userId = "user_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    await env.DB.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, phone, username,
        birth_year, birth_month, birth_day, gender, nationality, signup_path, role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    `).bind(
      userId,
      email,
      password_hash,
      name,
      phone,
      username,
      birth_year,
      birth_month,
      birth_day,
      gender,
      nationality,
      signup_path
    ).run();
    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const sessionId = "sess_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, userId, token, expiresAt).run();
    return json(request, env, {
      success: true,
      data: { userId, email, name, username },
      token
    }, {
      status: 201,
      headers: { "Set-Cookie": createSessionCookie(token, request) }
    });
  } catch (err) {
    console.error("Register error:", err);
    return json(request, env, { success: false, error: "Registration failed.", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost2, "onRequestPost");
async function onRequestOptions6(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions6, "onRequestOptions");

// api/auth/reset-password-confirm.js
async function onRequestPost3(context) {
  const { request, env } = context;
  try {
    await ensureAuthSchema(env.DB);
    const body = await request.json();
    const token = (body?.token || "").trim();
    const password = body?.password || "";
    if (!token || password.length < 8) {
      return json(request, env, {
        success: false,
        error: "A valid token and a password of at least 8 characters are required."
      }, { status: 400 });
    }
    const tokenHash = await hashPassword(token);
    const resetRecord = await env.DB.prepare(`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ?
        AND used_at IS NULL
        AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(tokenHash).first();
    if (!resetRecord) {
      return json(request, env, { success: false, error: "Reset link is invalid or expired." }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(passwordHash, resetRecord.user_id),
      env.DB.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").bind(resetRecord.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(resetRecord.user_id)
    ]);
    return json(request, env, {
      success: true,
      message: "Password updated. Please log in again."
    });
  } catch (error) {
    console.error("Reset confirm error:", error);
    return json(request, env, {
      success: false,
      error: "Password reset failed.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequestPost3, "onRequestPost");
async function onRequestOptions7(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions7, "onRequestOptions");

// api/auth/reset-password-request.js
async function sendResetEmail(env, email, resetUrl) {
  if (!env.MAIL_FROM) return false;
  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: env.MAIL_FROM, name: "B-Square" },
      reply_to: env.MAIL_REPLY_TO ? { email: env.MAIL_REPLY_TO } : void 0,
      subject: "B-Square password reset",
      content: [{
        type: "text/html",
        value: `
          <p>Your B-Square password reset request was received.</p>
          <p>Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link is valid for 30 minutes.</p>
        `
      }]
    })
  });
  return response.ok;
}
__name(sendResetEmail, "sendResetEmail");
async function onRequestPost4(context) {
  const { request, env } = context;
  try {
    await ensureAuthSchema(env.DB);
    const body = await request.json();
    const email = (body?.email || "").trim().toLowerCase();
    if (!email) {
      return json(request, env, { success: false, error: "Email is required." }, { status: 400 });
    }
    const user = await env.DB.prepare("SELECT id, email FROM users WHERE lower(email) = ?").bind(email).first();
    if (user) {
      const rawToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const tokenHash = await hashPassword(rawToken);
      const tokenId = "prt_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1e3).toISOString();
      await env.DB.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).bind(tokenId, user.id, tokenHash, expiresAt).run();
      const appBaseUrl = env.APP_BASE_URL || new URL(request.url).origin;
      const resetUrl = `${appBaseUrl}/login/update_password.html?token=${encodeURIComponent(rawToken)}`;
      const emailSent = await sendResetEmail(env, user.email, resetUrl);
      const payload = {
        success: true,
        message: "If the email exists, a reset link has been sent."
      };
      if (!emailSent) {
        payload.message = "Email is not configured. Use the reset link below.";
        payload.debug_reset_url = resetUrl;
      }
      return json(request, env, payload);
    }
    return json(request, env, {
      success: true,
      message: "If the email exists, a reset link has been sent."
    });
  } catch (error) {
    console.error("Reset request error:", error);
    return json(request, env, {
      success: false,
      error: "Password reset request failed.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequestPost4, "onRequestPost");
async function onRequestOptions8(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions8, "onRequestOptions");

// api/auth/session.js
async function onRequestGet3(context) {
  const { request, env } = context;
  try {
    await ensureAuthSchema(env.DB);
    const token = getSessionToken(request);
    if (!token) {
      return json(request, env, { success: true, data: { session: null } });
    }
    const current = await getCurrentUser(context);
    if (!current) {
      return json(request, env, { success: true, data: { session: null } }, {
        headers: { "Set-Cookie": clearSessionCookie(request) }
      });
    }
    return json(request, env, {
      success: true,
      data: {
        session: {
          user: current.user,
          expires_at: current.session.expires_at
        }
      }
    });
  } catch (err) {
    console.error("Session check error:", err);
    return json(request, env, { success: false, error: "Session check failed." }, { status: 500 });
  }
}
__name(onRequestGet3, "onRequestGet");
async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    await ensureAuthSchema(env.DB);
    const token = getSessionToken(request);
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
    return json(request, env, { success: true, message: "Logged out." }, {
      headers: { "Set-Cookie": clearSessionCookie(request) }
    });
  } catch (err) {
    console.error("Logout error:", err);
    return json(request, env, { success: false, error: "Logout failed." }, { status: 500 });
  }
}
__name(onRequestDelete, "onRequestDelete");
async function onRequestOptions9(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions9, "onRequestOptions");

// api/classes/create.js
async function onRequestPost5(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureClassesSchema(env.DB);
    const body = await request.json();
    console.log("[API] Class Create Request keys:", Object.keys(body));
    if (!body.title) {
      return json(request, env, { success: false, error: "\uD544\uC218 \uD56D\uBAA9(\uC81C\uBAA9)\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." }, { status: 400 });
    }
    const classId = "cls_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const image_urls = JSON.stringify(body.image_urls || []);
    const curriculum = JSON.stringify(body.curriculum || []);
    const sub_instructors = JSON.stringify(body.sub_instructors || []);
    const target_audience = JSON.stringify(body.target_audience || []);
    const objectives = JSON.stringify(body.objectives || []);
    const keywords = Array.isArray(body.keywords) ? body.keywords.join(",") : body.keywords || "";
    const instructorName = body.instructor_info?.name || body.instructor_name || "";
    const instructorPhone = body.instructor_info?.phone || body.instructor_phone || "";
    const instructorEmail = body.instructor_info?.email || body.instructor_email || "";
    const bankName = body.bank_info?.name || body.payment_bank_name || "";
    const bankAccount = body.bank_info?.account || body.payment_bank_account || "";
    const bankHolder = body.bank_info?.holder || body.payment_bank_holder || "";
    const payCard = body.payment_methods?.card ? 1 : body.payment_card || 1;
    const payBank = body.payment_methods?.bank ? 1 : body.payment_bank_transfer || 0;
    const capacityMin = body.capacity_min || body.capacity?.min || 0;
    const capacityMax = body.capacity_max || body.capacity?.max || 0;
    await env.DB.prepare(`
      INSERT INTO classes (
        id, creator_id, creator_email, title, category, keywords, summary,
        description, description_text, price, discount_rate, coupon_pack,
        class_type, operating_mode, capacity_min, capacity_max,
        tickets_price_one_time, tickets_pass_count, tickets_price_multi, tickets_price_monthly,
        payment_card, payment_bank_transfer, payment_bank_name, payment_bank_account, payment_bank_holder,
        is_free, instructor_phone, instructor_name, instructor_email,
        image_url, image_urls, curriculum, sub_instructors, target_audience, objectives,
        coupon_detail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      classId,
      auth.user.id,
      auth.user.email || "",
      body.title,
      body.category || null,
      keywords,
      body.summary || null,
      body.description || null,
      body.description_text || null,
      body.price_one_time || body.price || 0,
      body.discount_rate || 0,
      body.coupon_pack ? 1 : 0,
      body.class_type || "ONLINE",
      body.operating_mode || "ONEDAY",
      capacityMin,
      capacityMax,
      body.price_one_time || null,
      body.pass_count || null,
      body.price_multi || null,
      body.price_monthly || null,
      payCard,
      payBank,
      bankName || null,
      bankAccount || null,
      bankHolder || null,
      body.is_free ? 1 : 0,
      instructorPhone || null,
      instructorName || null,
      instructorEmail || null,
      body.image_url || null,
      image_urls,
      curriculum,
      sub_instructors,
      target_audience,
      objectives,
      body.coupon_detail || null
    ).run();
    console.log(`[API] Class Created: ${classId}`);
    return json(request, env, { success: true, data: { id: classId } }, { status: 201 });
  } catch (err) {
    console.error("[API] Create class error:", err);
    return json(request, env, { success: false, error: "\uD074\uB798\uC2A4 \uC0DD\uC131 \uC911 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost5, "onRequestPost");
async function onRequestOptions10(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions10, "onRequestOptions");

// api/classes/members.js
async function onRequestGet4(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const classId = url.searchParams.get("class_id");
  const view = url.searchParams.get("view") || "student";
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (!classId) {
    return new Response(JSON.stringify({ success: false, error: "class_id is required" }), { status: 400, headers: cors });
  }
  try {
    let classInfo = null;
    try {
      classInfo = await env.DB.prepare(
        "SELECT * FROM classes WHERE id = ?"
      ).bind(classId).first();
    } catch (e) {
      console.warn("[Members API] classes query failed:", e.message);
    }
    if (!classInfo) {
      return new Response(JSON.stringify({ success: false, error: "\uD074\uB798\uC2A4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }), { status: 404, headers: cors });
    }
    let enrollments = [];
    try {
      const enrollResult = await env.DB.prepare(`
                SELECT 
                    e.user_id,
                    e.status,
                    e.created_at as enrolled_at,
                    u.name,
                    u.email,
                    u.phone,
                    u.profile_image_url,
                    u.nickname
                FROM enrollments e
                LEFT JOIN users u ON e.user_id = u.id
                WHERE e.class_id = ?
                ORDER BY e.created_at DESC
            `).bind(classId).all();
      enrollments = enrollResult.results || [];
    } catch (e) {
      console.warn("[Members API] enrollments query failed:", e.message);
    }
    let passes = [];
    try {
      const passResult = await env.DB.prepare(`
                SELECT * FROM user_passes WHERE class_id = ?
            `).bind(classId).all();
      passes = passResult.results || [];
    } catch (e) {
      console.warn("[Members API] user_passes query failed:", e.message);
    }
    const passMap = {};
    let totalIssued = 0;
    let totalUsed = 0;
    passes.forEach((p) => {
      const remaining = p.remaining_count ?? p.count ?? p.remaining ?? 0;
      const total = p.total_count ?? p.total ?? remaining;
      passMap[p.user_id] = { remaining_count: remaining, total_count: total };
      totalIssued += total;
      totalUsed += total - remaining;
    });
    let instructor = null;
    try {
      if (classInfo.creator_id) {
        instructor = await env.DB.prepare(
          "SELECT * FROM users WHERE id = ?"
        ).bind(classInfo.creator_id).first();
      }
    } catch (e) {
      console.warn("[Members API] instructor query failed:", e.message);
    }
    const members = enrollments.map((e) => {
      const passInfo = passMap[e.user_id] || {};
      const isCreator = e.user_id === classInfo.creator_id;
      if (view === "instructor") {
        return {
          user_id: e.user_id,
          nickname: e.nickname || e.name || "\uC0AC\uC6A9\uC790",
          name: e.name || "",
          phone: e.phone || "",
          email: e.email || "",
          profile_image_url: e.profile_image_url || "",
          remaining_passes: passInfo.remaining_count || 0,
          total_passes: passInfo.total_count || 0,
          role: isCreator ? "instructor" : "student",
          enrolled_at: e.enrolled_at,
          status: e.status
        };
      } else {
        return {
          user_id: e.user_id,
          nickname: e.nickname || e.name || "\uC0AC\uC6A9\uC790",
          profile_image_url: e.profile_image_url || "",
          role: isCreator ? "instructor" : "student"
        };
      }
    });
    const instructorInList = members.find((m) => m.user_id === classInfo.creator_id);
    if (!instructorInList && instructor) {
      const instrPassInfo = passMap[instructor.id] || {};
      const instrData = view === "instructor" ? {
        user_id: instructor.id,
        nickname: instructor.nickname || instructor.name || "\uAC15\uC0AC",
        name: instructor.name || "",
        phone: instructor.phone || "",
        email: instructor.email || "",
        profile_image_url: instructor.profile_image_url || "",
        remaining_passes: instrPassInfo.remaining_count || 0,
        total_passes: instrPassInfo.total_count || 0,
        role: "instructor",
        enrolled_at: null,
        status: "active"
      } : {
        user_id: instructor.id,
        nickname: instructor.nickname || instructor.name || "\uAC15\uC0AC",
        profile_image_url: instructor.profile_image_url || "",
        role: "instructor"
      };
      members.unshift(instrData);
    }
    return new Response(JSON.stringify({
      success: true,
      data: {
        class_info: {
          id: classInfo.id,
          title: classInfo.title,
          category: classInfo.category,
          image_url: classInfo.image_url,
          instructor_id: classInfo.creator_id
        },
        members,
        total_members: members.length,
        pass_stats: {
          total_issued: totalIssued,
          total_used: totalUsed
        }
      }
    }), { headers: cors });
  } catch (err) {
    console.error("[D1 API] Members Error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: "\uBA64\uBC84 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328",
      detail: err.message
    }), { status: 500, headers: cors });
  }
}
__name(onRequestGet4, "onRequestGet");
async function onRequestOptions11() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(onRequestOptions11, "onRequestOptions");

// api/classes/update.js
async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { class_id, updates } = body || {};
    if (!class_id || !updates) {
      return json(request, env, {
        success: false,
        error: "class_id and updates are required."
      }, { status: 400 });
    }
    await ensureClassesSchema(env.DB);
    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;
    const updateKeys = [];
    const updateValues = [];
    const allowedFields = [
      "title",
      "category",
      "class_type",
      "operating_mode",
      "summary",
      "description",
      "description_text",
      "price",
      "discount_rate",
      "image_url",
      "is_free",
      "coupon_pack",
      "coupon_detail",
      "capacity_min",
      "capacity_max",
      "tickets_price_one_time",
      "tickets_pass_count",
      "tickets_price_multi",
      "tickets_price_monthly",
      "payment_card",
      "payment_bank_transfer",
      "payment_bank_name",
      "payment_bank_account",
      "payment_bank_holder",
      "instructor_phone",
      "instructor_name",
      "instructor_email"
    ];
    for (const field of allowedFields) {
      if (updates[field] !== void 0) {
        updateKeys.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    }
    const jsonFields = ["keywords", "target_audience", "objectives", "curriculum", "image_urls", "sub_instructors"];
    for (const field of jsonFields) {
      if (updates[field] !== void 0) {
        updateKeys.push(`${field} = ?`);
        const val = updates[field];
        updateValues.push(Array.isArray(val) ? JSON.stringify(val) : JSON.stringify(val ?? []));
      }
    }
    if (updateKeys.length === 0) {
      return json(request, env, {
        success: false,
        error: "No update fields were provided."
      }, { status: 400 });
    }
    updateKeys.push("updated_at = datetime('now')");
    updateValues.push(class_id);
    const sql = `UPDATE classes SET ${updateKeys.join(", ")} WHERE id = ?`;
    try {
      await env.DB.prepare(sql).bind(...updateValues).run();
    } catch (updateErr) {
      if (/no such column: updated_at|no column named updated_at/i.test(updateErr.message)) {
        const fallbackSql = `UPDATE classes SET ${updateKeys.filter((item) => item !== "updated_at = datetime('now')").join(", ")} WHERE id = ?`;
        await env.DB.prepare(fallbackSql).bind(...updateValues).run();
      } else {
        throw updateErr;
      }
    }
    return json(request, env, {
      success: true,
      message: "Class updated successfully."
    });
  } catch (err) {
    console.error("Update class error:", err);
    return json(request, env, {
      success: false,
      error: "Class update failed.",
      detail: err.message
    }, { status: 500 });
  }
}
__name(onRequestPut, "onRequestPut");
async function onRequestOptions12(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions12, "onRequestOptions");

// api/passes/issue.js
async function onRequestPost6(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { class_id, user_id, amount, reason } = body;
    if (!class_id || !user_id || !amount) {
      return json(request, env, { success: false, error: "class_id, user_id, amount \uD544\uC218" }, { status: 400 });
    }
    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;
    try {
      const existing = await env.DB.prepare(`
        SELECT * FROM user_passes WHERE user_id = ? AND class_id = ?
      `).bind(user_id, class_id).first();
      if (existing) {
        const newRemaining = (existing.remaining_count ?? existing.remaining_passes ?? existing.remaining ?? 0) + amount;
        const newTotal = (existing.total_count ?? existing.total_passes ?? existing.total ?? 0) + amount;
        await env.DB.prepare(`
          UPDATE user_passes SET remaining_count = ?, total_count = ?, updated_at = datetime('now')
          WHERE user_id = ? AND class_id = ?
        `).bind(newRemaining, newTotal, user_id, class_id).run();
      } else {
        const passId = "pass_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT INTO user_passes (id, user_id, class_id, pass_type, remaining_count, total_count, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `).bind(passId, user_id, class_id, "count", amount, amount).run();
      }
    } catch (e) {
      console.warn("[Pass Issue] canonical upsert failed, trying legacy columns:", e.message);
      try {
        const passId = "pass_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.prepare(`
          INSERT OR REPLACE INTO user_passes (id, user_id, class_id, remaining, total, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        `).bind(passId, user_id, class_id, amount, amount).run();
      } catch (e2) {
        console.error("[Pass Issue] All insert attempts failed:", e2.message);
      }
    }
    const logReason = reason || "manual";
    try {
      await env.DB.prepare(`
        INSERT INTO pass_issue_logs (class_id, user_id, amount, reason, issued_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(class_id, user_id, amount, logReason, auth.user.id).run();
    } catch (e) {
      console.warn("[Pass Issue] Log insert failed:", e.message);
    }
    return json(request, env, {
      success: true,
      message: `\uC218\uAC15\uAD8C ${amount}\uAC1C\uAC00 \uBC1C\uD589\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
      data: { class_id, user_id, amount, reason: logReason }
    });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC218\uAC15\uAD8C \uBC1C\uD589 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost6, "onRequestPost");
async function onRequestGet5(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  if (!class_id) {
    return json(request, env, { success: false, error: "class_id \uD544\uC218" }, { status: 400 });
  }
  try {
    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;
    const { results } = await env.DB.prepare(`
      SELECT * FROM pass_issue_logs WHERE class_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(class_id).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "\uB85C\uADF8 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet5, "onRequestGet");
async function onRequestOptions13(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions13, "onRequestOptions");

// api/user-passes/use.js
function pickRemaining(row) {
  return row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0;
}
__name(pickRemaining, "pickRemaining");
function pickTotal(row) {
  return row.total_count ?? row.total_passes ?? row.total ?? pickRemaining(row);
}
__name(pickTotal, "pickTotal");
async function onRequestPost7(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const classId = body.class_id;
    if (!classId) {
      return json(request, env, { success: false, error: "class_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
    }
    const pass = await env.DB.prepare(`
      SELECT *
      FROM user_passes
      WHERE user_id = ? AND class_id = ? AND status = 'active'
      LIMIT 1
    `).bind(auth.user.id, classId).first();
    if (!pass) {
      return json(request, env, { success: false, error: "\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uC218\uAC15\uAD8C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
    }
    const remaining = pickRemaining(pass);
    if (remaining <= 0) {
      return json(request, env, { success: false, error: "\uB0A8\uC740 \uC218\uAC15\uAD8C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 409 });
    }
    const nextRemaining = remaining - 1;
    const total = pickTotal(pass);
    await env.DB.prepare(`
      UPDATE user_passes
      SET remaining_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextRemaining, pass.id).run().catch(async () => {
      await env.DB.prepare(`
        UPDATE user_passes
        SET remaining_passes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(nextRemaining, pass.id).run().catch(async () => {
        await env.DB.prepare(`
          UPDATE user_passes
          SET remaining = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(nextRemaining, pass.id).run();
      });
    });
    return json(request, env, {
      success: true,
      data: {
        class_id: classId,
        user_id: auth.user.id,
        remaining_count: nextRemaining,
        total_count: total
      },
      message: "\uC218\uAC15\uAD8C 1\uD68C\uAC00 \uCC28\uAC10\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
    });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: "\uC218\uAC15\uAD8C \uC0AC\uC6A9 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequestPost7, "onRequestPost");
async function onRequestOptions14(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions14, "onRequestOptions");

// api/users/search.js
async function onRequestGet6(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  if (query.length < 2) {
    return json(request, env, { success: true, data: [] });
  }
  try {
    const sql = `
      SELECT id, name, username, email, profile_image_url 
      FROM users 
      WHERE id != ?
        AND (name LIKE ? OR username LIKE ? OR email LIKE ?)
      LIMIT 20
    `;
    const searchTerm = `%${query}%`;
    const { results } = await db.prepare(sql).bind(auth.user.id, searchTerm, searchTerm, searchTerm).all();
    return json(request, env, { success: true, data: results });
  } catch (error) {
    console.error("[API /users/search GET] Error:", error);
    return json(request, env, { success: false, error: "\uAC80\uC0C9 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, { status: 500 });
  }
}
__name(onRequestGet6, "onRequestGet");
async function onRequestOptions15(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions15, "onRequestOptions");

// api/admin/class-analytics.js
async function onRequest3(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  if (method !== "GET") return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "ranking";
  const top = parseInt(url.searchParams.get("top")) || 10;
  const classId = url.searchParams.get("classId") || "";
  try {
    await ensureClassesSchema(db);
    await ensureGatheringsSchema(db);
    await ensureOperationsSchema(db);
    if (type === "ranking") {
      const { results } = await db.prepare(`
        SELECT
          c.id, c.title, c.category, c.thumbnail, c.price, c.instructor_name, c.created_at,
          c.current_participants,
          COALESCE(cs.total_visits, 0) as visits,
          COALESCE(cs.total_enrollments, 0) as enrollments,
          COALESCE(cs.total_revenue, 0) as revenue,
          COALESCE(cs.avg_rating, 0) as avg_rating,
          COALESCE(cs.review_count, 0) as review_count,
          COALESCE(cs.bookmark_count, 0) as bookmarks,
          COALESCE(cs.total_passes_issued, 0) as passes_issued,
          COALESCE(cs.total_passes_used, 0) as passes_used,
          COALESCE(cs.total_gatherings, 0) as gatherings
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        ORDER BY COALESCE(cs.total_enrollments, c.current_participants, 0) DESC
        LIMIT ?
      `).bind(top).all();
      return json(request, env, {
        success: true,
        data: results || [],
        top
      });
    }
    if (type === "category") {
      const { results } = await db.prepare(`
        SELECT
          COALESCE(c.category, '\u8A98\uBA83\uD147\u745C?) as category,
          COUNT(*) as class_count,
          COALESCE(SUM(cs.total_visits), 0) as total_visits,
          COALESCE(SUM(cs.total_enrollments), SUM(c.current_participants), 0) as total_enrollments,
          COALESCE(SUM(cs.total_revenue), 0) as total_revenue
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        GROUP BY COALESCE(c.category, '\u8A98\uBA83\uD147\u745C?)
        ORDER BY total_enrollments DESC
      `).all();
      return json(request, env, { success: true, data: results || [] });
    }
    if (type === "detail" && classId) {
      const cls = await db.prepare(`
        SELECT c.*, cs.*
        FROM classes c
        LEFT JOIN class_stats cs ON c.id = cs.class_id
        WHERE c.id = ?
      `).bind(classId).first();
      let instructor = null;
      if (cls?.creator_id) {
        instructor = await db.prepare("SELECT id, name, email, phone, profile_image_url, role FROM users WHERE id = ?").bind(cls.creator_id).first();
      }
      const { results: orders } = await db.prepare("SELECT * FROM orders WHERE class_id = ? ORDER BY created_at DESC LIMIT 10").bind(classId).all().catch(() => ({ results: [] }));
      const { results: participants } = await db.prepare(`
        SELECT cp.*, u.name, u.email, u.phone, u.profile_image_url
        FROM class_participants cp
        LEFT JOIN users u ON cp.user_id = u.id
        WHERE cp.class_id = ?
      `).bind(classId).all().catch(() => ({ results: [] }));
      const { results: gatherings } = await db.prepare("SELECT * FROM class_gatherings WHERE class_id = ? ORDER BY gathering_at DESC").bind(classId).all().catch(() => ({ results: [] }));
      return json(request, env, {
        success: true,
        data: {
          class: cls,
          instructor,
          recent_orders: orders || [],
          participants: participants || [],
          gatherings: gatherings || []
        }
      });
    }
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as total_classes,
        COALESCE(SUM(current_participants), 0) as total_students,
        COUNT(CASE WHEN is_approved = 1 THEN 1 END) as active_classes,
        COUNT(CASE WHEN is_free = 1 THEN 1 END) as free_classes
      FROM classes
    `).first();
    const instructors = await db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.profile_image_url, COUNT(c.id) as class_count
      FROM users u
      LEFT JOIN classes c ON u.id = c.creator_id
      WHERE u.role = 'instructor'
      GROUP BY u.id
      ORDER BY class_count DESC
    `).all().catch(() => ({ results: [] }));
    return json(request, env, {
      success: true,
      data: {
        summary: summary || {},
        instructors: instructors?.results || []
      }
    });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequest3, "onRequest");

// api/admin/coupons.js
function generateCouponCode() {
  return `BSQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
__name(generateCouponCode, "generateCouponCode");
async function ensureCouponSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS global_coupons (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'percent',
      amount INTEGER DEFAULT 0,
      min_order_amount INTEGER DEFAULT 0,
      max_issue_count INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      starts_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id TEXT PRIMARY KEY,
      coupon_code TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      order_id TEXT,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  const addColumnIfMissing2 = /* @__PURE__ */ __name(async (table, definition) => {
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error.message || "")) {
        throw error;
      }
    }
  }, "addColumnIfMissing");
  await addColumnIfMissing2("global_coupons", "description TEXT");
  await addColumnIfMissing2("global_coupons", "type TEXT DEFAULT 'percent'");
  await addColumnIfMissing2("global_coupons", "amount INTEGER DEFAULT 0");
  await addColumnIfMissing2("global_coupons", "min_order_amount INTEGER DEFAULT 0");
  await addColumnIfMissing2("global_coupons", "max_issue_count INTEGER DEFAULT 0");
  await addColumnIfMissing2("global_coupons", "used_count INTEGER DEFAULT 0");
  await addColumnIfMissing2("global_coupons", "is_active INTEGER DEFAULT 1");
  await addColumnIfMissing2("global_coupons", "starts_at DATETIME");
  await addColumnIfMissing2("global_coupons", "expires_at DATETIME");
  await addColumnIfMissing2("global_coupons", "created_at DATETIME");
  await addColumnIfMissing2("coupon_usage", "coupon_code TEXT");
  await addColumnIfMissing2("coupon_usage", "user_id TEXT");
  await addColumnIfMissing2("coupon_usage", "user_name TEXT");
  await addColumnIfMissing2("coupon_usage", "order_id TEXT");
  await addColumnIfMissing2("coupon_usage", "used_at DATETIME");
}
__name(ensureCouponSchema, "ensureCouponSchema");
async function listCoupons(db) {
  const { results } = await db.prepare("SELECT * FROM global_coupons ORDER BY created_at DESC").all();
  const enhanced = await Promise.all((results || []).map(async (coupon) => {
    const usage = await db.prepare(
      "SELECT COUNT(*) AS cnt FROM coupon_usage WHERE coupon_code = ?"
    ).bind(coupon.code).first().catch(() => ({ cnt: 0 }));
    return {
      ...coupon,
      actual_used: usage?.cnt || 0
    };
  }));
  return enhanced;
}
__name(listCoupons, "listCoupons");
async function onRequest4(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  await ensureCouponSchema(db);
  if (method === "GET") {
    try {
      const coupons = await listCoupons(db);
      return json(request, env, { success: true, data: coupons });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "POST") {
    try {
      const body = await request.json();
      if (body?.action === "validate") {
        const coupon = await db.prepare("SELECT * FROM global_coupons WHERE code = ?").bind(body.code).first();
        if (!coupon) return json(request, env, { success: false, error: "Coupon not found." });
        if (!coupon.is_active) return json(request, env, { success: false, error: "Coupon is inactive." });
        if (coupon.expires_at && new Date(coupon.expires_at) < /* @__PURE__ */ new Date()) {
          return json(request, env, { success: false, error: "Coupon has expired." });
        }
        if ((coupon.max_issue_count || 0) > 0 && (coupon.used_count || 0) >= coupon.max_issue_count) {
          return json(request, env, { success: false, error: "Coupon usage limit reached." });
        }
        if (body.user_id) {
          const already = await db.prepare(
            "SELECT 1 FROM coupon_usage WHERE coupon_code = ? AND user_id = ?"
          ).bind(body.code, body.user_id).first();
          if (already) {
            return json(request, env, { success: false, error: "Coupon already used by this user." });
          }
        }
        return json(request, env, {
          success: true,
          coupon: {
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            amount: coupon.amount,
            min_order_amount: coupon.min_order_amount
          }
        });
      }
      if (body?.action === "use") {
        if (!body.code) {
          return json(request, env, { success: false, error: "code is required." }, { status: 400 });
        }
        const usageId = `cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.prepare(`
          INSERT INTO coupon_usage (id, coupon_code, user_id, user_name, order_id, used_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(usageId, body.code, body.user_id || null, body.user_name || "", body.order_id || null).run();
        await db.prepare("UPDATE global_coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE code = ?").bind(body.code).run();
        return json(request, env, { success: true });
      }
      const code = (body.code || generateCouponCode()).toUpperCase();
      if (!body.name) {
        return json(request, env, { success: false, error: "name is required." }, { status: 400 });
      }
      await db.prepare(`
        INSERT INTO global_coupons (
          code, name, description, type, amount, min_order_amount,
          max_issue_count, used_count, is_active, starts_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, datetime('now'))
      `).bind(
        code,
        body.name,
        body.description || "",
        body.type || "percent",
        parseInt(body.amount, 10) || 0,
        parseInt(body.min_order_amount, 10) || 0,
        parseInt(body.max_issue_count, 10) || 0,
        body.starts_at || null,
        body.expires_at || null
      ).run();
      return json(request, env, { success: true, code });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "DELETE") {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (!code) {
        return json(request, env, { success: false, error: "code required" }, { status: 400 });
      }
      await db.prepare("DELETE FROM global_coupons WHERE code = ?").bind(code).run();
      await db.prepare("DELETE FROM coupon_usage WHERE coupon_code = ?").bind(code).run();
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest4, "onRequest");

// api/admin/financial.js
async function onRequest5(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  if (method !== "GET") return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
  try {
    await ensureOperationsSchema(db);
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit")) || 100, 500);
    let sql = "SELECT * FROM financial_records WHERE 1=1";
    const params = [];
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    if (from) {
      sql += " AND date(created_at) >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND date(created_at) <= ?";
      params.push(to);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    const { results } = await db.prepare(sql).bind(...params).all();
    const incomeTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'income'").first().catch(() => ({ total: 0 }));
    const refundTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'refund'").first().catch(() => ({ total: 0 }));
    const settlementTotal = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_records WHERE type = 'settlement'").first().catch(() => ({ total: 0 }));
    const summary = {
      total_income: incomeTotal?.total || 0,
      total_refund: refundTotal?.total || 0,
      total_settlement: settlementTotal?.total || 0
    };
    summary.net = summary.total_income - summary.total_refund - summary.total_settlement;
    summary.target_income = summary.total_income;
    summary.target_refund = summary.total_refund;
    summary.target_settlement = summary.total_settlement;
    summary.target_net = summary.net;
    return json(request, env, {
      success: true,
      data: results || [],
      records: results || [],
      summary
    });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequest5, "onRequest");

// api/admin/menus.js
async function ensureMenuSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS menu_settings (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      target TEXT DEFAULT '_self',
      visible INTEGER DEFAULT 1,
      audience TEXT DEFAULT 'all',
      sort_order INTEGER DEFAULT 0
    )
  `).run();
}
__name(ensureMenuSchema, "ensureMenuSchema");
var DEFAULT_MENUS = [
  { id: "menu_home", label: "\uD648", href: "/", sort_order: 0 },
  { id: "menu_class", label: "\uD074\uB798\uC2A4", href: "/programs", sort_order: 1 },
  { id: "menu_notice", label: "\uACF5\uC9C0 / FAQ", href: "/notice", sort_order: 2 }
];
async function onRequest6(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  await ensureMenuSchema(db);
  if (method === "GET") {
    try {
      const { results } = await db.prepare("SELECT * FROM menu_settings ORDER BY sort_order ASC").all();
      if (!results || results.length === 0) {
        for (const menu of DEFAULT_MENUS) {
          await db.prepare(`
            INSERT OR IGNORE INTO menu_settings (id, label, href, target, visible, audience, sort_order)
            VALUES (?, ?, ?, '_self', 1, 'all', ?)
          `).bind(menu.id, menu.label, menu.href, menu.sort_order).run();
        }
        return json(request, env, { success: true, data: DEFAULT_MENUS });
      }
      return json(request, env, { success: true, data: results });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "PUT") {
    try {
      const body = await request.json();
      const menus = Array.isArray(body) ? body : body?.menus || [];
      await db.prepare("DELETE FROM menu_settings").run();
      for (let i = 0; i < menus.length; i += 1) {
        const menu = menus[i] || {};
        const id = menu.id || `menu_${Date.now()}_${i}`;
        await db.prepare(`
          INSERT INTO menu_settings (id, label, href, target, visible, audience, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          menu.label || "",
          menu.href || "#",
          menu.target || "_self",
          menu.visible === false ? 0 : 1,
          menu.audience || "all",
          Number.isFinite(Number(menu.sort_order)) ? Number(menu.sort_order) : i
        ).run();
      }
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest6, "onRequest");

// api/admin/operators.js
var MAX_LIMIT = 500;
var ALLOWED_ROLES = /* @__PURE__ */ new Set(["user", "instructor", "operator", "admin"]);
function parseSubInstructors(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return item.id || item.user_id || item.userId || null;
      return null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}
__name(parseSubInstructors, "parseSubInstructors");
function buildBirthDate(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join("-") : "";
}
__name(buildBirthDate, "buildBirthDate");
function buildClassSummary(userId, classes) {
  const mainClasses = [];
  const subClasses = [];
  for (const cls of classes) {
    if (cls.creator_id === userId) {
      mainClasses.push({
        id: cls.id,
        title: cls.title || "-",
        category: cls.category || ""
      });
      continue;
    }
    if (cls.sub_instructor_ids.includes(userId)) {
      subClasses.push({
        id: cls.id,
        title: cls.title || "-",
        category: cls.category || ""
      });
    }
  }
  return {
    main_classes: mainClasses,
    sub_classes: subClasses,
    class_count: mainClasses.length + subClasses.length,
    main_class_count: mainClasses.length,
    sub_class_count: subClasses.length
  };
}
__name(buildClassSummary, "buildClassSummary");
function enrichUser(user, classes) {
  const classSummary = buildClassSummary(user.id, classes);
  const role = user.role || "user";
  return {
    ...user,
    role,
    role_label: getRoleLabel(role),
    role_rank: getRoleRank(role),
    is_operator: isAtLeastRole(role, "operator"),
    is_instructor: role === "instructor",
    birthdate: buildBirthDate(user),
    signup_date: user.created_at || "",
    operator_seq: user.operator_seq || null,
    ...classSummary
  };
}
__name(enrichUser, "enrichUser");
async function loadOperators(db, filters = {}) {
  const params = [];
  let where = "WHERE 1=1";
  if (filters.search) {
    where += " AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }
  if (filters.role) {
    where += " AND u.role = ?";
    params.push(filters.role);
  }
  const limit = Math.max(1, Math.min(Number(filters.limit) || MAX_LIMIT, MAX_LIMIT));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const { results: users } = await db.prepare(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.username,
      u.phone,
      u.profile_image_url,
      u.role,
      u.operator_seq,
      u.membership_level,
      u.birth_year,
      u.birth_month,
      u.birth_day,
      u.created_at,
      u.updated_at,
      u.role_updated_by,
      u.role_updated_at
    FROM users u
    ${where}
    ORDER BY datetime(COALESCE(u.role_updated_at, u.created_at)) DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const { results: classes } = await db.prepare(`
    SELECT id, title, category, creator_id, sub_instructors
    FROM classes
  `).all();
  const normalizedClasses = (classes || []).map((cls) => ({
    ...cls,
    sub_instructor_ids: parseSubInstructors(cls.sub_instructors)
  }));
  const items = (users || []).map((user) => enrichUser(applyMasterAdminOverride(user), normalizedClasses));
  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    if (item.role === "instructor") acc.instructor += 1;
    else if (item.role === "operator") acc.operator += 1;
    else if (item.role === "admin" || item.role === "super_admin") acc.superAdmin += 1;
    else acc.user += 1;
    return acc;
  }, {
    total: 0,
    superAdmin: 0,
    operator: 0,
    instructor: 0,
    user: 0
  });
  return { items, summary };
}
__name(loadOperators, "loadOperators");
function canAssignRoleByCaller(callerRole, targetRole) {
  const callerRank = getRoleRank(callerRole);
  const targetRank = getRoleRank(targetRole);
  if (callerRank >= getRoleRank("admin")) {
    return targetRank <= getRoleRank("admin");
  }
  if (callerRank >= getRoleRank("operator")) {
    return targetRank <= getRoleRank("instructor");
  }
  return false;
}
__name(canAssignRoleByCaller, "canAssignRoleByCaller");
async function onRequest7(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  await ensureAuthSchema(db);
  await ensureClassesSchema(db);
  if (method === "GET") {
    try {
      const url = new URL(request.url);
      const search = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim();
      const role = (url.searchParams.get("role") || "").trim();
      const limit = url.searchParams.get("limit") || MAX_LIMIT;
      const offset = url.searchParams.get("offset") || 0;
      const { items, summary } = await loadOperators(db, {
        search,
        role: role && role !== "all" ? role : "",
        limit,
        offset
      });
      return json(request, env, {
        success: true,
        data: items,
        summary
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "PUT") {
    try {
      const body = await request.json();
      const userIds = Array.isArray(body.user_ids) && body.user_ids.length ? body.user_ids : [body.user_id || body.id].filter(Boolean);
      const nextRole = String(body.role || "").trim();
      const reason = String(body.reason || "").trim() || null;
      if (!userIds.length) {
        return json(request, env, { success: false, error: "user_id is required" }, { status: 400 });
      }
      if (!ALLOWED_ROLES.has(nextRole)) {
        return json(request, env, { success: false, error: "Invalid role" }, { status: 400 });
      }
      if (!canAssignRoleByCaller(auth.user.role, nextRole)) {
        return json(request, env, { success: false, error: "\uD574\uB2F9 \uAD8C\uD55C\uC73C\uB85C\uB294 \uC774 \uC5ED\uD560\uC744 \uBD80\uC5EC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      const changed = [];
      for (const userId of userIds) {
        const currentUser = applyMasterAdminOverride(await db.prepare("SELECT id, role, operator_seq FROM users WHERE id = ?").bind(userId).first());
        if (!currentUser) continue;
        if (isMasterAdminUserId(userId) && nextRole !== "super_admin") {
          return json(request, env, { success: false, error: "\uCD1D\uAD04 \uC6B4\uC601\uC790 \uACC4\uC815\uC740 \uD558\uC704 \uAD8C\uD55C\uC73C\uB85C \uBCC0\uACBD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
        }
        if (currentUser.role === nextRole) {
          changed.push(currentUser);
          continue;
        }
        let operatorSeq = currentUser.operator_seq || null;
        if (nextRole === "operator" || nextRole === "admin") {
          if (!operatorSeq) {
            const seqRow = await db.prepare("SELECT COALESCE(MAX(operator_seq), 0) AS max_seq FROM users WHERE operator_seq IS NOT NULL").first().catch(() => ({ max_seq: 0 }));
            operatorSeq = Number(seqRow?.max_seq || 0) + 1;
          }
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await db.prepare(`
          UPDATE users
          SET role = ?, operator_seq = ?, role_updated_by = ?, role_updated_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(nextRole, operatorSeq, auth.user.id, now, userId).run();
        await db.prepare(`
          INSERT INTO user_role_logs (id, user_id, previous_role, new_role, changed_by, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          currentUser.role || "user",
          nextRole,
          auth.user.id,
          reason
        ).run();
        const updatedUser = await db.prepare(`
          SELECT
            id, email, name, username, phone, profile_image_url, role, membership_level,
            birth_year, birth_month, birth_day, operator_seq, created_at, updated_at,
            role_updated_by, role_updated_at
          FROM users
          WHERE id = ?
        `).bind(userId).first();
        if (updatedUser) changed.push(updatedUser);
      }
      const { items } = await loadOperators(db, { search: "", role: "", limit: MAX_LIMIT, offset: 0 });
      const finalItems = userIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
      return json(request, env, {
        success: true,
        data: finalItems.length <= 1 ? finalItems[0] || null : finalItems,
        changed_count: changed.length
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest7, "onRequest");

// api/admin/orders.js
function generateOrderId() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BSQ${y}${m}${d}${h}${mi}-${rand}`;
}
__name(generateOrderId, "generateOrderId");
async function ensureOrderSupportSchema(db) {
  await ensureOperationsSchema(db);
}
__name(ensureOrderSupportSchema, "ensureOrderSupportSchema");
async function onRequest8(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  if (method === "OPTIONS") return options(request, env);
  await ensureOrderSupportSchema(db);
  if (method === "GET") {
    try {
      const url = new URL(request.url);
      const search = url.searchParams.get("search") || url.searchParams.get("q") || "";
      const status = url.searchParams.get("status") || "";
      const from = url.searchParams.get("from") || url.searchParams.get("start") || "";
      const to = url.searchParams.get("to") || url.searchParams.get("end") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 500);
      const offset = parseInt(url.searchParams.get("offset")) || 0;
      let sql = "SELECT * FROM orders WHERE 1=1";
      const params = [];
      if (search) {
        sql += " AND (order_id LIKE ? OR user_name LIKE ? OR class_title LIKE ? OR user_email LIKE ?)";
        const s = `%${search}%`;
        params.push(s, s, s, s);
      }
      if (status) {
        sql += " AND status = ?";
        params.push(status);
      }
      if (from) {
        sql += " AND date(created_at) >= ?";
        params.push(from);
      }
      if (to) {
        sql += " AND date(created_at) <= ?";
        params.push(to);
      }
      const countSql = sql.replace("SELECT *", "SELECT COUNT(*) AS cnt");
      const countResult = await db.prepare(countSql).bind(...params).first().catch(() => ({ cnt: 0 }));
      sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const { results } = await db.prepare(sql).bind(...params).all();
      return json(request, env, {
        success: true,
        data: results || [],
        total: countResult?.cnt || 0
      });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "POST") {
    try {
      const body = await request.json();
      const orderId = generateOrderId();
      const amount = Number(body.amount) || 0;
      const discountAmount = Number(body.discount_amount) || 0;
      const finalAmount = amount - discountAmount;
      const status = body.status || "paid";
      await db.prepare(`
        INSERT INTO orders (
          order_id, user_id, user_name, user_email, class_id, class_title,
          order_type, amount, discount_amount, final_amount, coupon_code,
          pay_method, card_name, status, merchant_uid, receipt_url, memo,
          created_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).bind(
        orderId,
        body.user_id || null,
        body.user_name || "",
        body.user_email || "",
        body.class_id || null,
        body.class_title || "",
        body.order_type || "class_pass",
        amount,
        discountAmount,
        finalAmount,
        body.coupon_code || null,
        body.pay_method || "",
        body.card_name || "",
        status,
        body.merchant_uid || "",
        body.receipt_url || "",
        body.memo || "",
        status === "paid" ? (/* @__PURE__ */ new Date()).toISOString() : null
      ).run();
      if (status === "paid" && finalAmount > 0) {
        const fId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
          VALUES (?, 'income', ?, ?, ?, datetime('now'))
        `).bind(fId, finalAmount, `Order ${orderId} payment`, orderId).run();
      }
      return json(request, env, { success: true, order_id: orderId });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "PUT") {
    try {
      const body = await request.json();
      if (!body.order_id) throw new Error("order_id required");
      const requestedStatus = body.status || (body.action === "refund" ? "refunded" : "");
      const updates = [];
      const params = [];
      if (requestedStatus) {
        updates.push("status = ?");
        params.push(requestedStatus);
      }
      if (requestedStatus === "refunded") {
        updates.push("refunded_at = datetime('now')");
      }
      if (body.memo !== void 0) {
        updates.push("memo = ?");
        params.push(body.memo);
      }
      if (updates.length === 0) throw new Error("No updates");
      params.push(body.order_id);
      await db.prepare(`UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`).bind(...params).run();
      if (requestedStatus === "refunded") {
        const order = await db.prepare("SELECT * FROM orders WHERE order_id = ?").bind(body.order_id).first();
        if (order) {
          const fId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
          await db.prepare(`
            INSERT INTO financial_records (id, type, amount, description, related_order_id, created_at)
            VALUES (?, 'refund', ?, ?, ?, datetime('now'))
          `).bind(fId, order.final_amount || 0, `Order ${body.order_id} refunded`, body.order_id).run();
        }
      }
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest8, "onRequest");

// api/admin/settlements.js
async function ensureSettlementSchema(db) {
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      period_start TEXT,
      period_end TEXT,
      instructor_id TEXT,
      instructor_name TEXT,
      total_revenue INTEGER DEFAULT 0,
      platform_fee INTEGER DEFAULT 0,
      pg_fee INTEGER DEFAULT 0,
      settlement_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      settled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY,
      type TEXT,
      amount INTEGER DEFAULT 0,
      description TEXT,
      related_settlement_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}
__name(ensureSettlementSchema, "ensureSettlementSchema");
async function onRequest9(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  const url = new URL(request.url);
  if (method === "OPTIONS") return options(request, env);
  await ensureSettlementSchema(db);
  if (method === "GET") {
    const type = url.searchParams.get("type");
    try {
      if (type === "info") {
        const info = await db.prepare("SELECT * FROM settlement_info WHERE id = 'global'").first();
        return json(request, env, { success: true, data: info || {} });
      }
      const instructorId = url.searchParams.get("instructor_id") || "";
      const status = url.searchParams.get("status") || "";
      let sql = "SELECT * FROM settlements WHERE 1=1";
      const params = [];
      if (instructorId) {
        sql += " AND instructor_id = ?";
        params.push(instructorId);
      }
      if (status) {
        sql += " AND status = ?";
        params.push(status);
      }
      sql += " ORDER BY created_at DESC";
      const { results } = await db.prepare(sql).bind(...params).all();
      return json(request, env, { success: true, data: results || [] });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "POST") {
    try {
      const body = await request.json();
      if (body?.type === "info") {
        await db.prepare(`
          INSERT OR REPLACE INTO settlement_info (
            id, company_name, ceo_name, biz_num, address, biz_type,
            manager_email, bank_name, bank_account, bank_holder, updated_at
          ) VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          body.company_name || "",
          body.ceo_name || "",
          body.biz_num || "",
          body.address || "",
          body.biz_type || "",
          body.manager_email || "",
          body.bank_name || "",
          body.bank_account || "",
          body.bank_holder || ""
        ).run();
        return json(request, env, { success: true });
      }
      const id = `STL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const settlementAmount = (Number(body.total_revenue) || 0) - (Number(body.platform_fee) || 0) - (Number(body.pg_fee) || 0);
      await db.prepare(`
        INSERT INTO settlements (
          id, period_start, period_end, instructor_id, instructor_name,
          total_revenue, platform_fee, pg_fee, settlement_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        id,
        body.period_start || null,
        body.period_end || null,
        body.instructor_id || null,
        body.instructor_name || "",
        Number(body.total_revenue) || 0,
        Number(body.platform_fee) || 0,
        Number(body.pg_fee) || 0,
        settlementAmount,
        body.status || "pending"
      ).run();
      if (body.status === "completed") {
        const financialId = `FR${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await db.prepare(`
          INSERT INTO financial_records (
            id, type, amount, description, related_settlement_id, created_at
          ) VALUES (?, 'settlement', ?, ?, ?, datetime('now'))
        `).bind(
          financialId,
          settlementAmount,
          `Settlement ${id} completed`,
          id
        ).run();
      }
      return json(request, env, { success: true, id });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  if (method === "PUT") {
    try {
      const body = await request.json();
      if (!body?.id) {
        return json(request, env, { success: false, error: "id is required" }, { status: 400 });
      }
      await db.prepare(`
        UPDATE settlements
        SET status = ?, settled_at = datetime('now')
        WHERE id = ?
      `).bind(body.status || "completed", body.id).run();
      return json(request, env, { success: true });
    } catch (err) {
      return json(request, env, { success: false, error: err.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest9, "onRequest");

// api/admin/transactions.js
async function onRequest10(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const method = request.method;
  if (method === "OPTIONS") {
    return options(request, env);
  }
  if (method !== "GET") {
    return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
  }
  try {
    const limit = Math.min(parseInt(url.searchParams.get("limit")) || 100, 500);
    const offset = parseInt(url.searchParams.get("offset")) || 0;
    const { results } = await db.prepare(`
            SELECT 
                e.*, 
                u.name as user_name, 
                u.email as user_email,
                c.title as class_title
            FROM enrollments e
            LEFT JOIN users u ON e.user_id = u.id
            LEFT JOIN classes c ON e.class_id = c.id
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all();
    return json(request, env, {
      success: true,
      data: results
    });
  } catch (err) {
    console.error("[D1 API] Transactions Error:", err);
    return json(request, env, {
      success: false,
      error: "\uACB0\uC81C \uB0B4\uC5ED \uC870\uD68C \uC2E4\uD328",
      detail: err.message
    }, { status: 500 });
  }
}
__name(onRequest10, "onRequest");

// api/system/history.js
async function onRequest11(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_title TEXT NOT NULL,
        summary TEXT,
        web_url TEXT,
        deployed_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM system_history ORDER BY id DESC"
      ).all();
      return new Response(JSON.stringify({ success: true, data: results }, null, 2), { headers: cors });
    }
    if (request.method === "POST") {
      const body = await request.json();
      const { version_title, summary, web_url } = body;
      if (!version_title || !web_url) {
        return new Response(JSON.stringify({ success: false, error: "version_title, web_url \uD544\uC218" }), { status: 400, headers: cors });
      }
      await env.DB.prepare(
        "INSERT INTO system_history (version_title, summary, web_url) VALUES (?, ?, ?)"
      ).bind(version_title, summary || "", web_url).run();
      return new Response(JSON.stringify({ success: true, message: "\uAE30\uB85D \uC644\uB8CC" }), { status: 201, headers: cors });
    }
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}
__name(onRequest11, "onRequest");

// api/users/[id].js
function buildBirthDate2(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join("-") : "";
}
__name(buildBirthDate2, "buildBirthDate");
function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return false;
}
__name(normalizeBoolean, "normalizeBoolean");
function normalizeDate(value) {
  return value || null;
}
__name(normalizeDate, "normalizeDate");
function sumMoney(rows, fields) {
  return rows.reduce((total, row) => {
    for (const field of fields) {
      const value = Number(row[field] || 0);
      if (Number.isFinite(value) && value > 0) return total + value;
    }
    return total;
  }, 0);
}
__name(sumMoney, "sumMoney");
function classKey(row) {
  return row?.class_id || row?.id || row?.title || "";
}
__name(classKey, "classKey");
async function safeQueryAll(db, sql, binds = []) {
  try {
    const result = await db.prepare(sql).bind(...binds).all();
    return result.results || [];
  } catch (error) {
    console.warn("[API /users/:id] query failed:", error.message);
    return [];
  }
}
__name(safeQueryAll, "safeQueryAll");
async function safeQueryOne(db, sql, binds = []) {
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch (error) {
    console.warn("[API /users/:id] query failed:", error.message);
    return null;
  }
}
__name(safeQueryOne, "safeQueryOne");
async function loadMemberDetail(db, userId) {
  const user = applyMasterAdminOverride(await safeQueryOne(db, `
    SELECT
      id, email, name, username, phone, profile_image_url, role, membership_level,
      birth_year, birth_month, birth_day, gender, nationality, sns_link,
      preferred_category, operator_seq, role_updated_by, role_updated_at,
      is_blacklisted, blacklisted_at, blacklisted_by, blacklist_reason,
      created_at, updated_at
    FROM users
    WHERE id = ?
  `, [userId]));
  if (!user) return null;
  const enrollments = await safeQueryAll(db, `
    SELECT
      e.id,
      e.user_id,
      e.class_id,
      e.pay_method,
      e.amount,
      e.applied_coupon,
      e.status,
      e.enrolled_at,
      e.created_at,
      e.updated_at,
      c.title AS class_title,
      c.category AS class_category,
      c.image_url AS class_image_url,
      c.creator_id AS instructor_id,
      c.creator_email AS instructor_email,
      c.operating_mode,
      c.class_type
    FROM enrollments e
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE e.user_id = ?
    ORDER BY datetime(COALESCE(e.enrolled_at, e.created_at)) DESC
  `, [userId]);
  const ongoingClasses = enrollments.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return ["active", "enrolled", "ongoing", "progress"].includes(status);
  });
  const paymentRows = await safeQueryAll(db, `
    SELECT
      order_id,
      class_id,
      class_title,
      order_type,
      amount,
      discount_amount,
      final_amount,
      pay_method,
      status,
      created_at,
      paid_at,
      refunded_at
    FROM orders
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(paid_at, created_at)) DESC
  `, [userId]);
  const passRows = await safeQueryAll(db, `
    SELECT
      up.id,
      up.user_id,
      up.class_id,
      up.pass_type,
      up.remaining_count,
      up.total_count,
      up.status,
      up.created_at,
      up.updated_at,
      c.title AS class_title,
      c.category AS class_category
    FROM user_passes up
    LEFT JOIN classes c ON c.id = up.class_id
    WHERE up.user_id = ?
    ORDER BY datetime(COALESCE(up.updated_at, up.created_at)) DESC
  `, [userId]);
  const participantRows = await safeQueryAll(db, `
    SELECT
      cp.class_id,
      cp.role,
      cp.remaining_passes,
      cp.pass_type,
      cp.joined_at,
      c.title AS class_title,
      c.category AS class_category,
      c.image_url AS class_image_url
    FROM class_participants cp
    LEFT JOIN classes c ON c.id = cp.class_id
    WHERE cp.user_id = ?
    ORDER BY datetime(COALESCE(cp.joined_at, 'now')) DESC
  `, [userId]);
  const passTotals = passRows.reduce((acc, row) => {
    const remaining = Number(row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0) || 0;
    const total = Number(row.total_count ?? row.total_passes ?? row.total ?? remaining) || 0;
    acc.remaining += remaining;
    acc.total += total;
    return acc;
  }, { remaining: 0, total: 0 });
  const paidOrders = paymentRows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return status !== "refunded" && (row.paid_at || ["paid", "completed", "done", "success"].includes(status));
  });
  const activeClassMap = /* @__PURE__ */ new Map();
  for (const row of ongoingClasses) {
    activeClassMap.set(classKey(row), {
      class_id: row.class_id,
      class_title: row.class_title || "-",
      class_category: row.class_category || "",
      class_image_url: row.class_image_url || "",
      instructor_id: row.instructor_id || null,
      instructor_email: row.instructor_email || null,
      operating_mode: row.operating_mode || "",
      class_type: row.class_type || "",
      enrollment_status: row.status || "",
      enrolled_at: row.enrolled_at || row.created_at || null,
      amount: Number(row.amount || 0),
      pay_method: row.pay_method || ""
    });
  }
  for (const row of participantRows) {
    const key = row.class_id;
    if (!activeClassMap.has(key)) {
      activeClassMap.set(key, {
        class_id: row.class_id,
        class_title: row.class_title || "-",
        class_category: row.class_category || "",
        class_image_url: row.class_image_url || "",
        instructor_id: null,
        instructor_email: null,
        operating_mode: "",
        class_type: "",
        enrollment_status: row.role || "",
        enrolled_at: row.joined_at || null,
        amount: 0,
        pay_method: ""
      });
    }
  }
  return {
    user: {
      ...user,
      nickname: user.username || "",
      birthdate: buildBirthDate2(user),
      signup_date: user.created_at || "",
      is_blacklisted: normalizeBoolean(user.is_blacklisted),
      blacklisted_at: normalizeDate(user.blacklisted_at)
    },
    summary: {
      subscribed_class_count: enrollments.length,
      ongoing_class_count: ongoingClasses.length || activeClassMap.size,
      paid_order_count: paidOrders.length,
      total_paid_amount: sumMoney(paidOrders, ["final_amount", "amount"]),
      pass_total_count: passTotals.total,
      pass_remaining_count: passTotals.remaining
    },
    subscribed_classes: enrollments.map((row) => ({
      class_id: row.class_id,
      class_title: row.class_title || "-",
      class_category: row.class_category || "",
      class_image_url: row.class_image_url || "",
      instructor_id: row.instructor_id || null,
      instructor_email: row.instructor_email || null,
      operating_mode: row.operating_mode || "",
      class_type: row.class_type || "",
      status: row.status || "",
      enrolled_at: row.enrolled_at || row.created_at || null,
      amount: Number(row.amount || 0),
      pay_method: row.pay_method || "",
      applied_coupon: row.applied_coupon || ""
    })),
    ongoing_classes: Array.from(activeClassMap.values()),
    payments: paymentRows.map((row) => ({
      order_id: row.order_id,
      class_id: row.class_id,
      class_title: row.class_title || "",
      order_type: row.order_type || "",
      amount: Number(row.amount || 0),
      discount_amount: Number(row.discount_amount || 0),
      final_amount: Number(row.final_amount || 0),
      pay_method: row.pay_method || "",
      status: row.status || "",
      created_at: row.created_at || "",
      paid_at: row.paid_at || null,
      refunded_at: row.refunded_at || null
    })),
    passes: passRows.map((row) => ({
      id: row.id,
      class_id: row.class_id,
      class_title: row.class_title || "",
      class_category: row.class_category || "",
      pass_type: row.pass_type || "",
      remaining_count: Number(row.remaining_count ?? row.remaining_passes ?? row.remaining ?? 0) || 0,
      total_count: Number(row.total_count ?? row.total_passes ?? row.total ?? 0) || 0,
      status: row.status || "",
      created_at: row.created_at || "",
      updated_at: row.updated_at || ""
    })),
    class_participants: participantRows
  };
}
__name(loadMemberDetail, "loadMemberDetail");
async function onRequestGet7(context) {
  const { env, params, request } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);
  try {
    const detailedAccess = isAtLeastRole(auth.user.role, "operator") || auth.user.id === userId;
    if (!detailedAccess) {
      return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
    }
    const detail = await loadMemberDetail(env.DB, userId);
    if (!detail) {
      return json(request, env, { success: false, error: "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
    }
    return json(request, env, { success: true, data: detail });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC0AC\uC6A9\uC790 \uC870\uD68C \uC911 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet7, "onRequestGet");
async function onRequestPut2(context) {
  const { request, env, params } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);
  try {
    const body = await request.json();
    const currentUser = applyMasterAdminOverride(await safeQueryOne(env.DB, `
      SELECT id, role, is_blacklisted
      FROM users
      WHERE id = ?
    `, [userId]));
    if (!currentUser) {
      return json(request, env, { success: false, error: "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
    }
    const updates = [];
    const values = [];
    const canEditSelf = auth.user.id === userId;
    const canManageMembers = isAtLeastRole(auth.user.role, "operator");
    const canEditRole = isAtLeastRole(auth.user.role, "admin");
    if (isMasterAdminUserId(userId) && body.role !== void 0 && body.role !== "super_admin") {
      return json(request, env, { success: false, error: "\uCD1D\uAD04 \uC6B4\uC601\uC790 \uACC4\uC815\uC740 \uBCC0\uACBD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
    }
    const editableFields = [
      "name",
      "phone",
      "profile_image_url",
      "sns_link",
      "preferred_category",
      "birth_year",
      "birth_month",
      "birth_day",
      "gender",
      "nationality"
    ];
    for (const field of editableFields) {
      if (body[field] !== void 0) {
        if (!canEditSelf && !canManageMembers) {
          return json(request, env, { success: false, error: "\uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
        }
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (body.blacklisted !== void 0) {
      if (!canManageMembers) {
        return json(request, env, { success: false, error: "\uBE14\uB799\uB9AC\uC2A4\uD2B8 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      const nextBlacklisted = normalizeBoolean(body.blacklisted);
      const reason = String(body.blacklist_reason || body.reason || "").trim() || null;
      updates.push("is_blacklisted = ?");
      values.push(nextBlacklisted ? 1 : 0);
      updates.push("blacklisted_at = ?");
      values.push(nextBlacklisted ? (/* @__PURE__ */ new Date()).toISOString() : null);
      updates.push("blacklisted_by = ?");
      values.push(nextBlacklisted ? auth.user.id : null);
      updates.push("blacklist_reason = ?");
      values.push(nextBlacklisted ? reason : null);
      await env.DB.prepare(`
        INSERT INTO user_blacklist_logs (id, user_id, previous_state, new_state, changed_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        normalizeBoolean(currentUser.is_blacklisted) ? 1 : 0,
        nextBlacklisted ? 1 : 0,
        auth.user.id,
        reason
      ).run();
    }
    if (body.role !== void 0) {
      if (!canEditRole) {
        return json(request, env, { success: false, error: "\uC5ED\uD560 \uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      updates.push("role = ?");
      values.push(body.role);
      updates.push("role_updated_by = ?");
      values.push(auth.user.id);
      updates.push("role_updated_at = ?");
      values.push((/* @__PURE__ */ new Date()).toISOString());
      await env.DB.prepare(`
        INSERT INTO user_role_logs (id, user_id, previous_role, new_role, changed_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        `rol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        currentUser.role || "user",
        body.role,
        auth.user.id,
        body.reason || null
      ).run();
    }
    if (body.new_password) {
      if (!canEditSelf && !canEditRole) {
        return json(request, env, { success: false, error: "\uBE44\uBC00\uBC88\uD638 \uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      if (String(body.new_password).length < 8) {
        return json(request, env, { success: false, error: "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      const password_hash = await hashPassword(String(body.new_password));
      updates.push("password_hash = ?");
      values.push(password_hash);
    }
    if (updates.length === 0) {
      return json(request, env, { success: false, error: "\uC218\uC815\uD560 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 400 });
    }
    updates.push('updated_at = datetime("now")');
    values.push(userId);
    await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    const detail = await loadMemberDetail(env.DB, userId);
    return json(request, env, { success: true, data: detail?.user || null, detail });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC0AC\uC6A9\uC790 \uC218\uC815 \uC911 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPut2, "onRequestPut");
async function onRequestDelete2(context) {
  const { env, params } = context;
  const userId = params.id;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  if (!isAtLeastRole(auth.user.role, "admin")) {
    return json(context.request, env, { success: false, error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
    return json(context.request, env, { success: true, message: "\uC0AC\uC6A9\uC790\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  } catch (err) {
    return json(context.request, env, { success: false, error: "\uC0AC\uC6A9\uC790 \uC0AD\uC81C \uC911 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestDelete2, "onRequestDelete");
async function onRequestOptions16(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions16, "onRequestOptions");

// api/chat/[id].js
async function onRequest12(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") {
    return options(request, env);
  }
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const messageId = params?.id;
  if (!messageId) {
    return json(request, env, { success: false, error: "message id \uD544\uC694" }, { status: 400 });
  }
  try {
    await ensureChatMessagesSchema(env.DB);
    const message = await env.DB.prepare(
      "SELECT * FROM chat_messages WHERE id = ?"
    ).bind(messageId).first();
    if (!message) {
      return json(request, env, { success: false, error: "\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
    }
    const isOwner = message.user_id === auth.user.id;
    if (!isOwner && auth.user.role !== "admin") {
      const classAuth = await requireClassManager(context, message.class_id);
      if (!classAuth.ok) return classAuth.response;
    }
    if (request.method === "PUT" || request.method === "PATCH") {
      const body = await request.json();
      const content = body.message || body.content || "";
      if (!content) {
        return json(request, env, { success: false, error: "message\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      await env.DB.prepare(
        "UPDATE chat_messages SET message = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(content, messageId).run();
      return json(request, env, { success: true });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM chat_messages WHERE id = ?"
      ).bind(messageId).run();
      return json(request, env, { success: true });
    }
    return json(request, env, { success: false, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBA54\uC11C\uB4DC\uC785\uB2C8\uB2E4." }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: "\uCC44\uD305 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequest12, "onRequest");

// api/classes/[id].js
async function onRequest13(context) {
  const { env, params } = context;
  const db = env.DB;
  const classId = params.id;
  if (!classId) {
    return Response.json({ success: false, error: "class_id is required" }, { status: 400 });
  }
  try {
    await ensureClassesSchema(db);
    await ensureReviewsSchema(db);
    const classData = await db.prepare(`
        SELECT c.*, c.creator_id AS instructor_id, u.profile_image_url AS instructor_profile_image
        FROM classes c
        LEFT JOIN users u ON c.creator_id = u.id
        WHERE c.id = ?
      `).bind(classId).first();
    if (!classData) {
      return Response.json({ success: false, error: "Class not found" }, { status: 404 });
    }
    const reviewStats = await db.prepare("SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE class_id = ?").bind(classId).first();
    let enrollmentCount = { count: 0 };
    try {
      const enrollResult = await db.prepare("SELECT COUNT(*) AS count FROM enrollments WHERE class_id = ?").bind(classId).first();
      enrollmentCount = enrollResult || { count: 0 };
    } catch (e) {
      console.warn("Enrollment stats query failed:", e.message);
    }
    let chatCount = 0;
    let dailyChatAvg = 0;
    try {
      const chatResult = await db.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE class_id = ?").bind(classId).first();
      chatCount = chatResult?.count || 0;
      if (classData.created_at) {
        const createdDate = new Date(classData.created_at);
        const now = /* @__PURE__ */ new Date();
        const diffDays = Math.max(1, Math.ceil((now.getTime() - createdDate.getTime()) / (1e3 * 60 * 60 * 24)));
        dailyChatAvg = Number((chatCount / diffDays).toFixed(1));
      }
    } catch (error) {
      console.warn("[API /classes/:id] chat stats failed:", error.message);
    }
    const result = {
      ...classData,
      avg_rating: reviewStats?.avg_rating ? Number(reviewStats.avg_rating).toFixed(1) : "0.0",
      review_count: reviewStats?.review_count || 0,
      enrollment_count: enrollmentCount?.count || 0,
      daily_chat_avg: dailyChatAvg,
      image_urls: safeParseJSON(classData.image_urls, []),
      curriculum: safeParseJSON(classData.curriculum, []),
      sub_instructors: safeParseJSON(classData.sub_instructors, []),
      target_audience: safeParseJSON(classData.target_audience, []),
      objectives: safeParseJSON(classData.objectives, [])
    };
    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error("[API /classes/:id] Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
__name(onRequest13, "onRequest");
function safeParseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
__name(safeParseJSON, "safeParseJSON");

// api/dm/[[path]].js
function getPathParts(params) {
  if (Array.isArray(params.path)) return params.path;
  if (typeof params.path === "string") return params.path.split("/").filter(Boolean);
  return [];
}
__name(getPathParts, "getPathParts");
function normalizeMessage(row) {
  let reactions = {};
  try {
    reactions = row.reactions ? JSON.parse(row.reactions) : {};
  } catch {
  }
  return {
    ...row,
    content: row.content || row.message || "",
    message: row.content || row.message || "",
    text: row.content || row.message || "",
    reactions
  };
}
__name(normalizeMessage, "normalizeMessage");
function buildSinceClause(since) {
  if (!since) {
    return { sql: "", bind: null };
  }
  const numeric = Number(since);
  if (!Number.isFinite(numeric)) {
    return { sql: "", bind: null };
  }
  if (numeric > 9999999999) {
    return {
      sql: " AND (strftime('%s', created_at) * 1000) > ?",
      bind: numeric
    };
  }
  return {
    sql: " AND id > ?",
    bind: numeric
  };
}
__name(buildSinceClause, "buildSinceClause");
async function streamMessages(context, roomId, roomType, initialSince) {
  const { env } = context;
  const encoder = new TextEncoder();
  let since = initialSince || "0";
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      while (true) {
        const sinceClause = buildSinceClause(since);
        let query = `
          SELECT *
          FROM dm_messages
          WHERE room_id = ?
            AND room_type = ?
        `;
        const binds = [roomId, roomType];
        if (sinceClause.sql) {
          query += sinceClause.sql;
          binds.push(sinceClause.bind);
        }
        query += " ORDER BY id ASC LIMIT 100";
        try {
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          for (const row of results || []) {
            since = String(new Date(row.created_at).getTime() || row.id);
            controller.enqueue(encoder.encode(`event: message
data: ${JSON.stringify(normalizeMessage(row))}

`));
          }
          controller.enqueue(encoder.encode(`event: ping
data: {"ts":${Date.now()}}

`));
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error
data: ${JSON.stringify({ error: error.message })}

`));
        }
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
__name(streamMessages, "streamMessages");
async function onRequest14(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS") {
    return options(request, env);
  }
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const pathParts = getPathParts(params);
  const roomId = pathParts[0];
  const resource = pathParts[1];
  const subResource = pathParts[2];
  const extra = pathParts[3];
  if (!roomId || resource !== "messages") {
    return json(request, env, { success: false, error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 DM \uACBD\uB85C\uC785\uB2C8\uB2E4." }, { status: 400 });
  }
  const url = new URL(request.url);
  const roomType = url.searchParams.get("room_type") || "dm";
  try {
    await ensureDmMessagesSchema(env.DB);
    await ensureUserChatsSchema(env.DB);
    if (request.method === "GET" && subResource === "stream") {
      const since = url.searchParams.get("since") || "0";
      return streamMessages(context, roomId, roomType, since);
    }
    if (request.method === "GET") {
      const since = url.searchParams.get("since") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 100, 200);
      const sinceClause = buildSinceClause(since);
      let query = `
        SELECT *
        FROM dm_messages
        WHERE room_id = ?
          AND room_type = ?
      `;
      const binds = [roomId, roomType];
      if (sinceClause.sql) {
        query += sinceClause.sql;
        binds.push(sinceClause.bind);
      }
      query += " ORDER BY id ASC LIMIT ?";
      binds.push(limit);
      const { results } = await env.DB.prepare(query).bind(...binds).all();
      return json(request, env, { success: true, data: (results || []).map(normalizeMessage) });
    }
    if (request.method === "POST" && subResource && extra === "reaction") {
      const messageId = subResource;
      const body = await request.json();
      const emoji = body.emoji;
      if (!emoji) {
        return json(request, env, { success: false, error: "emoji\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      const message = await env.DB.prepare("SELECT reactions FROM dm_messages WHERE id = ? AND room_id = ?").bind(messageId, roomId).first();
      if (!message) {
        return json(request, env, { success: false, error: "\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      }
      let reactions = {};
      try {
        reactions = message.reactions ? JSON.parse(message.reactions) : {};
      } catch {
      }
      reactions[emoji] = reactions[emoji] || [];
      if (reactions[emoji].includes(auth.user.id)) {
        reactions[emoji] = reactions[emoji].filter((id) => id !== auth.user.id);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(auth.user.id);
      }
      await env.DB.prepare(`
        UPDATE dm_messages
        SET reactions = ?, updated_at = datetime('now')
        WHERE id = ? AND room_id = ?
      `).bind(JSON.stringify(reactions), messageId, roomId).run();
      return json(request, env, { success: true, data: { id: messageId, reactions } });
    }
    if (request.method === "POST") {
      const body = await request.json();
      const content = body.content || body.message || body.text || "";
      const resolvedRoomType = body.room_type || roomType;
      const resolvedClassId = resolvedRoomType === "class" ? roomId : body.class_id || null;
      if (!content && !body.file_data && !body.image_url && body.type !== "gathering_card") {
        return json(request, env, { success: false, error: "message\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      await env.DB.prepare(`
        INSERT INTO dm_messages (
          room_id, room_type, class_id, sender_id, user_name, user_avatar,
          content, message, type, reply_to, reply_text, reply_user,
          image_url, file_name, file_size, file_data,
          gather_title, gather_time, gather_place, min_capacity, max_capacity, current_count, status,
          is_pinned, reactions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        roomId,
        resolvedRoomType,
        resolvedClassId,
        auth.user.id,
        body.user_name || auth.user.name || auth.user.username || "\uC0AC\uC6A9\uC790",
        body.user_avatar || auth.user.profile_image_url || "",
        content,
        content,
        body.type || "text",
        body.reply_to || null,
        body.reply_text || null,
        body.reply_user || null,
        body.image_url || null,
        body.file_name || null,
        body.file_size || null,
        body.file_data || null,
        body.gather_title || null,
        body.gather_time || null,
        body.gather_place || null,
        body.min_capacity || null,
        body.max_capacity || null,
        body.current_count || 0,
        body.status || null,
        body.is_pinned ? 1 : 0,
        JSON.stringify(body.reactions || {})
      ).run();
      const inserted = await env.DB.prepare(`
        SELECT *
        FROM dm_messages
        WHERE room_id = ?
          AND sender_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).bind(roomId, auth.user.id).first();
      await env.DB.prepare(`
        UPDATE user_chats
        SET last_message = ?, last_message_at = datetime('now')
        WHERE room_id = ?
      `).bind((content || body.file_name || "\uCCA8\uBD80\uD30C\uC77C").substring(0, 100), roomId).run().catch(() => null);
      return json(request, env, { success: true, data: normalizeMessage(inserted) }, { status: 201 });
    }
    if (request.method === "PATCH" && subResource) {
      const body = await request.json();
      const content = body.content || body.message || "";
      if (!content) {
        return json(request, env, { success: false, error: "content\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      await env.DB.prepare(`
        UPDATE dm_messages
        SET content = ?, message = ?, is_edited = 1, updated_at = datetime('now')
        WHERE id = ? AND room_id = ? AND sender_id = ?
      `).bind(content, content, subResource, roomId, auth.user.id).run();
      return json(request, env, { success: true });
    }
    if (request.method === "DELETE" && subResource) {
      await env.DB.prepare(`
        DELETE FROM dm_messages
        WHERE id = ? AND room_id = ? AND sender_id = ?
      `).bind(subResource, roomId, auth.user.id).run();
      return json(request, env, { success: true });
    }
    return json(request, env, { success: false, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBA54\uC11C\uB4DC\uC785\uB2C8\uB2E4." }, { status: 405 });
  } catch (error) {
    return json(request, env, {
      success: false,
      error: "DM \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: error.message
    }, { status: 500 });
  }
}
__name(onRequest14, "onRequest");

// api/chat.js
function normalizeChatMessage(row) {
  if (!row) return row;
  let replyData = row.reply_data;
  if (typeof replyData === "string") {
    try {
      replyData = JSON.parse(replyData);
    } catch {
      replyData = null;
    }
  }
  return {
    ...row,
    reply_data: replyData || null
  };
}
__name(normalizeChatMessage, "normalizeChatMessage");
async function onRequestGet8(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  const limit = parseInt(url.searchParams.get("limit")) || 100;
  const after = url.searchParams.get("after");
  const pinned_only = url.searchParams.get("pinned_only") === "true";
  if (!class_id) return json(request, env, { success: false, error: "class_id \uD544\uC694" }, { status: 400 });
  try {
    await ensureChatMessagesSchema(env.DB);
    let results;
    if (pinned_only) {
      ({ results } = await env.DB.prepare(
        "SELECT * FROM chat_messages WHERE class_id = ? AND is_pinned = 1 ORDER BY created_at DESC"
      ).bind(class_id).all());
    } else if (after) {
      ({ results } = await env.DB.prepare(
        "SELECT * FROM chat_messages WHERE class_id = ? AND created_at > (SELECT created_at FROM chat_messages WHERE id = ?) ORDER BY created_at ASC LIMIT ?"
      ).bind(class_id, after, limit).all());
    } else {
      ({ results } = await env.DB.prepare(
        "SELECT * FROM chat_messages WHERE class_id = ? ORDER BY created_at DESC LIMIT ?"
      ).bind(class_id, limit).all());
      results = results.reverse();
    }
    return json(request, env, { success: true, data: (results || []).map(normalizeChatMessage) });
  } catch (err) {
    return json(request, env, { success: false, error: "\uCC44\uD305 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet8, "onRequestGet");
async function onRequestPost8(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureChatMessagesSchema(env.DB);
    const body = await request.json();
    const { class_id, user_name, user_avatar, message, type, reply_to, reply_data } = body;
    if (!class_id || !message) {
      return json(request, env, { success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D" }, { status: 400 });
    }
    const id = "msg_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    await env.DB.prepare(
      "INSERT INTO chat_messages (id, class_id, user_id, user_name, user_avatar, message, reply_to, reply_data, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id,
      class_id,
      auth.user.id,
      user_name || auth.user.name || auth.user.username || "\uC0AC\uC6A9\uC790",
      user_avatar || auth.user.profile_image_url || "",
      message,
      reply_to || null,
      reply_data ? JSON.stringify(reply_data) : null,
      type || "text"
    ).run();
    return json(request, env, { success: true, data: { id } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uBA54\uC2DC\uC9C0 \uC804\uC1A1 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost8, "onRequestPost");
async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureChatMessagesSchema(env.DB);
    const body = await request.json();
    const { id, is_pinned } = body;
    if (!id) {
      return json(request, env, { success: false, error: "\uBA54\uC2DC\uC9C0 ID \uD544\uC694" }, { status: 400 });
    }
    await env.DB.prepare(
      "UPDATE chat_messages SET is_pinned = ? WHERE id = ?"
    ).bind(is_pinned ? 1 : 0, id).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: "\uD540 \uC0C1\uD0DC \uBCC0\uACBD \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPatch, "onRequestPatch");
async function onRequestOptions17(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions17, "onRequestOptions");

// api/class-notices.js
async function onRequestGet9(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  try {
    let results;
    if (class_id) {
      ({ results } = await env.DB.prepare("SELECT * FROM class_notices WHERE class_id = ? ORDER BY created_at DESC").bind(class_id).all());
    } else {
      ({ results } = await env.DB.prepare("SELECT * FROM class_notices ORDER BY created_at DESC LIMIT 50").all());
    }
    return Response.json({ success: true, data: results });
  } catch (err) {
    return Response.json({ success: false, error: "\uD074\uB798\uC2A4 \uACF5\uC9C0 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet9, "onRequestGet");
async function onRequestPost9(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { class_id, title, content, author_name } = body;
    if (!class_id || !title) {
      return Response.json({ success: false, error: "\uD544\uC218 \uD56D\uBAA9(class_id, title) \uB204\uB77D" }, { status: 400 });
    }
    const push_key = "noti_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    await env.DB.prepare(
      "INSERT INTO class_notices (push_key, class_id, title, content, author_name, views) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(push_key, class_id, title, content || "", author_name || "\uAC15\uC0AC", 0).run();
    return Response.json({ success: true, data: { id: push_key } }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: "\uD074\uB798\uC2A4 \uACF5\uC9C0 \uC791\uC131 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost9, "onRequestPost");

// api/contacts.js
async function onRequestGet10(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  if (user_id !== auth.user.id && auth.user.role !== "admin") {
    return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    await ensureContactsSchema(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT c.*, u.name as real_name, u.profile_image_url FROM contacts c LEFT JOIN users u ON c.target_user_id = u.id WHERE c.user_id = ? AND c.status = ? ORDER BY c.added_at DESC"
    ).bind(user_id, "active").all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC5F0\uB77D\uCC98 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet10, "onRequestGet");
async function onRequestPost10(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureContactsSchema(env.DB);
    const body = await request.json();
    const { target_user_id, name, avatar, source_class_id, memo } = body;
    const user_id = auth.user.id;
    if (!target_user_id) {
      return json(request, env, { success: false, error: "target_user_id \uD544\uC694" }, { status: 400 });
    }
    const existing = await env.DB.prepare(
      "SELECT * FROM contacts WHERE user_id = ? AND target_user_id = ?"
    ).bind(user_id, target_user_id).first();
    if (existing) {
      await env.DB.prepare(
        "UPDATE contacts SET status = ?, name = COALESCE(?, name), memo = COALESCE(?, memo) WHERE user_id = ? AND target_user_id = ?"
      ).bind("active", name, memo, user_id, target_user_id).run();
      return json(request, env, { success: true, message: "\uC5F0\uB77D\uCC98 \uC5C5\uB370\uC774\uD2B8\uB428" });
    }
    await env.DB.prepare(
      "INSERT INTO contacts (user_id, target_user_id, name, avatar, source_class_id, memo) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(user_id, target_user_id, name || null, avatar || null, source_class_id || null, memo || null).run();
    return json(request, env, { success: true }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC5F0\uB77D\uCC98 \uCD94\uAC00 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost10, "onRequestPost");
async function onRequestPatch2(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureContactsSchema(env.DB);
    const body = await request.json();
    const { target_user_id, status, memo, name } = body;
    const user_id = auth.user.id;
    if (!target_user_id) {
      return json(request, env, { success: false, error: "target_user_id \uD544\uC694" }, { status: 400 });
    }
    const updates = [];
    const binds = [];
    if (status !== void 0) {
      updates.push("status = ?");
      binds.push(status);
    }
    if (memo !== void 0) {
      updates.push("memo = ?");
      binds.push(memo);
    }
    if (name !== void 0) {
      updates.push("name = ?");
      binds.push(name);
    }
    if (updates.length === 0) {
      return json(request, env, { success: false, error: "\uC218\uC815\uD560 \uD56D\uBAA9 \uC5C6\uC74C" }, { status: 400 });
    }
    binds.push(user_id, target_user_id);
    await env.DB.prepare(`UPDATE contacts SET ${updates.join(", ")} WHERE user_id = ? AND target_user_id = ?`).bind(...binds).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC5F0\uB77D\uCC98 \uC218\uC815 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPatch2, "onRequestPatch");
async function onRequestDelete3(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  const target_user_id = url.searchParams.get("target_user_id");
  if (!target_user_id) {
    return json(request, env, { success: false, error: "target_user_id \uD544\uC694" }, { status: 400 });
  }
  if (user_id !== auth.user.id && auth.user.role !== "admin") {
    return json(request, env, { success: false, error: "\uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    await ensureContactsSchema(env.DB);
    await env.DB.prepare("DELETE FROM contacts WHERE user_id = ? AND target_user_id = ?").bind(user_id, target_user_id).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC5F0\uB77D\uCC98 \uC0AD\uC81C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestDelete3, "onRequestDelete");
async function onRequestOptions18(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions18, "onRequestOptions");

// api/coupons.js
async function onRequestGet11(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  const code = url.searchParams.get("code");
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id TEXT NOT NULL,
        coupon_code TEXT NOT NULL,
        type TEXT DEFAULT 'amount',
        value REAL DEFAULT 0,
        limit_count INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    if (code && class_id) {
      const coupon = await env.DB.prepare(
        "SELECT * FROM coupons WHERE coupon_code = ? AND class_id = ?"
      ).bind(code, class_id).first();
      if (!coupon) {
        return new Response(JSON.stringify({ success: false, error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uCFE0\uD3F0\uC785\uB2C8\uB2E4." }), { status: 404, headers: cors });
      }
      return new Response(JSON.stringify({ success: true, data: coupon }), { headers: cors });
    }
    if (class_id) {
      const { results } = await env.DB.prepare(
        "SELECT * FROM coupons WHERE class_id = ? ORDER BY coupon_code ASC"
      ).bind(class_id).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: false, error: "\uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }), { status: 400, headers: cors });
  } catch (err) {
    console.error("Coupon GET Error:", err);
    return new Response(JSON.stringify({ success: false, error: "\uCFE0\uD3F0 \uC870\uD68C \uC624\uB958: " + err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestGet11, "onRequestGet");
async function onRequestPost11(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
  };
  try {
    const body = await request.json();
    const { class_id, code, type, value, max_limit } = body;
    if (!class_id || !code) {
      return new Response(JSON.stringify({ success: false, error: "\uD544\uC218 \uB370\uC774\uD130\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }), { status: 400, headers: cors });
    }
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id TEXT NOT NULL,
        coupon_code TEXT NOT NULL,
        type TEXT DEFAULT 'amount',
        value REAL DEFAULT 0,
        limit_count INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    const existing = await env.DB.prepare(
      "SELECT * FROM coupons WHERE class_id = ? AND coupon_code = ?"
    ).bind(class_id, code).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: `\uCFE0\uD3F0 \uCF54\uB4DC "${code}"\uAC00 \uC774\uBBF8 \uC874\uC7AC\uD569\uB2C8\uB2E4. \uB2E4\uB978 \uCF54\uB4DC\uB97C \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.` }), { status: 400, headers: cors });
    }
    await env.DB.prepare(
      "INSERT INTO coupons (class_id, coupon_code, type, value, limit_count, used_count) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind(class_id, code, type || "amount", value || 0, max_limit || 0).run();
    return new Response(JSON.stringify({ success: true, message: "\uCFE0\uD3F0\uC774 \uBC1C\uAE09\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }), { headers: cors });
  } catch (err) {
    console.error("Coupon POST Error:", err);
    return new Response(JSON.stringify({ success: false, error: "\uCFE0\uD3F0 \uC0DD\uC131 \uC624\uB958: " + err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestPost11, "onRequestPost");
async function onRequestDelete4(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  const code = url.searchParams.get("code");
  try {
    if (!class_id || !code) {
      return new Response(JSON.stringify({ success: false, error: "\uD30C\uB77C\uBBF8\uD130\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }), { status: 400, headers: cors });
    }
    await env.DB.prepare(
      "DELETE FROM coupons WHERE class_id = ? AND coupon_code = ?"
    ).bind(class_id, code).run();
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "\uC0AD\uC81C \uC624\uB958" }), { status: 500, headers: cors });
  }
}
__name(onRequestDelete4, "onRequestDelete");
async function onRequestOptions19() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(onRequestOptions19, "onRequestOptions");

// api/dm.js
async function onRequestGet12(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const room_id = url.searchParams.get("room_id");
  const limit = parseInt(url.searchParams.get("limit")) || 100;
  if (!room_id) {
    return json(request, env, { success: false, error: "room_id \uD544\uC694" }, { status: 400 });
  }
  try {
    await ensureDmMessagesSchema(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM dm_messages WHERE room_id = ? AND room_type = 'dm' ORDER BY id ASC LIMIT ?"
    ).bind(room_id, limit).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "DM \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet12, "onRequestGet");
async function onRequestPost12(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureDmMessagesSchema(env.DB);
    await ensureUserChatsSchema(env.DB);
    const body = await request.json();
    const { room_id, text, image_url } = body;
    const content = body.content || body.message || text || "";
    if (!room_id || !content) {
      return json(request, env, { success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D (room_id, content)" }, { status: 400 });
    }
    await env.DB.prepare(
      "INSERT INTO dm_messages (room_id, room_type, sender_id, user_name, user_avatar, content, message, type, image_url, created_at, updated_at) VALUES (?, 'dm', ?, ?, ?, ?, ?, 'text', ?, datetime('now'), datetime('now'))"
    ).bind(room_id, auth.user.id, auth.user.name || auth.user.username || "\uC0AC\uC6A9\uC790", auth.user.profile_image_url || "", content, content, image_url || null).run();
    await env.DB.prepare(
      "UPDATE user_chats SET last_message = ?, last_message_at = CURRENT_TIMESTAMP WHERE room_id = ?"
    ).bind(content.substring(0, 100), room_id).run();
    const message = await env.DB.prepare("SELECT * FROM dm_messages WHERE room_id = ? AND room_type = 'dm' ORDER BY id DESC LIMIT 1").bind(room_id).first();
    return json(request, env, { success: true, data: message }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "DM \uC804\uC1A1 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost12, "onRequestPost");
async function onRequestOptions20(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions20, "onRequestOptions");

// api/enrollments.js
async function onRequestGet13(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const user_id = url.searchParams.get("user_id");
  const class_id = url.searchParams.get("class_id");
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  await ensureClassesSchema(env.DB);
  try {
    if (user_id && class_id) {
      if (auth.user.id !== user_id && auth.user.role !== "admin") {
        return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      const enrollment = await env.DB.prepare(
        "SELECT * FROM enrollments WHERE user_id = ? AND class_id = ?"
      ).bind(user_id, class_id).first();
      return json(request, env, {
        success: true,
        data: { enrolled: !!enrollment, enrollment }
      });
    }
    if (class_id && !user_id) {
      const classAuth = await requireClassManager(context, class_id);
      if (!classAuth.ok) return classAuth.response;
      const { results } = await env.DB.prepare(`
        SELECT e.*, u.name, u.username, u.profile_image_url, u.phone, u.role, u.email
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.class_id = ?
        ORDER BY e.enrolled_at ASC
      `).bind(class_id).all();
      return json(request, env, { success: true, data: { enrollments: results } });
    }
    if (user_id) {
      if (auth.user.id !== user_id && auth.user.role !== "admin") {
        return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      const { results } = await env.DB.prepare(`
        SELECT e.*, c.title, c.category, c.image_url, c.creator_id AS instructor_id
        FROM enrollments e
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC
      `).bind(user_id).all();
      return json(request, env, { success: true, data: { enrollments: results } });
    }
    return json(request, env, { success: false, error: "user_id \uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC218\uAC15 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet13, "onRequestGet");
async function onRequestPost13(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    console.log("[API] Enrollment Request:", body);
    const { class_id, payment_method, pay_method, amount_paid, amount, coupon_id } = body;
    const finalUserId = auth.user.id;
    const finalClassId = class_id;
    const finalPayMethod = pay_method || payment_method || "free";
    const finalAmount = amount || amount_paid || 0;
    if (!finalUserId || !finalClassId) {
      return json(request, env, { success: false, error: "\uC0AC\uC6A9\uC790 ID\uC640 \uD074\uB798\uC2A4 ID\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
    }
    const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(finalUserId).first();
    if (!user) {
      return json(request, env, {
        success: false,
        error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uC0AC\uC6A9\uC790\uC785\uB2C8\uB2E4.",
        detail: `ID: ${finalUserId} \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.`
      }, { status: 404 });
    }
    const targetClass = await env.DB.prepare("SELECT id FROM classes WHERE id = ?").bind(finalClassId).first();
    if (!targetClass) {
      return json(request, env, { success: false, error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uD074\uB798\uC2A4\uC785\uB2C8\uB2E4." }, { status: 404 });
    }
    const existing = await env.DB.prepare(
      "SELECT user_id FROM enrollments WHERE user_id = ? AND class_id = ?"
    ).bind(finalUserId, finalClassId).first();
    if (existing) {
      return json(request, env, { success: false, error: "\uC774\uBBF8 \uC218\uAC15 \uB4F1\uB85D\uB41C \uD074\uB798\uC2A4\uC785\uB2C8\uB2E4." }, { status: 409 });
    }
    await env.DB.prepare(`
      INSERT INTO enrollments (user_id, class_id, pay_method, amount, applied_coupon, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(finalUserId, finalClassId, finalPayMethod, finalAmount, coupon_id || null).run();
    if (coupon_id) {
      await env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE coupon_code = ? AND class_id = ?").bind(coupon_id, finalClassId).run();
    }
    console.log(`[API] Enrollment Success: User ${finalUserId} -> Class ${finalClassId}`);
    return json(request, env, { success: true, data: { user_id: finalUserId, class_id: finalClassId } }, { status: 201 });
  } catch (err) {
    console.error("[API] Enrollment Error:", err);
    return json(request, env, {
      success: false,
      error: "\uC218\uAC15 \uB4F1\uB85D \uCC98\uB9AC \uC911 \uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: err.message
    }, { status: 500 });
  }
}
__name(onRequestPost13, "onRequestPost");
async function onRequestOptions21(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions21, "onRequestOptions");

// api/faqs.js
async function onRequestGet14(context) {
  const { env, request } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM faqs ORDER BY created_at DESC"
    ).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "FAQ \uC870\uD68C \uC624\uB958" }, { status: 500 });
  }
}
__name(onRequestGet14, "onRequestGet");
async function onRequestPost14(context) {
  const { request, env } = context;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { id, question, answer, is_hidden } = body;
    if (!question || !answer) {
      return json(request, env, { success: false, error: "Question and answer are required" }, { status: 400 });
    }
    if (id) {
      await env.DB.prepare('UPDATE faqs SET question = ?, answer = ?, is_hidden = ?, updated_at = datetime("now") WHERE id = ?').bind(question, answer, is_hidden ? 1 : 0, id).run();
      return json(request, env, { success: true, message: "Updated" });
    } else {
      const newId = "faq_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
      await env.DB.prepare("INSERT INTO faqs (id, question, answer, is_hidden) VALUES (?, ?, ?, ?)").bind(newId, question, answer, is_hidden ? 1 : 0).run();
      return json(request, env, { success: true, data: { id: newId } }, { status: 201 });
    }
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequestPost14, "onRequestPost");
async function onRequestDelete5(context) {
  const { request, env } = context;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(request, env, { success: false, error: "ID is required" }, { status: 400 });
  try {
    await env.DB.prepare("DELETE FROM faqs WHERE id = ?").bind(id).run();
    return json(request, env, { success: true, message: "Deleted" });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequestDelete5, "onRequestDelete");
async function onRequestOptions22(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions22, "onRequestOptions");

// api/friends.js
async function onRequestGet15(context) {
  const { request, env } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  const pending = url.searchParams.get("pending");
  if (!userId) {
    return new Response(JSON.stringify({ success: false, error: "user_id \uD544\uC218" }), { status: 400, headers: cors });
  }
  try {
    await ensureFriendsTable(env.DB);
    if (pending === "1") {
      try {
        const { results } = await env.DB.prepare(`
          SELECT f.*, u.username, u.name
          FROM friends f
          LEFT JOIN users u ON u.id = f.requester_id
          WHERE f.receiver_id = ? AND f.status = 'pending'
          ORDER BY f.created_at DESC
        `).bind(userId).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      } catch (joinErr) {
        const { results } = await env.DB.prepare(`
          SELECT * FROM friends WHERE receiver_id = ? AND status = 'pending' ORDER BY created_at DESC
        `).bind(userId).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      }
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT 
          CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END as friend_id,
          f.status, f.created_at,
          u.username, u.name, u.email
        FROM friends f
        LEFT JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
        WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
        ORDER BY f.created_at DESC
      `).bind(userId, userId, userId, userId).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    } catch (joinErr) {
      const { results } = await env.DB.prepare(`
        SELECT 
          CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END as friend_id,
          status, created_at
        FROM friends
        WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'
        ORDER BY created_at DESC
      `).bind(userId, userId, userId).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "\uCE5C\uAD6C \uC870\uD68C \uC624\uB958", detail: err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestGet15, "onRequestGet");
async function onRequestPost15(context) {
  const { request, env } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const body = await request.json();
    const { action, user_id, friend_id } = body;
    if (!action || !user_id) {
      return new Response(JSON.stringify({ success: false, error: "action, user_id \uD544\uC218" }), { status: 400, headers: cors });
    }
    await ensureFriendsTable(env.DB);
    if (action === "request") {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: "friend_id \uD544\uC218" }), { status: 400, headers: cors });
      if (user_id === friend_id) return new Response(JSON.stringify({ success: false, error: "\uC790\uAE30 \uC790\uC2E0\uC5D0\uAC8C \uC694\uCCAD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }), { status: 400, headers: cors });
      const existing = await env.DB.prepare(`
        SELECT * FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();
      if (existing) {
        if (existing.status === "accepted") return new Response(JSON.stringify({ success: false, error: "\uC774\uBBF8 \uCE5C\uAD6C\uC785\uB2C8\uB2E4" }), { headers: cors });
        if (existing.status === "pending") return new Response(JSON.stringify({ success: false, error: "\uC774\uBBF8 \uC694\uCCAD\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4" }), { headers: cors });
      }
      const id = "fr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await env.DB.prepare(`
        INSERT INTO friends (id, requester_id, receiver_id, status, created_at)
        VALUES (?, ?, ?, 'pending', datetime('now'))
      `).bind(id, user_id, friend_id).run();
      return new Response(JSON.stringify({ success: true, message: "\uCE5C\uAD6C \uC694\uCCAD\uC744 \uBCF4\uB0C8\uC2B5\uB2C8\uB2E4" }), { headers: cors });
    }
    if (action === "accept") {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: "friend_id \uD544\uC218" }), { status: 400, headers: cors });
      await env.DB.prepare(`
        UPDATE friends SET status = 'accepted', accepted_at = datetime('now')
        WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: "\uCE5C\uAD6C \uC694\uCCAD\uC744 \uC218\uB77D\uD588\uC2B5\uB2C8\uB2E4" }), { headers: cors });
    }
    if (action === "reject") {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: "friend_id \uD544\uC218" }), { status: 400, headers: cors });
      await env.DB.prepare(`
        DELETE FROM friends WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
      `).bind(friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: "\uCE5C\uAD6C \uC694\uCCAD\uC744 \uAC70\uC808\uD588\uC2B5\uB2C8\uB2E4" }), { headers: cors });
    }
    if (action === "remove") {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: "friend_id \uD544\uC218" }), { status: 400, headers: cors });
      await env.DB.prepare(`
        DELETE FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).run();
      return new Response(JSON.stringify({ success: true, message: "\uCE5C\uAD6C\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4" }), { headers: cors });
    }
    if (action === "check") {
      if (!friend_id) return new Response(JSON.stringify({ success: false, error: "friend_id \uD544\uC218" }), { status: 400, headers: cors });
      const rel = await env.DB.prepare(`
        SELECT * FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
      `).bind(user_id, friend_id, friend_id, user_id).first();
      return new Response(JSON.stringify({
        success: true,
        data: rel ? { status: rel.status, direction: rel.requester_id === user_id ? "sent" : "received" } : { status: "none" }
      }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: false, error: "\uC54C \uC218 \uC5C6\uB294 action" }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "\uCE5C\uAD6C \uCC98\uB9AC \uC624\uB958", detail: err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestPost15, "onRequestPost");
async function ensureFriendsTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        accepted_at TEXT,
        UNIQUE(requester_id, receiver_id)
      )
    `).run();
  } catch (e) {
  }
}
__name(ensureFriendsTable, "ensureFriendsTable");
async function onRequestOptions23() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(onRequestOptions23, "onRequestOptions");

// api/gatherings.js
async function onRequestGet16(context) {
  const { request, env } = context;
  await ensureTables(env.DB);
  await ensureGatheringsSchema(env.DB);
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  const action = url.searchParams.get("action");
  if (!class_id && action !== "detail" && action !== "participants") return new Response(JSON.stringify({ success: false, error: "class_id \uD544\uC694" }), { status: 400, headers: cors });
  try {
    if (action === "participants") {
      const gathering_id = url.searchParams.get("gathering_id");
      try {
        const { results: results2 } = await env.DB.prepare(`
          SELECT p.*, u.name, u.profile_image_url
          FROM gathering_participants p
          LEFT JOIN users u ON p.user_id = u.id
          WHERE p.gathering_id = ?
        `).bind(gathering_id).all();
        return new Response(JSON.stringify({ success: true, data: results2 }), { headers: cors });
      } catch (joinErr) {
        const { results: results2 } = await env.DB.prepare(
          "SELECT * FROM gathering_participants WHERE gathering_id = ?"
        ).bind(gathering_id).all();
        return new Response(JSON.stringify({ success: true, data: results2 }), { headers: cors });
      }
    }
    if (action === "detail") {
      const gathering_id = url.searchParams.get("gathering_id");
      const gatherRes = await env.DB.prepare("SELECT * FROM class_gatherings WHERE id = ?").bind(gathering_id).first();
      if (!gatherRes) return new Response(JSON.stringify({ success: false, error: "Not found" }), { status: 404, headers: cors });
      const cntRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM gathering_participants WHERE gathering_id = ?").bind(gathering_id).first();
      gatherRes.current_participants = cntRes.cnt;
      return new Response(JSON.stringify({ success: true, data: gatherRes }), { headers: cors });
    }
    const { results } = await env.DB.prepare(
      "SELECT * FROM class_gatherings WHERE class_id = ? ORDER BY gathering_at ASC"
    ).bind(class_id).all();
    for (const g of results) {
      const cntRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM gathering_participants WHERE gathering_id = ?").bind(g.id).first();
      g.current_participants = cntRes.cnt;
    }
    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestGet16, "onRequestGet");
async function onRequestPost16(context) {
  const { request, env } = context;
  await ensureTables(env.DB);
  await ensureGatheringsSchema(env.DB);
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const body = await request.json();
    const {
      action,
      class_id,
      instructor_id,
      title,
      description,
      location,
      gathering_at,
      deadline_at,
      capacity_min,
      capacity_max,
      max_capacity,
      gathering_id,
      user_id
    } = body;
    if (action === "create") {
      const effectiveInstructorId = instructor_id || body.created_by || body.user_id;
      const effectiveCapacityMin = capacity_min ?? body.min_capacity ?? 0;
      const effectiveCapacityMax = capacity_max || max_capacity;
      const effectiveDeadlineAt = deadline_at || gathering_at;
      if (!class_id || !effectiveInstructorId || !title || !gathering_at || !effectiveDeadlineAt || !effectiveCapacityMax) {
        return new Response(JSON.stringify({ success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D" }), { status: 400, headers: cors });
      }
      const id = "gather_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
      await env.DB.prepare(`
        INSERT INTO class_gatherings (id, class_id, instructor_id, title, description, location, gathering_at, deadline_at, capacity_min, capacity_max, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
      `).bind(id, class_id, effectiveInstructorId, title, description || "", location || "", gathering_at, effectiveDeadlineAt, effectiveCapacityMin, effectiveCapacityMax).run();
      return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
    } else if (action === "join") {
      if (!gathering_id || !user_id) return new Response(JSON.stringify({ success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D" }), { status: 400, headers: cors });
      const gatherRes = await env.DB.prepare("SELECT status, capacity_max, class_id FROM class_gatherings WHERE id = ?").bind(gathering_id).first();
      if (!gatherRes) return new Response(JSON.stringify({ success: false, error: "\uBAA8\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }), { status: 404, headers: cors });
      if (gatherRes.status !== "open") return new Response(JSON.stringify({ success: false, error: "\uBAA8\uC9D1\uC774 \uB9C8\uAC10\uB41C \uBAA8\uC784\uC785\uB2C8\uB2E4." }), { status: 400, headers: cors });
      const cntRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM gathering_participants WHERE gathering_id = ?").bind(gathering_id).first();
      if (cntRes.cnt >= gatherRes.capacity_max) {
        await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
        return new Response(JSON.stringify({ success: false, error: "\uBAA8\uC9D1 \uC778\uC6D0\uC774 \uB9C8\uAC10\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }), { status: 400, headers: cors });
      }
      const existRes = await env.DB.prepare("SELECT * FROM gathering_participants WHERE gathering_id = ? AND user_id = ?").bind(gathering_id, user_id).first();
      if (existRes) return new Response(JSON.stringify({ success: false, error: "\uC774\uBBF8 \uCC38\uC5EC\uD55C \uBAA8\uC784\uC785\uB2C8\uB2E4." }), { status: 400, headers: cors });
      const partRes = await env.DB.prepare("SELECT remaining_passes, pass_type, role FROM class_participants WHERE class_id = ? AND user_id = ?").bind(gatherRes.class_id, user_id).first();
      if (partRes && partRes.role !== "instructor") {
        if (partRes.pass_type === "count" && partRes.remaining_passes <= 0) {
          return new Response(JSON.stringify({ success: false, error: "\uC794\uC5EC \uC218\uAC15\uAD8C\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4." }), { status: 400, headers: cors });
        }
        if (partRes.pass_type === "count" && partRes.remaining_passes > 0) {
          await env.DB.prepare("UPDATE class_participants SET remaining_passes = remaining_passes - 1 WHERE class_id = ? AND user_id = ?").bind(gatherRes.class_id, user_id).run();
        }
      }
      await env.DB.prepare("INSERT INTO gathering_participants (gathering_id, user_id) VALUES (?, ?)").bind(gathering_id, user_id).run();
      if (cntRes.cnt + 1 >= gatherRes.capacity_max) {
        await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    } else if (action === "leave") {
      if (!gathering_id || !user_id) return new Response(JSON.stringify({ success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D" }), { status: 400, headers: cors });
      const gatherRes = await env.DB.prepare("SELECT class_id FROM class_gatherings WHERE id = ?").bind(gathering_id).first();
      if (gatherRes) {
        const partRes = await env.DB.prepare("SELECT pass_type, role FROM class_participants WHERE class_id = ? AND user_id = ?").bind(gatherRes.class_id, user_id).first();
        if (partRes && partRes.role !== "instructor" && partRes.pass_type === "count") {
          await env.DB.prepare("UPDATE class_participants SET remaining_passes = remaining_passes + 1 WHERE class_id = ? AND user_id = ?").bind(gatherRes.class_id, user_id).run();
        }
      }
      await env.DB.prepare("DELETE FROM gathering_participants WHERE gathering_id = ? AND user_id = ?").bind(gathering_id, user_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    } else if (action === "close") {
      await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Invalid action" }), { status: 400, headers: cors });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}
__name(onRequestPost16, "onRequestPost");
async function ensureTables(db) {
  try {
    await db.prepare(`
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
      )
    `).run();
    try {
      await db.prepare("ALTER TABLE class_gatherings ADD COLUMN location TEXT").run();
    } catch (e) {
    }
    try {
      await db.prepare("ALTER TABLE class_gatherings ADD COLUMN description TEXT").run();
    } catch (e) {
    }
    try {
      await db.prepare("ALTER TABLE class_gatherings ADD COLUMN capacity_min INTEGER DEFAULT 0").run();
    } catch (e) {
    }
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS gathering_participants (
        gathering_id TEXT NOT NULL REFERENCES class_gatherings(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (gathering_id, user_id)
      )
    `).run();
  } catch (e) {
    console.error("ensureTables error:", e);
  }
}
__name(ensureTables, "ensureTables");
async function onRequestOptions24() {
  return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
__name(onRequestOptions24, "onRequestOptions");

// api/group-chats.js
async function onRequestGet17(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const group_id = url.searchParams.get("group_id");
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  try {
    await ensureGroupChatsSchema(env.DB);
    if (group_id) {
      const data = await env.DB.prepare("SELECT * FROM group_chats WHERE group_id = ?").bind(group_id).first();
      if (!data) return json(request, env, { success: false, error: "\uADF8\uB8F9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      data.members = safeParseJSON2(data.members, []);
      if (!data.members.includes(auth.user.id) && auth.user.role !== "admin") {
        return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      return json(request, env, { success: true, data });
    }
    if (user_id) {
      if (user_id !== auth.user.id && auth.user.role !== "admin") {
        return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
      }
      const { results } = await env.DB.prepare(
        "SELECT * FROM group_chats WHERE members LIKE ? ORDER BY created_at DESC"
      ).bind(`%${user_id}%`).all();
      results.forEach((r) => r.members = safeParseJSON2(r.members, []));
      return json(request, env, { success: true, data: results });
    }
    return json(request, env, { success: false, error: "group_id \uB610\uB294 user_id \uD544\uC694" }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uADF8\uB8F9 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet17, "onRequestGet");
async function onRequestPost17(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureGroupChatsSchema(env.DB);
    await ensureUserChatsSchema(env.DB);
    const body = await request.json();
    const { name, members } = body;
    const created_by = auth.user.id;
    if (!name) {
      return json(request, env, { success: false, error: "\uADF8\uB8F9 \uC774\uB984\uACFC \uC0DD\uC131\uC790 \uD544\uC218" }, { status: 400 });
    }
    const group_id = "grp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const membersList = Array.isArray(members) ? members : [created_by];
    if (!membersList.includes(created_by)) membersList.push(created_by);
    await env.DB.prepare(
      "INSERT INTO group_chats (group_id, name, members, created_by) VALUES (?, ?, ?, ?)"
    ).bind(group_id, name, JSON.stringify(membersList), created_by).run();
    for (const memberId of membersList) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO user_chats (user_id, room_id, type, group_name) VALUES (?, ?, ?, ?)"
      ).bind(memberId, group_id, "group", name).run();
    }
    return json(request, env, { success: true, data: { group_id } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uADF8\uB8F9 \uC0DD\uC131 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost17, "onRequestPost");
async function onRequestPatch3(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureGroupChatsSchema(env.DB);
    await ensureUserChatsSchema(env.DB);
    const body = await request.json();
    const { group_id, name, add_member, remove_member } = body;
    if (!group_id) return json(request, env, { success: false, error: "group_id \uD544\uC694" }, { status: 400 });
    const group = await env.DB.prepare("SELECT * FROM group_chats WHERE group_id = ?").bind(group_id).first();
    if (!group) return json(request, env, { success: false, error: "\uADF8\uB8F9 \uC5C6\uC74C" }, { status: 404 });
    let members = safeParseJSON2(group.members, []);
    if (!members.includes(auth.user.id) && auth.user.role !== "admin") {
      return json(request, env, { success: false, error: "\uC218\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
    }
    if (add_member && !members.includes(add_member)) {
      members.push(add_member);
      await env.DB.prepare("INSERT OR IGNORE INTO user_chats (user_id, room_id, type, group_name) VALUES (?, ?, ?, ?)").bind(add_member, group_id, "group", group.name).run();
    }
    if (remove_member) {
      members = members.filter((m) => m !== remove_member);
      await env.DB.prepare("DELETE FROM user_chats WHERE user_id = ? AND room_id = ?").bind(remove_member, group_id).run();
    }
    const updates = [];
    const binds = [];
    if (name) {
      updates.push("name = ?");
      binds.push(name);
    }
    updates.push("members = ?");
    binds.push(JSON.stringify(members));
    binds.push(group_id);
    await env.DB.prepare(`UPDATE group_chats SET ${updates.join(", ")} WHERE group_id = ?`).bind(...binds).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: "\uADF8\uB8F9 \uC218\uC815 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPatch3, "onRequestPatch");
async function onRequestOptions25(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions25, "onRequestOptions");
function safeParseJSON2(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
__name(safeParseJSON2, "safeParseJSON");

// api/inquiries.js
async function onRequestGet18(context) {
  const { env } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const { results } = await env.DB.prepare("SELECT * FROM inquiries ORDER BY created_at DESC").all();
    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "\uBB38\uC758 \uC870\uD68C \uC624\uB958" }), { status: 500, headers: cors });
  }
}
__name(onRequestGet18, "onRequestGet");
async function onRequestPost18(context) {
  const { request, env } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  try {
    const body = await request.json();
    const { name, email, category, title, content } = body;
    if (!name || !email || !title || !content) {
      return new Response(JSON.stringify({ success: false, error: "\uD544\uC218 \uD56D\uBAA9\uC744 \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694." }), { status: 400, headers: cors });
    }
    const id = "inq_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    await env.DB.prepare(
      "INSERT INTO inquiries (id, name, email, category, title, content, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, name, email, category || "\uC77C\uBC18", title, content, body.submitted_by || null).run();
    return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "\uBB38\uC758 \uC811\uC218 \uC624\uB958" }), { status: 500, headers: cors });
  }
}
__name(onRequestPost18, "onRequestPost");
async function onRequestOptions26() {
  return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
__name(onRequestOptions26, "onRequestOptions");

// api/notices.js
async function onRequestGet19(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const noticeId = url.searchParams.get("id");
  try {
    if (noticeId) {
      const notice = await env.DB.prepare("SELECT * FROM notices WHERE id = ?").bind(noticeId).first();
      if (!notice) return json(request, env, { success: false, error: "\uACF5\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      const likeCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?").bind(noticeId).first();
      const { results: comments } = await env.DB.prepare("SELECT * FROM notice_comments WHERE notice_id = ? ORDER BY created_at ASC").bind(noticeId).all();
      return json(request, env, {
        success: true,
        data: { ...notice, like_count: likeCount?.cnt || 0, comments: comments || [] }
      });
    }
    const { results } = await env.DB.prepare(
      'SELECT * FROM notices WHERE is_hidden = 0 ORDER BY CASE WHEN type = "important" THEN 0 ELSE 1 END, created_at DESC'
    ).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "\uACF5\uC9C0 \uC870\uD68C \uC624\uB958" }, { status: 500 });
  }
}
__name(onRequestGet19, "onRequestGet");
async function onRequestPost19(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (body.action === "increment_views" && body.notice_id) {
      await env.DB.prepare("UPDATE notices SET views = views + 1 WHERE id = ?").bind(body.notice_id).run();
      return json(request, env, { success: true });
    }
    if (body.action === "toggle_like" && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;
      const existing = await env.DB.prepare("SELECT * FROM notice_likes WHERE notice_id = ? AND user_id = ?").bind(body.notice_id, auth.user.id).first();
      if (existing) {
        await env.DB.prepare("DELETE FROM notice_likes WHERE notice_id = ? AND user_id = ?").bind(body.notice_id, auth.user.id).run();
      } else {
        await env.DB.prepare("INSERT INTO notice_likes (notice_id, user_id) VALUES (?, ?)").bind(body.notice_id, auth.user.id).run();
      }
      const count = await env.DB.prepare("SELECT COUNT(*) as cnt FROM notice_likes WHERE notice_id = ?").bind(body.notice_id).first();
      return json(request, env, { success: true, data: { liked: !existing, count: count?.cnt || 0 } });
    }
    if (body.action === "add_comment" && body.notice_id) {
      const auth = await requireSession(context);
      if (!auth.ok) return auth.response;
      const commentId = "cmt_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
      await env.DB.prepare("INSERT INTO notice_comments (id, notice_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?)").bind(commentId, body.notice_id, auth.user.id, auth.user.name || auth.user.username || "\uC0AC\uC6A9\uC790", body.content).run();
      return json(request, env, { success: true, data: { id: commentId } }, { status: 201 });
    }
    if (body.title) {
      const auth = await requireAdmin(context);
      if (!auth.ok) return auth.response;
      if (body.id) {
        await env.DB.prepare('UPDATE notices SET title = ?, content = ?, type = ?, is_hidden = ?, updated_at = datetime("now") WHERE id = ?').bind(body.title, body.content || "", body.type || "normal", body.is_hidden ? 1 : 0, body.id).run();
        return json(request, env, { success: true, message: "Updated" });
      } else {
        const id = "ntc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
        await env.DB.prepare("INSERT INTO notices (id, title, content, type, author_name) VALUES (?, ?, ?, ?, ?)").bind(id, body.title, body.content || "", body.type || "normal", auth.user.name || "\uAD00\uB9AC\uC790").run();
        return json(request, env, { success: true, data: { id } }, { status: 201 });
      }
    }
    return json(request, env, { success: false, error: "\uC694\uCCAD \uD615\uC2DD \uC624\uB958" }, { status: 400 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uACF5\uC9C0 \uCC98\uB9AC \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost19, "onRequestPost");
async function onRequestDelete6(context) {
  const { request, env } = context;
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json(request, env, { success: false, error: "ID is required" }, { status: 400 });
  try {
    await env.DB.prepare("DELETE FROM notices WHERE id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM notice_likes WHERE notice_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM notice_comments WHERE notice_id = ?").bind(id).run();
    return json(request, env, { success: true, message: "Deleted" });
  } catch (err) {
    return json(request, env, { success: false, error: err.message }, { status: 500 });
  }
}
__name(onRequestDelete6, "onRequestDelete");
async function onRequestOptions27(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions27, "onRequestOptions");

// api/recommendations.js
var RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
};
async function onRequest15(context) {
  const { request, env } = context;
  const db = env.DB;
  try {
    await ensureRecommendationsSchema(db);
    await ensureClassesSchema(db);
    await ensureClassStatsSchema(db);
    const { results: folders } = await db.prepare("SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY type ASC, sort_order ASC").all();
    if (!folders || folders.length === 0) {
      return json(request, env, { success: true, data: [] }, { headers: RESPONSE_HEADERS });
    }
    const enrichedFolders = [];
    for (const folder of folders) {
      let classIds = [];
      try {
        classIds = JSON.parse(folder.class_ids || "[]");
        if (!Array.isArray(classIds)) classIds = [];
      } catch {
        classIds = [];
      }
      let folderClasses = [];
      if (classIds.length > 0) {
        const placeholders = classIds.map(() => "?").join(",");
        const { results } = await db.prepare(`
            SELECT
              c.id, c.title, c.thumbnail, c.image_url, c.category, c.price,
              c.instructor_name, c.creator_id AS instructor_id, c.discount_rate,
              COALESCE(s.avg_rating, 0) AS avg_rating,
              COALESCE(s.review_count, 0) AS review_count
            FROM classes c
            LEFT JOIN class_stats s ON c.id = s.class_id
            WHERE c.id IN (${placeholders})
          `).bind(...classIds).all();
        const classMap = new Map(results.map((item) => [String(item.id), item]));
        folderClasses = classIds.map((id) => {
          const classData = classMap.get(String(id));
          if (!classData) {
            console.warn("[API /recommendations] Missing class for recommendation entry:", id);
          }
          return classData || null;
        }).filter(Boolean);
      }
      enrichedFolders.push({
        id: folder.folder_id,
        title: folder.title,
        description: folder.description || "",
        type: folder.type || "regular",
        category: folder.category || "all",
        sort_order: folder.sort_order,
        total_classes: classIds.length,
        classes: folderClasses
      });
    }
    return json(request, env, {
      success: true,
      data: enrichedFolders
    }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[API /recommendations] Error:", error);
    return json(request, env, { success: false, error: error.message }, { status: 500, headers: RESPONSE_HEADERS });
  }
}
__name(onRequest15, "onRequest");
async function onRequestOptions28(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions28, "onRequestOptions");

// api/reviews.js
async function onRequestGet20(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get("class_id");
  if (!class_id) return json(request, env, { success: false, error: "class_id \uD544\uC694" }, { status: 400 });
  try {
    await ensureClassesSchema(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM reviews WHERE class_id = ? ORDER BY created_at DESC"
    ).bind(class_id).all();
    const avg = results.length > 0 ? (results.reduce((sum, r) => sum + (r.rating || 5), 0) / results.length).toFixed(1) : null;
    return json(request, env, { success: true, data: results, summary: { count: results.length, avg_rating: avg } });
  } catch (err) {
    return json(request, env, { success: false, error: "\uB9AC\uBDF0 \uC870\uD68C \uC624\uB958" }, { status: 500 });
  }
}
__name(onRequestGet20, "onRequestGet");
async function onRequestPost20(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureClassesSchema(env.DB);
    const body = await request.json();
    if (body.action === "reply" && body.review_id && body.reply) {
      const review = await env.DB.prepare("SELECT class_id FROM reviews WHERE push_key = ?").bind(body.review_id).first();
      if (!review) {
        return json(request, env, { success: false, error: "\uB9AC\uBDF0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      }
      const classAuth = await requireClassManager(context, review.class_id);
      if (!classAuth.ok) return classAuth.response;
      await env.DB.prepare("UPDATE reviews SET instructor_reply = ? WHERE push_key = ?").bind(body.reply, body.review_id).run();
      return json(request, env, { success: true });
    }
    const { class_id, user_name, rating, content } = body;
    if (!class_id || !content) {
      return json(request, env, { success: false, error: "\uD544\uC218 \uD56D\uBAA9 \uB204\uB77D" }, { status: 400 });
    }
    const push_key = "rv_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    await env.DB.prepare(
      "INSERT INTO reviews (push_key, class_id, user_id, user_name, rating, content) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(push_key, class_id, auth.user.id, user_name || auth.user.name || auth.user.username || "\uC218\uAC15\uC0DD", rating || 5, content).run();
    return json(request, env, { success: true, data: { id: push_key } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "\uB9AC\uBDF0 \uCC98\uB9AC \uC624\uB958" }, { status: 500 });
  }
}
__name(onRequestPost20, "onRequestPost");
async function onRequestOptions29(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions29, "onRequestOptions");

// api/site-settings.js
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(parseJsonArray, "parseJsonArray");
async function onRequest16(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  await ensureSiteSettingsSchema(db);
  if (method === "GET") {
    try {
      const settings = await db.prepare("SELECT * FROM site_settings WHERE id = 'global'").first();
      if (!settings) {
        return json(request, env, {
          success: true,
          data: {
            site_name: "B-Square",
            banners: [],
            bottom_banners: []
          }
        });
      }
      const banners = parseJsonArray(settings.banners);
      const bottomBanners = parseJsonArray(settings.bottom_banners);
      return json(request, env, {
        success: true,
        data: {
          site_name: settings.site_name,
          site_url: settings.site_url,
          logo_url: settings.logo_url,
          favicon_url: settings.favicon_url,
          company_name: settings.company_name,
          ceo_name: settings.ceo_name,
          address: settings.address,
          biz_num: settings.biz_num,
          mail_order_num: settings.mail_order_num,
          cs_phone: settings.cs_phone,
          cs_email: settings.cs_email,
          seo: {
            title: settings.seo_title,
            description: settings.seo_description,
            keywords: settings.seo_keywords,
            image: settings.seo_image
          },
          banners,
          bottom_banners: bottomBanners,
          footer_hours: settings.footer_hours,
          footer_terms_url: settings.footer_terms_url,
          footer_privacy_url: settings.footer_privacy_url,
          footer_instagram_url: settings.footer_instagram_url,
          footer_youtube_url: settings.footer_youtube_url
        }
      });
    } catch (error) {
      console.error("[API /site-settings GET] Error:", error);
      return json(request, env, { success: false, error: error.message }, { status: 500 });
    }
  }
  if (method === "POST") {
    try {
      const body = await request.json();
      const seo = body.seo || {};
      const bannersJson = JSON.stringify(body.banners || []);
      const bottomBannersJson = JSON.stringify(body.bottom_banners || []);
      const sql = `
        INSERT OR REPLACE INTO site_settings (
          id, site_name, site_url, logo_url, favicon_url,
          company_name, ceo_name, address, biz_num,
          mail_order_num, cs_phone, cs_email,
          seo_title, seo_description, seo_keywords, seo_image,
          banners, bottom_banners, footer_hours,
          footer_terms_url, footer_privacy_url, footer_instagram_url, footer_youtube_url,
          updated_at
        ) VALUES (
          'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
      `;
      const bindValues = [
        body.site_name || "",
        body.site_url || "",
        body.logo_url || "",
        body.favicon_url || "",
        body.company_name || "",
        body.ceo_name || "",
        body.address || "",
        body.biz_num || "",
        body.mail_order_num || "",
        body.cs_phone || "",
        body.cs_email || "",
        seo.title || "",
        seo.description || "",
        seo.keywords || "",
        seo.image || "",
        bannersJson,
        bottomBannersJson,
        body.footer_hours || "",
        body.footer_terms_url || "",
        body.footer_privacy_url || "",
        body.footer_instagram_url || "",
        body.footer_youtube_url || ""
      ];
      try {
        await db.prepare(sql).bind(...bindValues).run();
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg.includes("no column named updated_at")) {
          const fallbackSql = `
            INSERT OR REPLACE INTO site_settings (
              id, site_name, site_url, logo_url, favicon_url,
              company_name, ceo_name, address, biz_num,
              mail_order_num, cs_phone, cs_email,
              seo_title, seo_description, seo_keywords, seo_image,
              banners, bottom_banners, footer_hours,
              footer_terms_url, footer_privacy_url, footer_instagram_url, footer_youtube_url
            ) VALUES (
              'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `;
          await db.prepare(fallbackSql).bind(...bindValues).run();
        } else {
          throw err;
        }
      }
      return json(request, env, { success: true, message: "Settings updated successfully" });
    } catch (error) {
      console.error("[API /site-settings POST] Error:", error);
      return json(request, env, { success: false, error: error.message || "Failed to save site settings" }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest16, "onRequest");
async function onRequestOptions30(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions30, "onRequestOptions");

// api/user-chats.js
async function onRequestGet21(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  const type = url.searchParams.get("type");
  if (user_id !== auth.user.id && auth.user.role !== "admin") {
    return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    await ensureUserChatsSchema(env.DB);
    let query = "SELECT * FROM user_chats WHERE user_id = ?";
    const binds = [user_id];
    if (type) {
      query += " AND type = ?";
      binds.push(type);
    }
    query += " ORDER BY last_message_at DESC";
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "\uCC44\uD305\uBC29 \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet21, "onRequestGet");
async function onRequestPost21(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  try {
    await ensureUserChatsSchema(env.DB);
    const body = await request.json();
    const {
      type,
      room_id,
      target_user_id,
      target_name,
      target_avatar,
      class_name,
      class_image,
      class_category,
      group_name,
      is_instructor
    } = body;
    const user_id = auth.user.id;
    if (type === "class") {
      const classRoomId = room_id || target_user_id;
      if (!classRoomId) {
        return json(request, env, { success: false, error: "room_id \uD544\uC694" }, { status: 400 });
      }
      await env.DB.prepare(`
                INSERT OR IGNORE INTO user_chats (
                    user_id, room_id, type, class_name, class_image, class_category, is_instructor
                ) VALUES (?, ?, 'class', ?, ?, ?, ?)
            `).bind(
        user_id,
        classRoomId,
        class_name || target_name || "\uD074\uB798\uC2A4",
        class_image || target_avatar || "",
        class_category || "",
        is_instructor ? 1 : 0
      ).run();
      return json(request, env, { success: true, data: { room_id: classRoomId } }, { status: 201 });
    }
    if (type === "group") {
      if (!room_id) {
        return json(request, env, { success: false, error: "room_id \uD544\uC694" }, { status: 400 });
      }
      await env.DB.prepare(`
                INSERT OR IGNORE INTO user_chats (
                    user_id, room_id, type, group_name
                ) VALUES (?, ?, 'group', ?)
            `).bind(user_id, room_id, group_name || target_name || "\uADF8\uB8F9").run();
      return json(request, env, { success: true, data: { room_id } }, { status: 201 });
    }
    if (!target_user_id) {
      return json(request, env, { success: false, error: "target_user_id \uD544\uC694" }, { status: 400 });
    }
    const ids = [user_id, target_user_id].sort();
    const dmRoomId = "dm_" + ids.join("_");
    const existing = await env.DB.prepare(
      "SELECT * FROM user_chats WHERE user_id = ? AND room_id = ?"
    ).bind(user_id, dmRoomId).first();
    if (existing) {
      return json(request, env, { success: true, data: { room_id: dmRoomId }, message: "\uC774\uBBF8 \uC874\uC7AC\uD558\uB294 \uCC44\uD305\uBC29" });
    }
    const targetUser = await env.DB.prepare("SELECT name, profile_image_url FROM users WHERE id = ?").bind(target_user_id).first();
    const myUser = await env.DB.prepare("SELECT name, profile_image_url FROM users WHERE id = ?").bind(user_id).first();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image) VALUES (?, ?, ?, ?, ?)"
    ).bind(user_id, dmRoomId, "dm", target_name || targetUser?.name || "\uC0AC\uC6A9\uC790", target_avatar || targetUser?.profile_image_url || "").run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_chats (user_id, room_id, type, class_name, class_image) VALUES (?, ?, ?, ?, ?)"
    ).bind(target_user_id, dmRoomId, "dm", myUser?.name || "\uC0AC\uC6A9\uC790", myUser?.profile_image_url || "").run();
    return json(request, env, { success: true, data: { room_id: dmRoomId } }, { status: 201 });
  } catch (err) {
    return json(request, env, { success: false, error: "DM \uBC29 \uC0DD\uC131 \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestPost21, "onRequestPost");
async function onRequestDelete7(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  const room_id = url.searchParams.get("room_id");
  if (!room_id) {
    return json(request, env, { success: false, error: "room_id \uD544\uC694" }, { status: 400 });
  }
  if (user_id !== auth.user.id && auth.user.role !== "admin") {
    return json(request, env, { success: false, error: "\uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    await ensureUserChatsSchema(env.DB);
    await env.DB.prepare("DELETE FROM user_chats WHERE user_id = ? AND room_id = ?").bind(user_id, room_id).run();
    return json(request, env, { success: true });
  } catch (err) {
    return json(request, env, { success: false, error: "\uCC44\uD305\uBC29 \uC0AD\uC81C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestDelete7, "onRequestDelete");
async function onRequestOptions31(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions31, "onRequestOptions");

// api/user-passes.js
async function onRequestGet22(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  const user_id = url.searchParams.get("user_id") || auth.user.id;
  if (user_id !== auth.user.id && auth.user.role !== "admin") {
    return json(request, env, { success: false, error: "\uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM user_passes WHERE user_id = ? AND status = 'active'
    `).bind(user_id).all();
    return json(request, env, { success: true, data: results });
  } catch (err) {
    return json(request, env, { success: false, error: "\uC218\uAC15\uAD8C \uC870\uD68C \uC624\uB958", detail: err.message }, { status: 500 });
  }
}
__name(onRequestGet22, "onRequestGet");
async function onRequestOptions32(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions32, "onRequestOptions");

// api/users/index.js
var MAX_LIMIT2 = 5e3;
function buildBirthdate(user) {
  const parts = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean);
  return parts.length ? parts.join("-") : "";
}
__name(buildBirthdate, "buildBirthdate");
function normalizeSearch(value) {
  return String(value || "").trim();
}
__name(normalizeSearch, "normalizeSearch");
function normalizeBoolean2(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return false;
}
__name(normalizeBoolean2, "normalizeBoolean");
async function onRequestGet23(context) {
  const { request, env } = context;
  const auth = await requireSession(context);
  if (!auth.ok) return auth.response;
  if (!isAtLeastRole(auth.user.role, "operator")) {
    return json(request, env, { success: false, error: "\uC6B4\uC601\uC790 \uC774\uC0C1\uB9CC \uD68C\uC6D0 \uBAA9\uB85D\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, { status: 403 });
  }
  await ensureAuthSchema(env.DB);
  await ensureClassesSchema(env.DB);
  try {
    const url = new URL(request.url);
    const search = normalizeSearch(url.searchParams.get("q") || url.searchParams.get("search"));
    const role = normalizeSearch(url.searchParams.get("role"));
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || MAX_LIMIT2, MAX_LIMIT2));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    let where = "WHERE 1=1";
    const params = [];
    if (search) {
      const term = `%${search}%`;
      where += " AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
      params.push(term, term, term, term);
    }
    if (role && role !== "all") {
      where += " AND u.role = ?";
      params.push(role);
    }
    const { results } = await env.DB.prepare(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.username,
        u.phone,
        u.profile_image_url,
        u.role,
        u.membership_level,
        u.birth_year,
        u.birth_month,
        u.birth_day,
        u.operator_seq,
        u.is_blacklisted,
        u.blacklisted_at,
        u.blacklisted_by,
        u.blacklist_reason,
        u.role_updated_by,
        u.role_updated_at,
        u.created_at,
        u.updated_at
      FROM users u
      ${where}
      ORDER BY datetime(COALESCE(u.updated_at, u.created_at)) DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    const users = (results || []).map((user) => {
      const normalized = applyMasterAdminOverride(user);
      return {
        ...normalized,
        nickname: normalized.username || "",
        birthdate: buildBirthdate(normalized),
        signup_date: normalized.created_at || "",
        is_blacklisted: normalizeBoolean2(normalized.is_blacklisted)
      };
    });
    return json(request, env, {
      success: true,
      data: users,
      total: users.length
    });
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }
}
__name(onRequestGet23, "onRequestGet");
async function onRequestOptions33(context) {
  return options(context.request, context.env);
}
__name(onRequestOptions33, "onRequestOptions");

// api/admin/_middleware.js
async function onRequest17(context) {
  if (context.request.method === "OPTIONS") {
    return options(context.request, context.env);
  }
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  return context.next();
}
__name(onRequest17, "onRequest");

// api/classes.js
async function onRequest18(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const method = request.method;
  await ensureClassesSchema(db);
  await ensureReviewsSchema(db);
  if (method === "GET") {
    const category = url.searchParams.get("category") || "";
    const query = url.searchParams.get("q") || "";
    const instructorId = url.searchParams.get("instructor_id") || url.searchParams.get("creator_id") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 100);
    const offset = parseInt(url.searchParams.get("offset")) || 0;
    try {
      let sql = "SELECT *, creator_id AS instructor_id FROM classes WHERE 1=1";
      const params = [];
      if (category) {
        sql += " AND category LIKE ?";
        params.push(`%${category}%`);
      }
      if (instructorId) {
        sql += " AND creator_id = ?";
        params.push(instructorId);
      }
      if (query) {
        sql += " AND (title LIKE ? OR category LIKE ? OR keywords LIKE ?)";
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const { results } = await db.prepare(sql).bind(...params).all();
      const classIds = results.map((c) => c.id);
      let reviewStats = {};
      if (classIds.length > 0) {
        const placeholders = classIds.map(() => "?").join(",");
        const { results: stats } = await db.prepare(`SELECT class_id, AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE class_id IN (${placeholders}) GROUP BY class_id`).bind(...classIds).all();
        stats.forEach((s) => {
          reviewStats[s.class_id] = {
            avg_rating: s.avg_rating ? parseFloat(s.avg_rating).toFixed(1) : "0.0",
            review_count: s.review_count || 0
          };
        });
      }
      const enriched = results.map((cls) => ({
        ...cls,
        avg_rating: reviewStats[cls.id]?.avg_rating || "0.0",
        review_count: reviewStats[cls.id]?.review_count || 0
      }));
      return json(request, env, { success: true, data: enriched, meta: { limit, offset, count: enriched.length } });
    } catch (error) {
      return json(request, env, { success: false, error: "\uD074\uB798\uC2A4 \uBAA9\uB85D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", detail: error.message }, { status: 500 });
    }
  }
  if (method === "PATCH") {
    const auth = await requireSession(context);
    if (!auth.ok) return auth.response;
    try {
      const body = await request.json();
      const id = body.id;
      if (!id) return json(request, env, { success: false, error: "ID is required" }, { status: 400 });
      const classAuth = await requireClassManager(context, id);
      if (!classAuth.ok) return classAuth.response;
      const updates = [];
      const values = [];
      const allowed = ["title", "category", "is_approved", "price"];
      allowed.forEach((key) => {
        if (body[key] !== void 0) {
          updates.push(`${key} = ?`);
          values.push(body[key]);
        }
      });
      if (updates.length === 0) return json(request, env, { success: false, error: "No fields to update" }, { status: 400 });
      updates.push("updated_at = datetime('now')");
      values.push(id);
      await db.prepare(`UPDATE classes SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
      return json(request, env, { success: true, message: "Class updated successfully" });
    } catch (error) {
      return json(request, env, { success: false, error: "\uD074\uB798\uC2A4 \uC218\uC815 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", detail: error.message }, { status: 500 });
    }
  }
  if (method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json(request, env, { success: false, error: "ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
    const auth = await requireClassManager(context, id);
    if (!auth.ok) return auth.response;
    try {
      await db.prepare("DELETE FROM gathering_participants WHERE gathering_id IN (SELECT id FROM class_gatherings WHERE class_id = ?)").bind(id).run();
      await db.prepare("DELETE FROM class_gatherings WHERE class_id = ?").bind(id).run();
      const tables = [
        "enrollments",
        "reviews",
        "chat_messages",
        "class_notices",
        "coupons",
        "class_participants",
        "class_boards",
        "user_passes"
      ];
      for (const table of tables) {
        try {
          await db.prepare(`DELETE FROM ${table} WHERE class_id = ?`).bind(id).run();
        } catch (e) {
          console.warn(`[API cleanup] Skipped ${table}:`, e.message);
        }
      }
      await db.prepare("UPDATE contacts SET source_class_id = NULL WHERE source_class_id = ?").bind(id).run();
      const result = await db.prepare("DELETE FROM classes WHERE id = ?").bind(id).run();
      if (result.meta.changes === 0) {
        return json(request, env, { success: false, error: "\uC0AD\uC81C\uD560 \uD074\uB798\uC2A4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      }
      return json(request, env, {
        success: true,
        message: "\uD074\uB798\uC2A4\uC640 \uBAA8\uB4E0 \uC5F0\uAD00 \uB370\uC774\uD130\uAC00 \uC601\uAD6C\uC801\uC73C\uB85C \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
        id
      });
    } catch (error) {
      return json(request, env, { success: false, error: "\uC601\uAD6C \uC0AD\uC81C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", detail: error.message }, { status: 500 });
    }
  }
  return json(request, env, { success: false, error: "Method not allowed" }, { status: 405 });
}
__name(onRequest18, "onRequest");

// api/test.js
async function onRequest19(context) {
  const db = context.env.DB;
  try {
    const { results } = await db.prepare("SELECT * FROM classes").all();
    return Response.json({ success: true, data: results });
  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
}
__name(onRequest19, "onRequest");

// api/_middleware.js
async function onRequest20(context) {
  const { request, env, next } = context;
  if (request.method === "OPTIONS") {
    return options(request, env);
  }
  try {
    const response = await next();
    const headers = new Headers(response.headers);
    const corsHeaders = createCorsHeaders(request, env);
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.error("[Middleware Error]:", err);
    return json(request, env, {
      success: false,
      error: "\uC11C\uBC84 \uB0B4\uBD80 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: err.message
    }, { status: 500 });
  }
}
__name(onRequest20, "onRequest");

// _middleware.js
async function onRequest21(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return options(request, env);
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  const corsHeaders = createCorsHeaders(request, env);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(onRequest21, "onRequest");

// ../.wrangler/tmp/pages-rITuoy/functionsRoutes-0.6902497629325166.mjs
var routes = [
  {
    routePath: "/api/admin/classes",
    mountPath: "/api/admin",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/admin/recommendations",
    mountPath: "/api/admin",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/admin/stats",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/admin/stats",
    mountPath: "/api/admin",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/auth/check-username",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/auth/check-username",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth/register",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions6]
  },
  {
    routePath: "/api/auth/register",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/auth/reset-password-confirm",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions7]
  },
  {
    routePath: "/api/auth/reset-password-confirm",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/auth/reset-password-request",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions8]
  },
  {
    routePath: "/api/auth/reset-password-request",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions9]
  },
  {
    routePath: "/api/classes/create",
    mountPath: "/api/classes",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions10]
  },
  {
    routePath: "/api/classes/create",
    mountPath: "/api/classes",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/classes/members",
    mountPath: "/api/classes",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/classes/members",
    mountPath: "/api/classes",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions11]
  },
  {
    routePath: "/api/classes/update",
    mountPath: "/api/classes",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions12]
  },
  {
    routePath: "/api/classes/update",
    mountPath: "/api/classes",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/passes/issue",
    mountPath: "/api/passes",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/passes/issue",
    mountPath: "/api/passes",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions13]
  },
  {
    routePath: "/api/passes/issue",
    mountPath: "/api/passes",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/user-passes/use",
    mountPath: "/api/user-passes",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions14]
  },
  {
    routePath: "/api/user-passes/use",
    mountPath: "/api/user-passes",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/users/search",
    mountPath: "/api/users",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/users/search",
    mountPath: "/api/users",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions15]
  },
  {
    routePath: "/api/admin/class-analytics",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/admin/classes",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/admin/coupons",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/admin/financial",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/admin/menus",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/admin/operators",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/admin/orders",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/admin/recommendations",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/admin/settlements",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/api/admin/transactions",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/api/system/history",
    mountPath: "/api/system",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/api/users/:id",
    mountPath: "/api/users",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/users/:id",
    mountPath: "/api/users",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/users/:id",
    mountPath: "/api/users",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions16]
  },
  {
    routePath: "/api/users/:id",
    mountPath: "/api/users",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/chat/:id",
    mountPath: "/api/chat",
    method: "",
    middlewares: [],
    modules: [onRequest12]
  },
  {
    routePath: "/api/classes/:id",
    mountPath: "/api/classes",
    method: "",
    middlewares: [],
    modules: [onRequest13]
  },
  {
    routePath: "/api/dm/:path*",
    mountPath: "/api/dm",
    method: "",
    middlewares: [],
    modules: [onRequest14]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions17]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/class-notices",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/class-notices",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/contacts",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete3]
  },
  {
    routePath: "/api/contacts",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/contacts",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions18]
  },
  {
    routePath: "/api/contacts",
    mountPath: "/api",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch2]
  },
  {
    routePath: "/api/contacts",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/coupons",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete4]
  },
  {
    routePath: "/api/coupons",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet11]
  },
  {
    routePath: "/api/coupons",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions19]
  },
  {
    routePath: "/api/coupons",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/dm",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet12]
  },
  {
    routePath: "/api/dm",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions20]
  },
  {
    routePath: "/api/dm",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/enrollments",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet13]
  },
  {
    routePath: "/api/enrollments",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions21]
  },
  {
    routePath: "/api/enrollments",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/faqs",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete5]
  },
  {
    routePath: "/api/faqs",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet14]
  },
  {
    routePath: "/api/faqs",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions22]
  },
  {
    routePath: "/api/faqs",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/friends",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet15]
  },
  {
    routePath: "/api/friends",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions23]
  },
  {
    routePath: "/api/friends",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/gatherings",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet16]
  },
  {
    routePath: "/api/gatherings",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions24]
  },
  {
    routePath: "/api/gatherings",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/group-chats",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet17]
  },
  {
    routePath: "/api/group-chats",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions25]
  },
  {
    routePath: "/api/group-chats",
    mountPath: "/api",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch3]
  },
  {
    routePath: "/api/group-chats",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
  },
  {
    routePath: "/api/inquiries",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet18]
  },
  {
    routePath: "/api/inquiries",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions26]
  },
  {
    routePath: "/api/inquiries",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost18]
  },
  {
    routePath: "/api/notices",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete6]
  },
  {
    routePath: "/api/notices",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet19]
  },
  {
    routePath: "/api/notices",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions27]
  },
  {
    routePath: "/api/notices",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost19]
  },
  {
    routePath: "/api/recommendations",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions28]
  },
  {
    routePath: "/api/reviews",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet20]
  },
  {
    routePath: "/api/reviews",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions29]
  },
  {
    routePath: "/api/reviews",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost20]
  },
  {
    routePath: "/api/site-settings",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions30]
  },
  {
    routePath: "/api/user-chats",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete7]
  },
  {
    routePath: "/api/user-chats",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet21]
  },
  {
    routePath: "/api/user-chats",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions31]
  },
  {
    routePath: "/api/user-chats",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost21]
  },
  {
    routePath: "/api/user-passes",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet22]
  },
  {
    routePath: "/api/user-passes",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions32]
  },
  {
    routePath: "/api/users",
    mountPath: "/api/users",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet23]
  },
  {
    routePath: "/api/users",
    mountPath: "/api/users",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions33]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api/admin",
    method: "",
    middlewares: [onRequest17],
    modules: []
  },
  {
    routePath: "/api/classes",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest18]
  },
  {
    routePath: "/api/recommendations",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest15]
  },
  {
    routePath: "/api/site-settings",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest16]
  },
  {
    routePath: "/api/test",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest19]
  },
  {
    routePath: "/api",
    mountPath: "/api",
    method: "",
    middlewares: [onRequest20],
    modules: []
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest21],
    modules: []
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options2) {
  if (options2 === void 0) {
    options2 = {};
  }
  var tokens = lexer(str);
  var _a = options2.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options2.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options2) {
  var keys = [];
  var re = pathToRegexp(str, keys, options2);
  return regexpToFunction(re, keys, options2);
}
__name(match, "match");
function regexpToFunction(re, keys, options2) {
  if (options2 === void 0) {
    options2 = {};
  }
  var _a = options2.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options2) {
  return options2 && options2.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options2) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options2).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options2));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options2) {
  return tokensToRegexp(parse(path, options2), keys, options2);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options2) {
  if (options2 === void 0) {
    options2 = {};
  }
  var _a = options2.strict, strict = _a === void 0 ? false : _a, _b = options2.start, start = _b === void 0 ? true : _b, _c = options2.end, end = _c === void 0 ? true : _c, _d = options2.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options2.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options2.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options2.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options2));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options2) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options2);
  return stringToRegexp(path, keys, options2);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-ydC2jv/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-ydC2jv/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.17884731519192487.mjs.map
