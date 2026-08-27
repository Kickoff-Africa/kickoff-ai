-- The exact-match search cache moved to a semantic cache in ChromaDB
-- (see src/services/searchCache.ts), so the Postgres table is no longer used.
DROP TABLE IF EXISTS web_search_cache;
