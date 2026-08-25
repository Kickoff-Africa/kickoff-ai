// src/services/ollama.ts
import { config } from "../config/env";

const OLLAMA_BASE_URL = config.ollamaBaseUrl;

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

// ---------- classifyComplexity ----------
export async function classifyComplexity(message: string): Promise<Complexity> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
  } catch (err) {
    console.error(
      "Ollama classifyComplexity network error",
      (err as Error).message,
    );
    return "moderate";
  }

  if (!res.ok) {
    console.error(
      "Ollama classifyComplexity failed",
      res.status,
      await res.text(),
    );
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

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: chosenModel,
      messages: ollamaMessages,
      stream: false,
      options: { num_predict: 4096 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Ollama chat failed", res.status, errText);
    throw new Error(`Ollama chat failed: ${res.status} 
  ${errText}`);
  }

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
