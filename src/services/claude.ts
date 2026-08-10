import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/env'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

export async function classifyComplexity(message: string): Promise<"simple" | "moderate" | "complex"> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 10,
    system: "Classify the complexity of the following user message as exactly one word: simple, moderate, or complex. Simple = factual questions, greetings, basic tasks. Moderate = analysis, comparison, multi-step reasoning. Complex = creative writing, deep research, expert-level problems. Respond with ONLY that single word, nothing else.",
    messages: [{ role: "user", content: message }]
  })
  const text = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'moderate'
  if (text === 'simple' || text === 'moderate' || text === 'complex') return text
  return 'moderate'  // safe default
}

export async function ollamaChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      stream: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ollama request failed: ${response.status} ${body}`)
  }

  const data = await response.json() as {
    message: { role: string; content: string }
    prompt_eval_count?: number
    eval_count?: number
  }

  const content = data.message.content
  const tokensUsed = (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
  return { content, tokensUsed }
}
