import { Router } from 'express';
import { config } from '../config/env';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import {
  handleIncomingMessage,
  isWhatsAppConfigured,
  sendWhatsAppText,
  verifySignature,
  IncomingWhatsAppMessage,
} from '../services/whatsapp';

export const whatsappRouter = Router();

/**
 * @openapi
 * /whatsapp/webhook:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Meta webhook verification handshake
 *   post:
 *     tags: [WhatsApp]
 *     summary: Receive incoming WhatsApp messages from Meta
 * /whatsapp/contacts:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Link a WhatsApp number to an org user (admin)
 *     security: [{ bearerAuth: [] }]
 */
whatsappRouter.get('/webhook', (req, res) => {
  if (
    config.whatsappVerifyToken &&
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === config.whatsappVerifyToken
  ) {
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.sendStatus(403);
});

whatsappRouter.post('/webhook', (req, res) => {
  if (!isWhatsAppConfigured()) return res.sendStatus(503);
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!verifySignature(rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);

  // Acknowledge immediately — Meta times out and retries if generation
  // (which can take many seconds) is done before responding.
  res.sendStatus(200);

  const messages: IncomingWhatsAppMessage[] = [];
  for (const entry of req.body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) messages.push(m);
    }
  }

  for (const msg of messages) {
    handleIncomingMessage(msg).catch(async (err) => {
      logger.error({ err: { message: (err as Error).message, stack: (err as Error).stack } }, 'WhatsApp handler failed');
      try {
        await sendWhatsAppText(msg.from, 'Sorry, something went wrong. Please try again shortly.');
      } catch {
        // nothing more we can do
      }
    });
  }
});

whatsappRouter.post('/contacts', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, phone_number } = req.body ?? {};
    if (typeof email !== 'string' || typeof phone_number !== 'string') {
      return res.status(400).json({ error: 'email and phone_number are required' });
    }
    const phone = phone_number.replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: 'phone_number must be in international format, e.g. 2348012345678' });
    }
    const user = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const result = await query(
      `INSERT INTO whatsapp_contacts (phone_number, user_id) VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET user_id = EXCLUDED.user_id, conversation_id = NULL
       RETURNING id, phone_number, user_id`,
      [phone, user.rows[0].id],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'POST /whatsapp/contacts error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
