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

export function getModelForComplexity(complexity: "simple" | "moderate" | "complex"): string {
  const models = {
    simple: "claude-haiku-4-5-20251001",
    moderate: "claude-haiku-4-5-20251001",
    complex: "claude-sonnet-4-6",
  }
  return models[complexity]
}

export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string
): Promise<{ content: string; tokensUsed: number }> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages
  })
  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  return { content, tokensUsed }
}
