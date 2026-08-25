// src/services/ollama.ts
import { config } from "../config/env";

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

// Makes one request to Ollama, retrying once on network error or non-2xx
// response (e.g. the model server was killed and is still restarting).
async function postOllama(path: string, body: unknown): Promise<Response> {
  let lastError: string;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) return res;

      lastError = `${res.status} ${await res.text()}`;
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

// ---------- chat ----------
type ChatMessage = { role: "user" | "assistant"; content: string };

export async function chat(
  messages: ChatMessage[],
  model: string,
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

  const res = await postOllama("/api/chat", {
    model: chosenModel,
    messages: ollamaMessages,
    stream: false,
    options: { num_predict: 4096 },
  });

  const data = (await res.json()) as {
    message?: { role: string; content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    content: data.message?.content ?? "",
    tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
  };
}
