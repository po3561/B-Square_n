PRAGMA foreign_keys = ON;

UPDATE classes
SET is_public = 1
WHERE is_public IS NULL;

UPDATE chat_messages
SET is_pinned = 0
WHERE is_pinned IS NULL;

UPDATE dm_messages
SET is_pinned = 0
WHERE is_pinned IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_class_pinned_created
  ON chat_messages(class_id, is_pinned, created_at);

CREATE INDEX IF NOT EXISTS idx_dm_messages_room_type_pinned_created
  ON dm_messages(room_id, room_type, is_pinned, created_at);

CREATE INDEX IF NOT EXISTS idx_user_chats_user_type_last_message
  ON user_chats(user_id, type, last_message_at);

CREATE INDEX IF NOT EXISTS idx_classes_public_created
  ON classes(is_public, created_at);

CREATE INDEX IF NOT EXISTS idx_classes_category_created
  ON classes(category, created_at);

CREATE INDEX IF NOT EXISTS idx_classes_creator_created
  ON classes(creator_id, created_at);
