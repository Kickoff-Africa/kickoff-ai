// src/services/chroma.ts
// Shared ChromaDB client/collection setup used by both the web search cache
// and the knowledge base — both are semantic (embedding-based) stores backed
// by the same self-hosted Chroma instance, just different collections.
import { ChromaClient, type Collection, type EmbeddingFunction } from "chromadb";
import { config } from "../config/env";
import { embed } from "./ollama";

const client = new ChromaClient({ path: config.chromaUrl });

const ollamaEmbeddingFunction: EmbeddingFunction = {
  name: `ollama-${config.ollamaEmbedModel}`,
  async generate(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => embed(text)));
  },
  defaultSpace: () => "cosine",
};

const collections = new Map<string, Promise<Collection>>();

export function getChromaCollection(name: string): Promise<Collection> {
  let promise = collections.get(name);
  if (!promise) {
    promise = client.getOrCreateCollection({
      name,
      embeddingFunction: ollamaEmbeddingFunction,
    });
    collections.set(name, promise);
  }
  return promise;
}

// For collections where callers supply embeddings explicitly (e.g. the
// knowledge base, which needs different embedding prefixes for documents vs.
// queries — see nomic-embed-text's task-prefix convention). The registered
// embeddingFunction here is never actually invoked, since these callers
// always pass `embeddings`/`queryEmbeddings` directly — it's only registered
// because Chroma requires *some* embedding function at collection-creation
// time and otherwise falls back to a default one that isn't installed.
export function getRawChromaCollection(name: string): Promise<Collection> {
  let promise = collections.get(name);
  if (!promise) {
    promise = client.getOrCreateCollection({ name, embeddingFunction: ollamaEmbeddingFunction });
    collections.set(name, promise);
  }
  return promise;
}
