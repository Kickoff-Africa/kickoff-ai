// src/services/llamacpp.ts
// llama.cpp backend (`llama-server`), selected with LLM_BACKEND=llamacpp.
// Same exported surface as the Ollama backend (embed / generateConversationTitle
// / chatStream) — ollama.ts dispatches here, so callers don't change.
//
// llama-server exposes an OpenAI-compatible API:
//   POST /v1/chat/completions  (chat, streamed as SSE, and title generation)
//   POST /v1/embeddings        (needs a server started with --embeddings and
//                               an embedding model, e.g. nomic-embed-text GGUF)
// Everything runs on your own box; nothing here calls an external service.
import { config } from "../config/env";
import { logger } from "../config/logger";
import { withOllamaQueue, withOllamaEmbedQueue } from "./ollamaQueue";
import { OllamaUnavailableError } from "./llmErrors";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const RETRY_DELAY_MS = 500;
const TITLE_TRANSCRIPT_CHAR_LIMIT = 2000;
const TITLE_CHAR_LIMIT = 80;

async function fetchOnce(baseUrl: string, path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.llamacppApiKey ? { Authorization: `Bearer ${config.llamacppApiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res;
}

// Retries once on network error / non-2xx (e.g. server still loading the
// model), unless the caller already cancelled.
async function postWithRetry(baseUrl: string, path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
    }
    try {
      return await fetchOnce(baseUrl, path, body, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = (err as Error).message;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  throw new OllamaUnavailableError(`llama.cpp request to ${path} failed after retry: ${lastError}`);
}

// ---------- embed ----------
export async function llamacppEmbed(text: string): Promise<number[]> {
  const res = await withOllamaEmbedQueue(() =>
    postWithRetry(
      config.llamacppEmbedBaseUrl,
      "/v1/embeddings",
      { model: config.ollamaEmbedModel, input: text },
      AbortSignal.timeout(config.ollamaQuickTimeoutMs),
    ),
  );
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new OllamaUnavailableError("llama.cpp embeddings returned no embedding");
  }
  return embedding;
}

// ---------- title ----------
export async function llamacppGenerateTitle(messages: ChatMessage[], model: string): Promise<string | null> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")
    .slice(0, TITLE_TRANSCRIPT_CHAR_LIMIT);

  try {
    const res = await withOllamaQueue(() =>
      postWithRetry(
        config.llamacppBaseUrl,
        "/v1/chat/completions",
        {
          model,
          messages: [
            {
              role: "user",
              content:
                `Summarize the following conversation as a short title ` +
                `(max 6 words, no ending punctuation, no quotes). ` +
                `Respond with ONLY the title, nothing else.\n\n` +
                `Conversation:\n${transcript}\n\nTitle:`,
            },
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 40,
        },
        AbortSignal.timeout(config.ollamaQuickTimeoutMs),
      ),
    );
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const title = (data.choices?.[0]?.message?.content ?? "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, TITLE_CHAR_LIMIT);
    if (!title) {
      logger.warn({ finishReason: data.choices?.[0]?.finish_reason }, "llama.cpp title generation got an empty response");
    }
    return title || null;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "llama.cpp generateConversationTitle failed");
    return null;
  }
}

// ---------- chat (streamed) ----------
export async function llamacppChatStream(
  messages: ChatMessage[],
  model: string,
  onDelta: (delta: string) => void,
  options?: { imageBase64?: string; imageMimeType?: string; signal?: AbortSignal },
): Promise<{ content: string; tokensUsed: number; cancelled: boolean }> {
  const isVision = Boolean(options?.imageBase64);
  const cancelSignal = options?.signal;

  const apiMessages = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    if (isLast && m.role === "user" && options?.imageBase64) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          {
            type: "image_url",
            image_url: { url: `data:${options.imageMimeType ?? "image/jpeg"};base64,${options.imageBase64}` },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const runGeneration = async (): Promise<{ content: string; tokensUsed: number; cancelled: boolean }> => {
    const timeoutSignal = AbortSignal.timeout(config.ollamaChatTimeoutMs);
    const signal = cancelSignal ? AbortSignal.any([timeoutSignal, cancelSignal]) : timeoutSignal;

    const res = await postWithRetry(
      isVision ? config.llamacppVisionBaseUrl : config.llamacppBaseUrl,
      "/v1/chat/completions",
      {
        model: isVision ? config.ollamaVisionModel : model,
        messages: apiMessages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.35,
        max_tokens: 4096,
      },
      signal,
    );

    if (!res.body) {
      throw new OllamaUnavailableError("llama.cpp chat stream had no response body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // SSE: events are "data: {json}" lines; chunk boundaries can fall
        // mid-line, so keep any trailing partial line buffered.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };

          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onDelta(delta);
          }
          if (chunk.usage) {
            tokensUsed =
              chunk.usage.total_tokens ??
              (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
          }
        }
      }
    } catch (err) {
      if (cancelSignal?.aborted) {
        return { content: fullContent, tokensUsed, cancelled: true };
      }
      throw err;
    }

    return { content: fullContent, tokensUsed, cancelled: false };
  };

  // Single CPU-bound box: one generation at a time (LLM concurrency env).
  return withOllamaQueue(runGeneration);
}
