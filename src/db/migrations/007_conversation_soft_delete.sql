-- Users can remove conversations from their own view, but admins retain
-- full visibility for audit purposes — so deletion is a flag, not a row
-- removal. Admin queries (see routes/admin.ts) are intentionally left
-- unfiltered by this column.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
