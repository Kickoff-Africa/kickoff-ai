-- Meter access by tokens consumed instead of wall-clock generation time.
-- "Seconds of generation time" stopped being a meaningful budget once chat
-- moved to Ollama's fast cloud API (see src/services/ollama.ts) — a cloud
-- model can burn through a huge number of tokens in very little wall-clock
-- time, so time was no longer tracking actual resource/cost consumption.
-- Tokens are already recorded per message (messages.tokens_used), so this
-- just extends that same unit to the access-window budget.
ALTER TABLE access_windows RENAME COLUMN seconds_used TO tokens_used;
ALTER TABLE access_windows RENAME COLUMN extension_seconds TO extension_tokens;

ALTER TABLE access_extension_requests RENAME COLUMN requested_hours TO requested_tokens;

-- The old CHECK constraint (requested_hours IN (1, 2, 3)) still references
-- the renamed column by whatever name Postgres auto-generated it under —
-- looked up dynamically rather than guessed, so this doesn't silently leave
-- a stale constraint (or worse, collide with the new one below) if the
-- generated name doesn't match the obvious guess.
DO $$
DECLARE
  old_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO old_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'access_extension_requests'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%requested_tokens%';

  IF old_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE access_extension_requests DROP CONSTRAINT %I', old_constraint_name);
  END IF;
END $$;

-- Extension tiers: +50k / +100k / +150k tokens (was +1h / +2h / +3h).
ALTER TABLE access_extension_requests
  ADD CONSTRAINT access_extension_requests_requested_tokens_check
  CHECK (requested_tokens IN (50000, 100000, 150000));
