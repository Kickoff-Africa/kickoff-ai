// src/services/ollamaQueue.ts
// Serializes every call to the Ollama host through one shared queue. The
// host is a single CPU-bound instance that can only usefully run one
// generation at a time — letting requests hit it concurrently doesn't add
// throughput, it makes every in-flight request slower and has been observed
// to OOM-kill the model process outright. Queuing trades that failure mode
// for a predictable wait.
//
// p-queue is ESM-only, so it's loaded via dynamic import from this
// otherwise-CommonJS project (see also unpdf/mammoth in fileProcessor.ts).
import type PQueue from "p-queue";
import { config } from "../config/env";

let queuePromise: Promise<PQueue> | null = null;

function getQueue(): Promise<PQueue> {
  if (!queuePromise) {
    queuePromise = import("p-queue").then(
      ({ default: PQueueCtor }) => new PQueueCtor({ concurrency: config.ollamaMaxConcurrency }),
    );
  }
  return queuePromise;
}

export async function withOllamaQueue<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getQueue();
  return queue.add(task) as Promise<T>;
}
