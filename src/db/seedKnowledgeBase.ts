import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database';
import { upsertDocumentChunks, deleteDocumentChunks } from '../services/knowledgeBase';

// Seeds repo-tracked documents (knowledge/*.txt) into the knowledge base.
// Idempotent: each document has a stable slug, and re-running replaces its
// previous chunks, so this is also how to refresh a document after editing
// the file. Requires the same env as the server (DATABASE_URL, CHROMA_URL,
// OLLAMA_BASE_URL for embeddings).
const DOCUMENTS = [
  {
    slug: 'faan-passenger-faq',
    title: 'FAAN Passenger FAQ (Customer Service Department)',
    file: 'faan-passenger-faq.txt',
  },
];

async function seedKnowledgeBase(): Promise<void> {
  try {
    for (const doc of DOCUMENTS) {
      const text = fs.readFileSync(path.join(__dirname, '../../knowledge', doc.file), 'utf8');

      const existing = await pool.query(
        `SELECT id, chunk_count FROM knowledge_base_documents WHERE slug = $1`,
        [doc.slug],
      );
      const documentId: string = existing.rows[0]?.id ?? randomUUID();
      if (existing.rows[0]) {
        await deleteDocumentChunks(documentId, existing.rows[0].chunk_count);
      }

      const chunkCount = await upsertDocumentChunks(documentId, doc.title, 'upload', text);

      await pool.query(
        `INSERT INTO knowledge_base_documents (id, title, filename, source, slug, chunk_count)
         VALUES ($1, $2, $3, 'upload', $4, $5)
         ON CONFLICT (slug) DO UPDATE
           SET title = EXCLUDED.title, filename = EXCLUDED.filename,
               chunk_count = EXCLUDED.chunk_count, updated_at = NOW()`,
        [documentId, doc.title, doc.file, doc.slug, chunkCount],
      );
      console.log(`Seeded "${doc.title}" (${chunkCount} chunks, id ${documentId})`);
    }
  } finally {
    await pool.end();
  }
}

seedKnowledgeBase().catch((err) => {
  console.error('Knowledge base seed failed:', err);
  process.exit(1);
});
