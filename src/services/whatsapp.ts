import crypto from 'crypto';
import { config } from '../config/env';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { chatStream, getModelForComplexity } from './ollama';
import { queryKnowledgeBase, formatKnowledgeBaseMatches } from './knowledgeBase';
import { shouldSearch, webSearch, formatSearchResults } from './webSearch';
import { addUsage } from './access';
import { SYSTEM_PROMPT, truncateHistory } from '../routes/messages';

// WhatsApp rejects text bodies over 4096 characters.
const WHATSAPP_MAX_LENGTH = 4096;

const WHATSAPP_PROMPT_ADDENDUM = `

CHANNEL
26. You are replying over WhatsApp. Keep answers short and conversational. Use WhatsApp formatting only (*bold*, _italic_, simple "-" lists) — no markdown headings, tables, or links in [text](url) form.`;

export function isWhatsAppConfigured(): boolean {
  return Boolean(config.whatsappAccessToken && config.whatsappPhoneNumberId && config.whatsappVerifyToken);
}

export function verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!config.whatsappAppSecret) return true; // signature check not enabled
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.whatsappAppSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function splitMessage(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > WHATSAPP_MAX_LENGTH) {
    let cut = rest.lastIndexOf('\n', WHATSAPP_MAX_LENGTH);
    if (cut < WHATSAPP_MAX_LENGTH / 2) cut = rest.lastIndexOf(' ', WHATSAPP_MAX_LENGTH);
    if (cut < WHATSAPP_MAX_LENGTH / 2) cut = WHATSAPP_MAX_LENGTH;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`;
  for (const body of splitMessage(text)) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) {
      throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
    }
  }
}

async function markRead(waMessageId: string): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.whatsappAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waMessageId }),
      },
    );
  } catch {
    // Read receipts are cosmetic; never fail a reply over one.
  }
}

export interface IncomingWhatsAppMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

export async function handleIncomingMessage(msg: IncomingWhatsAppMessage): Promise<void> {
  // Idempotency: Meta redelivers on non-2xx/timeouts.
  const dedupe = await query(
    `INSERT INTO whatsapp_processed_messages (wa_message_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [msg.id],
  );
  if (!dedupe.rowCount) return;

  const contactResult = await query(
    `SELECT user_id, conversation_id FROM whatsapp_contacts WHERE phone_number = $1`,
    [msg.from],
  );
  if (contactResult.rows.length === 0) {
    await sendWhatsAppText(
      msg.from,
      "Hi! This number isn't registered for Scout AI yet. Please ask a Kickoff Africa admin to link your WhatsApp number.",
    );
    return;
  }
  const userId: string = contactResult.rows[0].user_id;
  let conversationId: string | null = contactResult.rows[0].conversation_id;

  if (msg.type !== 'text' || !msg.text?.body?.trim()) {
    await sendWhatsAppText(msg.from, 'Sorry, I can only read text messages on WhatsApp for now.');
    return;
  }
  const content = msg.text.body.trim();

  void markRead(msg.id);

  if (!conversationId) {
    const created = await query(`INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`, [
      userId,
      'WhatsApp chat',
    ]);
    conversationId = created.rows[0].id as string;
    await query(`UPDATE whatsapp_contacts SET conversation_id = $1 WHERE phone_number = $2`, [
      conversationId,
      msg.from,
    ]);
  }

  await query(`INSERT INTO messages (conversation_id, role, content, user_prompt) VALUES ($1, 'user', $2, $2)`, [
    conversationId,
    content,
  ]);
  const historyResult = await query(
    `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId],
  );
  const history = truncateHistory(
    historyResult.rows as Array<{ role: 'user' | 'assistant'; content: string }>,
    config.chatHistoryCharBudget,
  );

  // Same grounding as the web chat: knowledge base first, live search if the
  // KB had nothing or the message looks time-sensitive.
  const contextBlocks: string[] = [];
  const kbMatches = await queryKnowledgeBase(content);
  if (kbMatches.length > 0) {
    contextBlocks.push(
      `[Knowledge base excerpts for reference, use if relevant]\n${formatKnowledgeBaseMatches(kbMatches)}`,
    );
  }
  if (shouldSearch(content) || kbMatches.length === 0) {
    const results = await webSearch(content);
    if (results.length > 0) {
      contextBlocks.push(`[Web search results for reference, use if relevant]\n${formatSearchResults(results)}`);
    }
  }

  let chatHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = history;
  if (contextBlocks.length > 0) {
    const last = history[history.length - 1];
    chatHistory = [...history.slice(0, -1), { ...last, content: `${last.content}\n\n${contextBlocks.join('\n\n')}` }];
  }
  chatHistory = [{ role: 'system', content: SYSTEM_PROMPT + WHATSAPP_PROMPT_ADDENDUM }, ...chatHistory];

  const model = getModelForComplexity('moderate');
  const { content: reply, tokensUsed } = await chatStream(chatHistory, model, () => {});
  const answer = reply.trim() || "Sorry, I couldn't come up with a reply. Please try again.";

  await query(
    `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used) VALUES ($1, 'assistant', $2, $3, $4)`,
    [conversationId, answer, model, tokensUsed],
  );
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
  await addUsage(userId, tokensUsed);

  await sendWhatsAppText(msg.from, answer);
  logger.info({ userId, conversationId, tokensUsed }, 'WhatsApp message processed');
}
