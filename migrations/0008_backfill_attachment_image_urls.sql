PRAGMA foreign_keys = ON;

UPDATE chat_messages
SET image_url = file_data
WHERE (image_url IS NULL OR TRIM(image_url) = '')
  AND file_data IS NOT NULL
  AND TRIM(file_data) <> '';

UPDATE dm_messages
SET image_url = file_data
WHERE (image_url IS NULL OR TRIM(image_url) = '')
  AND file_data IS NOT NULL
  AND TRIM(file_data) <> '';
