-- Store the user's original prompt separately from the full AI context content,
-- and record the Cloudinary attachment URL so past messages can display the file.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS user_prompt      TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT;
