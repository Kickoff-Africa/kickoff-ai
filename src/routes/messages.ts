import multer from 'multer';
import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { config } from '../config/env';
import { classifyComplexity, ollamaChat } from '../services/claude';
import { processFile, buildMessageContent } from '../services/fileProcessor';
import { addUsage } from '../services/access';

export const messagesRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message and receive an AI response
 *     description: |
 *       Sends a user message within a conversation and returns the AI response.
 *
 *       Accepts both plain JSON (`content` string) and `multipart/form-data` with an
 *       optional `file` attachment.
 *
 *       **File support:**
 *       - **Images** (jpeg, png, gif, webp) → routed to `llama3.2-vision` for visual analysis
 *       - **PDFs** → text extracted and prepended to the prompt; handled by `llama3.1:70b`
 *       - **Text files** (.txt, .md, .csv, .json, etc.) → content injected as context; handled by `llama3.1:70b`
 *
 *       **Complexity classification:** Every message is classified by Claude Haiku
 *       (simple / moderate / complex) and stored alongside the response for analytics.
 *
 *       **Usage tracking:** Wall-clock time for the request is deducted from the user's access window.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: Summarise this document
 *               file:
 *                 type: string
 *                 format: binary
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
 *                   example: llama3.1:70b
 *                 tokens_used:
 *                   type: integer
 *                   example: 142
 *                 complexity:
 *                   type: string
 *                   enum: [simple, moderate, complex]
 *       400:
 *         description: Message content missing, file too large, or unsupported file type
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
messagesRouter.post(
  '/:conversationId/messages',
  authenticate,
  checkAccess,
  upload.single('file'),
  async (req, res) => {
    try {
      const startTime = Date.now();
      const content = req.body?.content as string | undefined;

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

      // Process file attachment if present
      let attachment;
      if (req.file) {
        attachment = await processFile(req.file.buffer, req.file.mimetype, req.file.originalname);

        if (attachment.type === 'unsupported') {
          return res.status(400).json({
            error: `Unsupported file type: ${req.file.mimetype}. Supported: images (jpeg, png, gif, webp), PDFs, and text files.`,
          });
        }

        logger.debug(
          { conversationId, filename: req.file.originalname, type: attachment.type },
          'File attachment processed',
        );
      }

      // Build the message content that goes into the DB and is sent to AI
      const fullContent = buildMessageContent(content, attachment);

      await query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
        [conversationId, fullContent],
      );

      const historyResult = await query(
        `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId],
      );

      const historyRows = historyResult.rows as Array<{ role: 'user' | 'assistant'; content: string }>;

      // Complexity classification (analytics / logging only — Ollama handles everything)
      const complexity = await classifyComplexity(content);

      // Vision model for images, standard model for everything else
      const ollamaOptions = attachment?.type === 'image' && attachment.base64
        ? { images: [attachment.base64] }
        : undefined;

      logger.debug(
        { conversationId, complexity, vision: !!ollamaOptions },
        'Routing to Ollama',
      );

      const { content: assistantContent, tokensUsed, modelUsed } = await ollamaChat(
        historyRows,
        ollamaOptions,
      );

      const assistantResult = await query(
        `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
         VALUES ($1, 'assistant', $2, $3, $4)
         RETURNING id, role, content, model_used, tokens_used, created_at`,
        [conversationId, assistantContent, modelUsed, tokensUsed],
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

      logger.info(
        { userId, conversationId, model: modelUsed, complexity, tokensUsed, elapsedSeconds },
        'Message processed',
      );

      return res.status(201).json({
        message: assistantMessage,
        model_used: modelUsed,
        tokens_used: tokensUsed,
        complexity,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).message?.includes('File too large')) {
        return res.status(400).json({ error: 'File too large. Maximum size is 20 MB.' });
      }
      logger.error(
        { err, conversationId: req.params.conversationId, userId: req.user?.id },
        'POST /conversations/:conversationId/messages error',
      );
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);
