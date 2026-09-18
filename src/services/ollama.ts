// src/services/ollama.ts
import { config } from "../config/env";
import { logger } from "../config/logger";
import { withOllamaQueue, withOllamaEmbedQueue } from "./ollamaQueue";

const RETRY_DELAY_MS = 500;

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

type Complexity = "simple" | "moderate" | "complex";

function simpleModel(): string {
  return config.ollamaSimpleModel;
}
function moderateModel(): string {
  return config.ollamaModerateModel;
}
function complexModel(): string {
  return config.ollamaComplexModel;
}
function visionModel(): string {
  return config.ollamaVisionModel;
}

export function getModelForComplexity(complexity: Complexity): string {
  switch (complexity) {
    case "simple":
      return simpleModel();
    case "moderate":
      return moderateModel();
    case "complex":
      return complexModel();
    default:
      return moderateModel();
  }
}

// One request attempt, bounded by whatever deadline/cancellation `signal`
// represents — callers build that signal (see postOllama* helpers and
// chatStream) since a quick call only needs a timeout, while chatStream also
// needs to react to a caller-initiated cancellation. `apiKey` is only set for
// calls to Ollama's cloud API — the self-hosted box takes no auth.
async function fetchOllamaOnce(
  baseUrl: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
  apiKey?: string,
): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }

  return res;
}

// Retries once on network error, timeout, or non-2xx response (e.g. the
// model server was killed and is still restarting) — but not if `signal` is
// already aborted, since that means the caller cancelled and a retry would
// just waste the backoff delay repeating a request nobody wants anymore.
// Not queued — callers decide the queuing boundary, since a streaming caller
// needs the queue slot held well past the point this function returns.
async function postOllamaWithRetry(
  baseUrl: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
  apiKey?: string,
): Promise<Response> {
  let lastError: string;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
    }

    try {
      return await fetchOllamaOnce(baseUrl, path, body, signal, apiKey);
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = (err as Error).message;
    }

    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new OllamaUnavailableError(
    `Ollama request to ${path} failed after retry: ${lastError!}`,
  );
}

// Queued wrapper for quick, fixed-size calls to the self-hosted box (embed).
// Safe to let callers read the response body after this resolves — for a
// stream:false request Ollama has already finished all generation by the
// time headers come back, so no meaningful work happens outside the queue.
async function postOllamaEmbed(path: string, body: unknown): Promise<Response> {
  return withOllamaEmbedQueue(() =>
    postOllamaWithRetry(config.ollamaBaseUrl, path, body, AbortSignal.timeout(config.ollamaQuickTimeoutMs)),
  );
}

// Unqueued: Ollama's cloud API is a hosted service, not the single CPU-bound
// self-hosted box, so it doesn't need the queueing that embed/vision calls do.
async function postOllamaCloud(path: string, body: unknown): Promise<Response> {
  return postOllamaWithRetry(
    config.ollamaCloudBaseUrl,
    path,
    body,
    AbortSignal.timeout(config.ollamaQuickTimeoutMs),
    config.ollamaApiKey,
  );
}

// ---------- embed ----------
export async function embed(text: string): Promise<number[]> {
  const res = await postOllamaEmbed("/api/embed", {
    model: config.ollamaEmbedModel,
    input: text,
  });

  const data = (await res.json()) as { embeddings?: number[][] };
  const embedding = data.embeddings?.[0];
  if (!embedding) {
    throw new OllamaUnavailableError("Ollama embed returned no embedding");
  }
  return embedding;
}

// ---------- generateConversationTitle ----------
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const TITLE_TRANSCRIPT_CHAR_LIMIT = 2000;
const TITLE_CHAR_LIMIT = 80;

export async function generateConversationTitle(
  messages: ChatMessage[],
): Promise<string | null> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")
    .slice(0, TITLE_TRANSCRIPT_CHAR_LIMIT);

  try {
    const res = await postOllamaCloud("/api/generate", {
      model: simpleModel(),
      prompt:
        `Summarize the following conversation as a short title ` +
        `(max 6 words, no ending punctuation, no quotes). ` +
        `Respond with ONLY the title, nothing else.\n\n` +
        `Conversation:\n${transcript}\n\nTitle:`,
      stream: false,
      // gpt-oss:120b-cloud (the default simple model) is a reasoning model:
      // it spends tokens on a hidden "thinking" pass before writing the
      // actual `response`, and that pass counts against num_predict same as
      // the response does. At 20 it never got past thinking — `response`
      // came back "" every time (confirmed directly against the API: 20
      // tokens all consumed by `thinking`, done_reason "length"). 300 leaves
      // enough headroom for a typical thinking pass plus a short title;
      // `think: false` was tried first but this endpoint ignores it for
      // /api/generate and still burns the budget on thinking regardless.
      options: { temperature: 0.2, num_predict: 300 },
    });

    const data = (await res.json()) as { response?: string; done_reason?: string };
    const title = (data.response || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, TITLE_CHAR_LIMIT);

    // Not an error — the request succeeded — but an empty response with no
    // exception thrown would otherwise fail completely silently (falling
    // back to the truncated-message title in messages.ts with no trace of
    // why). Worth a log line so a recurring version of the num_predict issue
    // above doesn't go unnoticed again.
    if (!title) {
      logger.warn({ doneReason: data.done_reason }, "Ollama generateConversationTitle got an empty response");
    }

    return title || null;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Ollama generateConversationTitle failed");
    return null;
  }
}

// ---------- chatStream ----------
// Streams the response so the caller can forward tokens to the client as
// they're generated, instead of the whole request blocking on one giant
// wait. Normal (text) chat runs on Ollama's cloud API and isn't queued; an
// image attachment routes to the self-hosted box's vision model instead,
// and does run through the chat queue — the entire read loop, not just the
// initial fetch, since that box keeps using CPU for as long as the response
// body is still being read, so the queue slot has to be held for the whole
// generation, not just until the connection opens.
export async function chatStream(
  messages: ChatMessage[],
  model: string,
  onDelta: (delta: string) => void,
  options?: { imageBase64?: string; imageMimeType?: string; signal?: AbortSignal },
): Promise<{ content: string; tokensUsed: number; cancelled: boolean }> {
  const ollamaMessages = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    if (isLast && m.role === "user" && options?.imageBase64) {
      return {
        role: m.role,
        content: m.content,
        images: [options.imageBase64],
      };
    }
    return { role: m.role, content: m.content };
  });

  const isVision = Boolean(options?.imageBase64);
  const chosenModel = isVision ? visionModel() : model;
  const cancelSignal = options?.signal;

  const runGeneration = async (): Promise<{ content: string; tokensUsed: number; cancelled: boolean }> => {
    // Two independent reasons a request can be cut short: the hard timeout
    // (a real failure — the host is wedged), and a caller-initiated cancel
    // (the user hit "stop" — not a failure at all). Both raise AbortError,
    // so cancelSignal.aborted is checked below to tell them apart.
    const timeoutSignal = AbortSignal.timeout(config.ollamaChatTimeoutMs);
    const signal = cancelSignal ? AbortSignal.any([timeoutSignal, cancelSignal]) : timeoutSignal;

    const res = await postOllamaWithRetry(
      isVision ? config.ollamaBaseUrl : config.ollamaCloudBaseUrl,
      "/api/chat",
      {
        model: chosenModel,
        messages: ollamaMessages,
        stream: true,
        // Ollama's default temperature (0.8) favors variety over grounded,
        // literal answers — fine for creative writing, but it makes models
        // more prone to rambling/incoherence on ordinary factual questions.
        // 0.35 trades away some of that variety for consistency.
        options: { temperature: 0.35, num_predict: 4096 },
      },
      signal,
      isVision ? undefined : config.ollamaApiKey,
    );

    if (!res.body) {
      throw new OllamaUnavailableError("Ollama chat stream had no response body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let promptEvalCount = 0;
    let evalCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Ollama streams newline-delimited JSON objects; a chunk boundary can
        // land mid-line, so buffer any trailing partial line until it's complete.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };

          if (chunk.message?.content) {
            fullContent += chunk.message.content;
            onDelta(chunk.message.content);
          }
          if (chunk.done) {
            promptEvalCount = chunk.prompt_eval_count ?? 0;
            evalCount = chunk.eval_count ?? 0;
          }
        }
      }
    } catch (err) {
      // A genuine cancellation ends the stream gracefully with whatever
      // content had already generated, matching how "stop generating"
      // behaves in most chat products — a timeout or network failure still
      // throws, since that's an actual error, not a user's choice to stop.
      if (cancelSignal?.aborted) {
        return { content: fullContent, tokensUsed: promptEvalCount + evalCount, cancelled: true };
      }
      throw err;
    }

    return { content: fullContent, tokensUsed: promptEvalCount + evalCount, cancelled: false };
  };

  return isVision ? withOllamaQueue(runGeneration) : runGeneration();
}
