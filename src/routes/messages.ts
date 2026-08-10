import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { config } from '../config/env';
import { classifyComplexity, ollamaChat } from '../services/claude';
import { addUsage } from '../services/access';

export const messagesRouter = Router({ mergeParams: true });

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message and receive a Claude response
 *     description: |
 *       Sends a user message within a conversation and returns the AI response.
 *
 *       **Model routing:** The message is first classified by Claude Haiku (simple/moderate/complex).
 *       Simple and moderate messages are handled by Haiku; complex messages are routed to Sonnet.
 *
 *       **Usage tracking:** Wall-clock time for the request is deducted from the user's access window after the response is prepared.
 *
 *       **Auto-titling:** The conversation title is set automatically from the first 50 characters of the first message.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: What is the capital of France?
 *     responses:
 *       201:
 *         description: Assistant response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *                 model_used:
 *                   type: string
 *                   example: claude-haiku-4-5-20251001
 *                 tokens_used:
 *                   type: integer
 *                   example: 142
 *       400:
 *         description: Message content missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Conversation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Access time exhausted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 seconds_used:
 *                   type: number
 *                 total_allowed:
 *                   type: number
 *                 window_expires_at:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
messagesRouter.post('/:conversationId/messages', authenticate, checkAccess, async (req, res) => {
  try {
    const startTime = Date.now();
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const userId = req.user!.id;
    const { conversationId } = req.params;

    const convResult = await query(
      `SELECT id, title FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0] as { id: string; title: string | null };

    await query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, content],
    );

    const historyResult = await query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );

    const historyRows = historyResult.rows as Array<{ role: 'user' | 'assistant'; content: string }>;

    const complexity = await classifyComplexity(content);
    const model = config.ollamaModel;

    logger.debug({ conversationId, complexity, model }, 'Message classified, routing to Ollama');

    const { content: assistantContent, tokensUsed } = await ollamaChat(historyRows);

    const assistantResult = await query(
      `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING id, role, content, model_used, tokens_used, created_at`,
      [conversationId, assistantContent, model, tokensUsed],
    );

    const assistantMessage = assistantResult.rows[0];

    if (conversation.title === null) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await query(
        `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
        [title, conversationId],
      );
    } else {
      await query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    }

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    await addUsage(userId, elapsedSeconds);

    logger.info({ userId, conversationId, model, tokensUsed, elapsedSeconds }, 'Message processed');

    return res.status(201).json({
      message: assistantMessage,
      model_used: model,
      tokens_used: tokensUsed,
    });
  } catch (err) {
    logger.error({ err, conversationId: req.params.conversationId, userId: req.user?.id }, 'POST /conversations/:conversationId/messages error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
