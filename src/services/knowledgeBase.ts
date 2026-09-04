// src/services/knowledgeBase.ts
// Admin-managed knowledge base: document text is chunked, embedded, and
// stored in a dedicated Chroma collection, then retrieved by similarity to
// the user's message and injected into the chat prompt (see messages.ts).
// Postgres (knowledge_base_documents) only tracks metadata for admin
// listing/management — the actual chunks and vectors live in Chroma, keyed
// as "<documentId>:<chunkIndex>".
import { config } from "../config/env";
import { logger } from "../config/logger";
import { getRawChromaCollection } from "./chroma";
import { embed } from "./ollama";

const CHUNK_SIZE = 1200; // characters
const CHUNK_OVERLAP = 150;

// nomic-embed-text (the default embed model) is trained on task-prefixed
// inputs and retrieves poorly without them — a genuinely relevant
// question/passage pair scores ~0.4 cosine similarity with no prefix at all,
// indistinguishable from noise. Documents and queries need different
// prefixes since retrieval here is asymmetric (a question vs. a passage),
// which is why this collection embeds explicitly instead of letting Chroma
// auto-embed via a single shared embedding function (see getRawChromaCollection).
const DOCUMENT_PREFIX = "search_document: ";
const QUERY_PREFIX = "search_query: ";

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

function getCollection() {
  return getRawChromaCollection(config.chromaKnowledgeBaseCollectionName);
}

type ChunkMetadata = { documentId: string; title: string; source: string };

// Upserts by id, so calling this again for the same documentId (e.g. the
// daily digest job re-running) replaces the old chunks for that document
// as long as the new chunk count is >= the old one — callers that might
// shrink the chunk count should delete first.
export async function upsertDocumentChunks(
  documentId: string,
  title: string,
  source: string,
  text: string,
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const collection = await getCollection();
  const embeddings = await Promise.all(chunks.map((c) => embed(DOCUMENT_PREFIX + c)));
  const metadatas: ChunkMetadata[] = chunks.map(() => ({ documentId, title, source }));

  await collection.upsert({
    ids: chunks.map((_, i) => `${documentId}:${i}`),
    documents: chunks,
    embeddings,
    metadatas,
  });

  return chunks.length;
}

export async function deleteDocumentChunks(documentId: string, chunkCount: number): Promise<void> {
  if (chunkCount <= 0) return;
  const collection = await getCollection();
  await collection.delete({
    ids: Array.from({ length: chunkCount }, (_, i) => `${documentId}:${i}`),
  });
}

export type KnowledgeBaseMatch = { text: string; title: string; source: string };

export async function queryKnowledgeBase(userMessage: string): Promise<KnowledgeBaseMatch[]> {
  try {
    const collection = await getCollection();
    const queryEmbedding = await embed(QUERY_PREFIX + userMessage);

    const result = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: config.knowledgeBaseTopK,
      include: ["distances", "documents", "metadatas"],
    });

    const docs = result.documents[0] ?? [];
    const distances = result.distances[0] ?? [];
    const metadatas = result.metadatas[0] ?? [];

    const matches: KnowledgeBaseMatch[] = [];
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const distance = distances[i];
      if (doc == null || distance == null) continue;

      const similarity = 1 - distance;
      if (similarity < config.knowledgeBaseSimilarityThreshold) continue;

      const meta = metadatas[i] as unknown as ChunkMetadata | null;
      matches.push({ text: doc, title: meta?.title ?? "Untitled", source: meta?.source ?? "upload" });
    }

    return matches;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Knowledge base query failed");
    return [];
  }
}

export function formatKnowledgeBaseMatches(matches: KnowledgeBaseMatch[]): string {
  return matches.map((m, i) => `${i + 1}. [${m.title}] ${m.text}`).join("\n\n");
}
