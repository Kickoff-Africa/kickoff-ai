// src/services/ollamaQueue.ts
// Two separate queues, not one. The host is a single CPU-bound instance that
// can only usefully run one *chat generation* at a time — concurrent full
// generations don't add throughput, they make every in-flight one slower and
// have been observed to OOM-kill the model process outright. That's real,
// and chatStream() stays strictly concurrency=1 for it.
//
// But embeddings (used for knowledge-base lookups) are a different kind of
// load: nomic-embed-text is a much smaller model, and we verified directly
// against this host that it stays resident in memory alongside a loaded chat
// model without evicting it (`ollama ps` showed both loaded at once). Also
// confirmed in production: with everything sharing one concurrency=1 queue,
// one user's knowledge-base lookup was blocked behind a *different* user's
// entire multi-minute chat generation before it could even start — most of
// that wait had nothing to do with the embed itself. Giving embeds their own
// higher-concurrency lane means a KB lookup no longer queues behind someone
// else's unrelated chat reply.
//
// p-queue is ESM-only, so it's loaded via dynamic import from this
// otherwise-CommonJS project (see also unpdf/mammoth in fileProcessor.ts).
import type PQueue from "p-queue";
import { config } from "../config/env";
import { dynamicImport } from "../utils/dynamicImport";

let chatQueuePromise: Promise<PQueue> | null = null;
let embedQueuePromise: Promise<PQueue> | null = null;

function getChatQueue(): Promise<PQueue> {
  if (!chatQueuePromise) {
    chatQueuePromise = dynamicImport("p-queue").then(
      ({ default: PQueueCtor }) => new PQueueCtor({ concurrency: config.ollamaMaxConcurrency }),
    );
  }
  return chatQueuePromise;
}

function getEmbedQueue(): Promise<PQueue> {
  if (!embedQueuePromise) {
    embedQueuePromise = dynamicImport("p-queue").then(
      ({ default: PQueueCtor }) => new PQueueCtor({ concurrency: config.ollamaEmbedConcurrency }),
    );
  }
  return embedQueuePromise;
}

// For classify/title (now just title) and chat generation — the resource
// that's genuinely scarce on this host.
export async function withOllamaQueue<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getChatQueue();
  return queue.add(task) as Promise<T>;
}

// For embedding calls only (see module comment for why this is separate).
export async function withOllamaEmbedQueue<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getEmbedQueue();
  return queue.add(task) as Promise<T>;
}
