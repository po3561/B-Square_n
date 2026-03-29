PRAGMA foreign_keys = ON;

UPDATE chat_messages
SET updated_at = created_at
WHERE updated_at IS NULL;

UPDATE dm_messages
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_class_updated
  ON chat_messages(class_id, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_class_pinned_updated
  ON chat_messages(class_id, is_pinned, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_dm_messages_class
  ON dm_messages(class_id);

CREATE INDEX IF NOT EXISTS idx_dm_messages_room_type_updated
  ON dm_messages(room_id, room_type, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_dm_messages_room_type_pinned_updated
  ON dm_messages(room_id, room_type, is_pinned, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_user_chats_user_type_last_message_room
  ON user_chats(user_id, type, last_message_at, room_id);

CREATE INDEX IF NOT EXISTS idx_user_chats_room
  ON user_chats(room_id);
