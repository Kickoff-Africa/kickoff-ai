// src/services/searchCache.ts
// Semantic cache for crawled web search results, backed by a self-hosted
// ChromaDB instance. Unlike an exact-match cache, this matches queries that
// are worded differently but mean the same thing (e.g. "who's the current
// president of Nigeria" vs "current Nigerian president"), so paraphrased
// questions still hit the cache instead of triggering a fresh crawl.
import { config } from "../config/env";
import { logger } from "../config/logger";
import { getChromaCollection } from "./chroma";
import type { WebSearchResult } from "./webSearch";

type CachedMetadata = {
  source: string;
  results: string; // JSON-encoded WebSearchResult[] (Chroma metadata values must be scalars)
  createdAt: string; // ISO timestamp
};

function getCollection() {
  return getChromaCollection(config.chromaCollectionName);
}

function normalizeQueryKey(searchQuery: string): string {
  return searchQuery.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getCachedResults(
  searchQuery: string,
): Promise<WebSearchResult[] | null> {
  const collection = await getCollection();

  const result = await collection.query({
    queryTexts: [searchQuery],
    nResults: 1,
    include: ["distances", "metadatas"],
  });

  const distance = result.distances[0]?.[0];
  const metadata = result.metadatas[0]?.[0] as CachedMetadata | null;
  if (distance == null || !metadata) return null;

  const similarity = 1 - distance;
  if (similarity < config.webSearchCacheSimilarityThreshold) return null;

  const ageHours =
    (Date.now() - new Date(metadata.createdAt).getTime()) / (1000 * 60 * 60);
  if (ageHours > config.webSearchCacheTtlHours) return null;

  logger.debug(
    { searchQuery, similarity, ageHours, source: metadata.source },
    "Web search semantic cache hit",
  );

  return JSON.parse(metadata.results) as WebSearchResult[];
}

export async function setCachedResults(
  searchQuery: string,
  source: string,
  results: WebSearchResult[],
): Promise<void> {
  const collection = await getCollection();

  const metadata: CachedMetadata = {
    source,
    results: JSON.stringify(results),
    createdAt: new Date().toISOString(),
  };

  await collection.upsert({
    ids: [normalizeQueryKey(searchQuery)],
    documents: [searchQuery],
    metadatas: [metadata],
  });
}
