// src/services/ollamaQueue.ts
// Queues for the self-hosted Ollama box only (embeddings, and vision if that
// path is ever re-enabled — see ollama.ts). Normal chat/title generation now
// runs on Ollama's cloud API and isn't queued at all: it's a hosted service
// with its own concurrency handling, not a single CPU-bound box that OOMs
// under concurrent load the way the self-hosted one does.
//
// Two separate queues on that box, not one. It can only usefully run one
// *generation* at a time — concurrent full generations don't add throughput,
// they make every in-flight one slower and have been observed to OOM-kill
// the model process outright. That's real, and the vision path stays
// strictly concurrency=1 for it.
//
// But embeddings are a different kind of load: nomic-embed-text is a much
// smaller model, and we verified directly against this host that it stays
// resident in memory alongside a loaded generation model without evicting it
// (`ollama ps` showed both loaded at once). Giving embeds their own
// higher-concurrency lane means a KB lookup doesn't queue behind an
// in-flight vision generation on the same box.
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

// For the self-hosted box's generation slot (currently just the vision path).
export async function withOllamaQueue<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getChatQueue();
  return queue.add(task) as Promise<T>;
}

// For embedding calls only (see module comment for why this is separate).
export async function withOllamaEmbedQueue<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getEmbedQueue();
  return queue.add(task) as Promise<T>;
}
