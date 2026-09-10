// src/services/ollama.ts
import { config } from "../config/env";
import { withOllamaQueue, withOllamaEmbedQueue } from "./ollamaQueue";

const OLLAMA_BASE_URL = config.ollamaBaseUrl;
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
// represents — callers build that signal (see postOllama and chatStream)
// since a quick call only needs a timeout, while chatStream also needs to
// react to a caller-initiated cancellation.
async function fetchOllamaOnce(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
async function postOllamaWithRetry(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  let lastError: string;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
    }

    try {
      return await fetchOllamaOnce(path, body, signal);
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

// Queued wrapper for quick, fixed-size calls (title generation). Safe to let
// callers read the response body after this resolves — for a stream:false
// request Ollama has already finished all generation by the time headers
// come back, so no meaningful work happens outside the queue.
async function postOllama(path: string, body: unknown): Promise<Response> {
  return withOllamaQueue(() =>
    postOllamaWithRetry(path, body, AbortSignal.timeout(config.ollamaQuickTimeoutMs)),
  );
}

// Same as postOllama, but through the separate embed queue lane (see
// ollamaQueue.ts) instead of the chat-generation one.
async function postOllamaEmbed(path: string, body: unknown): Promise<Response> {
  return withOllamaEmbedQueue(() =>
    postOllamaWithRetry(path, body, AbortSignal.timeout(config.ollamaQuickTimeoutMs)),
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
    const res = await postOllama("/api/generate", {
      model: simpleModel(),
      prompt:
        `Summarize the following conversation as a short title ` +
        `(max 6 words, no ending punctuation, no quotes). ` +
        `Respond with ONLY the title, nothing else.\n\n` +
        `Conversation:\n${transcript}\n\nTitle:`,
      stream: false,
      options: { temperature: 0.2, num_predict: 20 },
    });

    const data = (await res.json()) as { response?: string };
    const title = (data.response || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, TITLE_CHAR_LIMIT);

    return title || null;
  } catch (err) {
    console.error(
      "Ollama generateConversationTitle failed",
      (err as Error).message,
    );
    return null;
  }
}

// ---------- chatStream ----------
// Streams the response so the caller can forward tokens to the client as
// they're generated, instead of the whole request blocking on one giant
// wait. The entire read loop — not just the initial fetch — runs inside the
// queue: for a streaming response, Ollama keeps using CPU for as long as the
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

  const chosenModel = options?.imageBase64 ? visionModel() : model;
  const cancelSignal = options?.signal;

  return withOllamaQueue(async () => {
    // Two independent reasons a request can be cut short: the hard timeout
    // (a real failure — the host is wedged), and a caller-initiated cancel
    // (the user hit "stop" — not a failure at all). Both raise AbortError,
    // so cancelSignal.aborted is checked below to tell them apart.
    const timeoutSignal = AbortSignal.timeout(config.ollamaChatTimeoutMs);
    const signal = cancelSignal ? AbortSignal.any([timeoutSignal, cancelSignal]) : timeoutSignal;

    const res = await postOllamaWithRetry(
      "/api/chat",
      {
        model: chosenModel,
        messages: ollamaMessages,
        stream: true,
        // Ollama's default temperature (0.8) favors variety over grounded,
        // literal answers — fine for creative writing, but it makes small
        // models more prone to rambling/incoherence on ordinary factual
        // questions. 0.35 trades away some of that variety for consistency,
        // without the latency cost a bigger model would carry.
        options: { temperature: 0.35, num_predict: 4096 },
      },
      signal,
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
  });
}
