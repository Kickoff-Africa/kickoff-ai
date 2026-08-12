import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function classifyComplexity(message: string): Promise<"simple" | "moderate" | "complex"> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 10,
    system: "Classify the complexity of the following user message as exactly one word: simple, moderate, or complex. Simple = factual questions, greetings, basic tasks. Moderate = analysis, comparison, multi-step reasoning. Complex = creative writing, deep research, expert-level problems. Respond with ONLY that single word, nothing else.",
    messages: [{ role: "user", content: message }]
  })
  const text = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'moderate'
  if (text === 'simple' || text === 'moderate' || text === 'complex') return text
  return 'moderate'
}

export function getModelForComplexity(complexity: "simple" | "moderate" | "complex"): string {
  return complexity === 'complex' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
}

export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
  options?: { imageBase64?: string; imageMimeType?: string }
): Promise<{ content: string; tokensUsed: number }> {
  // Build the last user message — with an image block if provided
  const lastMsg = messages[messages.length - 1]
  const history = messages.slice(0, -1)

  let lastContent: Anthropic.MessageParam['content']

  if (options?.imageBase64 && lastMsg.role === 'user') {
    lastContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: options.imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: options.imageBase64,
        },
      },
      { type: 'text', text: lastMsg.content },
    ]
  } else {
    lastContent = lastMsg.content
  }

  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: lastMsg.role, content: lastContent },
  ]

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  return { content, tokensUsed }
}
