import multer from 'multer';
import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { classifyComplexity, getModelForComplexity, chat } from '../services/claude';
import { processFile, buildMessageContent } from '../services/fileProcessor';
import { addUsage, getRemainingSeconds } from '../services/access';

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
 *       ## Sending a plain text message
 *
 *       Use `application/json` with a `content` string:
 *
 *       ```js
 *       fetch(`/conversations/${id}/messages`, {
 *         method: 'POST',
 *         headers: {
 *           'Content-Type': 'application/json',
 *           'Authorization': `Bearer ${token}`,
 *         },
 *         body: JSON.stringify({ content: 'What is the capital of France?' }),
 *       })
 *       ```
 *
 *       ## Sending a file or image
 *
 *       Use `multipart/form-data`. Include both `content` (required, the user's prompt) and
 *       `file` (the attachment). **Do not set `Content-Type` manually** — the browser sets it
 *       automatically with the correct boundary when you pass a `FormData` object.
 *
 *       ```js
 *       const form = new FormData()
 *       form.append('content', 'What is in this image?')
 *       form.append('file', fileInput.files[0])   // File object from <input type="file">
 *
 *       fetch(`/conversations/${id}/messages`, {
 *         method: 'POST',
 *         headers: { 'Authorization': `Bearer ${token}` },
 *         body: form,
 *       })
 *       ```
 *
 *       ## Supported file types
 *
 *       | Type | Accepted formats | How it works |
 *       |------|-----------------|--------------|
 *       | **Image** | `image/jpeg`, `image/png`, `image/gif`, `image/webp` | Sent to Claude Sonnet with vision capability. The model sees the actual image. |
 *       | **PDF** | `application/pdf` | Text is extracted from the PDF and prepended to the prompt as context. |
 *       | **Text** | `text/plain`, `text/csv`, `text/html`, `.md`, `.json`, `.yaml`, `.ts`, `.js`, `.py`, `.sh`, `.log`, `.xml` | File content is injected as context before the user's prompt. |
 *
 *       Maximum file size: **20 MB**
 *
 *       Unsupported file types return a `400` error.
 *
 *       ## Model routing
 *
 *       | Condition | Model used |
 *       |-----------|-----------|
 *       | Image attached | `claude-sonnet-4-6` (vision) |
 *       | Complex message (no image) | `claude-sonnet-4-6` |
 *       | Simple or moderate message (no image) | `claude-haiku-4-5-20251001` |
 *
 *       Complexity is classified by Claude Haiku before routing and is returned in the response.
 *
 *       ## Access window headers
 *
 *       Every response includes headers showing the user's remaining access time.
 *       Read these after every request to keep the UI in sync without polling `/access/status`:
 *
 *       ```
 *       X-Access-Seconds-Remaining: 3241
 *       X-Access-Seconds-Used:       359
 *       X-Access-Total-Allowed:      3600
 *       X-Access-Window-Expires-At:  2026-08-12T21:00:00.000Z
 *       ```
 *
 *       ```js
 *       const remaining = parseInt(response.headers.get('X-Access-Seconds-Remaining'))
 *       ```
 *
 *       **Note:** Headers are set after usage is deducted, so they always reflect the accurate
 *       remaining time for that request.
 *
 *       ## Auto-titling
 *
 *       If a conversation has no title yet, it is automatically set from the first 50 characters
 *       of the first user message.
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
 *                 example: What is in this image?
 *                 description: The user's prompt. Always required, even when attaching a file.
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: |
 *                   Optional file attachment. Supported: images (jpeg, png, gif, webp),
 *                   PDFs, and text files (.txt, .md, .csv, .json, .yaml, .ts, .js, .py, etc.).
 *                   Maximum 20 MB.
 *     responses:
 *       201:
 *         description: Assistant response
 *         headers:
 *           X-Access-Seconds-Remaining:
 *             schema:
 *               type: integer
 *             description: Seconds remaining in the user's current 1-hour access window (after this request's usage is deducted).
 *           X-Access-Seconds-Used:
 *             schema:
 *               type: integer
 *             description: Total seconds consumed in the current access window.
 *           X-Access-Total-Allowed:
 *             schema:
 *               type: integer
 *             description: Total seconds allowed in the current window (base 3600 + any granted extensions).
 *           X-Access-Window-Expires-At:
 *             schema:
 *               type: string
 *               format: date-time
 *             description: ISO 8601 timestamp when the current access window expires.
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
 *                   description: The Claude model that generated the response.
 *                 tokens_used:
 *                   type: integer
 *                   example: 142
 *                 complexity:
 *                   type: string
 *                   enum: [simple, moderate, complex]
 *                   description: Complexity classification of the user's message, used for model routing.
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

      const complexity = await classifyComplexity(content);
      // Images always go to Sonnet (vision support); otherwise route by complexity
      const model = (attachment?.type === 'image')
        ? 'claude-sonnet-4-6'
        : getModelForComplexity(complexity);

      logger.debug(
        { conversationId, complexity, model, vision: attachment?.type === 'image' },
        'Message classified and routed',
      );

      const chatOptions = attachment?.type === 'image' && attachment.base64
        ? { imageBase64: attachment.base64, imageMimeType: attachment.mimeType ?? 'image/jpeg' }
        : undefined;

      const { content: assistantContent, tokensUsed } = await chat(historyRows, model, chatOptions);
      const modelUsed = model;

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

      // Refresh access headers now that usage has been recorded
      const accessState = await getRemainingSeconds(userId);
      res.setHeader('X-Access-Seconds-Remaining', accessState.secondsRemaining);
      res.setHeader('X-Access-Seconds-Used', accessState.secondsUsed);
      res.setHeader('X-Access-Total-Allowed', accessState.totalAllowed);
      res.setHeader('X-Access-Window-Expires-At', accessState.windowExpiresAt.toISOString());

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
