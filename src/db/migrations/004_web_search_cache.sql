-- Local cache of crawled web search results, keyed by normalized query text,
-- so repeated/similar questions don't re-crawl a search engine every time.
CREATE TABLE IF NOT EXISTS web_search_cache (
  id          SERIAL PRIMARY KEY,
  query_key   TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL,
  results     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_search_cache_created_at ON web_search_cache(created_at);
