-- Metadata for knowledge base documents. The extracted text chunks and their
-- embeddings live in ChromaDB (collection: knowledge_base), keyed by this
-- row's id as "<id>:<chunkIndex>"; this table is what the admin UI lists and
-- manages, and how the daily digest job knows what to overwrite each run.
CREATE TABLE knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  filename TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'daily_digest')),
  -- Stable key for daily_digest rows (one per topic) so the nightly job can
  -- upsert in place instead of accumulating a new row every run. NULL (and
  -- therefore unconstrained) for admin uploads.
  slug VARCHAR(100) UNIQUE,
  chunk_count INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_base_documents_source ON knowledge_base_documents(source);
