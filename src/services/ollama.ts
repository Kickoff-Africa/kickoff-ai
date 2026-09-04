// src/services/ollama.ts
import { config } from "../config/env";
import { withOllamaQueue } from "./ollamaQueue";

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

// One request attempt, bounded by a hard deadline so a wedged request can't
// hold its queue slot — and therefore block every other user — forever.
async function fetchOllamaOnce(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }

  return res;
}

// Retries once on network error, timeout, or non-2xx response (e.g. the
// model server was killed and is still restarting). Not queued — callers
// decide the queuing boundary, since a streaming caller needs the queue slot
// held well past the point this function returns.
async function postOllamaWithRetry(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  let lastError: string;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchOllamaOnce(path, body, timeoutMs);
    } catch (err) {
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

// Queued wrapper for quick, fixed-size calls (classify/embed/title). Safe to
// let callers read the response body after this resolves — for a
// stream:false request Ollama has already finished all generation by the
// time headers come back, so no meaningful work happens outside the queue.
async function postOllama(path: string, body: unknown): Promise<Response> {
  return withOllamaQueue(() => postOllamaWithRetry(path, body, config.ollamaQuickTimeoutMs));
}

// ---------- classifyComplexity ----------
export async function classifyComplexity(message: string): Promise<Complexity> {
  let res: Response;
  try {
    res = await postOllama("/api/generate", {
      model: simpleModel(),
      prompt:
        `Classify the complexity of the following user
  message as exactly one word: ` +
        `simple, moderate, or complex. Simple = factual
  questions, greetings, basic tasks. ` +
        `Moderate = analysis, comparison, multi-step
  reasoning. ` +
        `Complex = creative writing, deep research,
  expert-level problems. ` +
        `Respond with ONLY that single word, nothing
  else.\n\nMessage: ${message}`,
      stream: false,
      options: { temperature: 0, num_predict: 5 },
    });
  } catch (err) {
    console.error("Ollama classifyComplexity failed", (err as Error).message);
    return "moderate";
  }

  const data = (await res.json()) as { response?: string };
  const text = (data.response || "").trim().toLowerCase();
  if (text === "simple" || text === "moderate" || text === "complex")
    return text;
  return "moderate";
}

// ---------- embed ----------
export async function embed(text: string): Promise<number[]> {
  const res = await postOllama("/api/embed", {
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
type ChatMessage = { role: "user" | "assistant"; content: string };

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
  options?: { imageBase64?: string; imageMimeType?: string },
): Promise<{ content: string; tokensUsed: number }> {
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

  return withOllamaQueue(async () => {
    const res = await postOllamaWithRetry(
      "/api/chat",
      { model: chosenModel, messages: ollamaMessages, stream: true, options: { num_predict: 4096 } },
      config.ollamaChatTimeoutMs,
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

    return { content: fullContent, tokensUsed: promptEvalCount + evalCount };
  });
}
