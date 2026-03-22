async function addColumnIfMissing(db, table, columnDefinition) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`).run();
  } catch (error) {
    if (!/duplicate column name/i.test(error.message || '')) {
      throw error;
    }
  }
}

export async function ensureRecommendationsSchema(db) {
  await addColumnIfMissing(db, 'recommendations', "description TEXT DEFAULT ''");
  await addColumnIfMissing(db, 'recommendations', "type TEXT DEFAULT 'regular'");
  await addColumnIfMissing(db, 'recommendations', "category TEXT DEFAULT 'all'");
}

export async function ensureDmMessagesSchema(db) {
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
  await addColumnIfMissing(db, 'contacts', 'name TEXT');
  await addColumnIfMissing(db, 'contacts', 'avatar TEXT');
  await addColumnIfMissing(db, 'contacts', 'source_class_id TEXT');
  await addColumnIfMissing(db, 'contacts', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'contacts', 'memo TEXT');
  await addColumnIfMissing(db, 'contacts', 'added_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}

export async function ensureGroupChatsSchema(db) {
  await addColumnIfMissing(db, 'group_chats', 'created_by TEXT');
  await addColumnIfMissing(db, 'group_chats', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}

export async function ensureChatMessagesSchema(db) {
  await addColumnIfMissing(db, 'chat_messages', 'user_name TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'user_avatar TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'type TEXT DEFAULT \'text\'');
  await addColumnIfMissing(db, 'chat_messages', 'image_url TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'file_name TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'file_size INTEGER');
  await addColumnIfMissing(db, 'chat_messages', 'file_data TEXT');
  await addColumnIfMissing(db, 'chat_messages', 'is_pinned INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'chat_messages', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}

export async function ensureGatheringsSchema(db) {
  await addColumnIfMissing(db, 'class_gatherings', 'description TEXT');
  await addColumnIfMissing(db, 'class_gatherings', 'location TEXT');
  await addColumnIfMissing(db, 'class_gatherings', "status TEXT DEFAULT 'open'");
  await addColumnIfMissing(db, 'class_gatherings', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}
