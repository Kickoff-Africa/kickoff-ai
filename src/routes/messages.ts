import multer from 'multer';
import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { classifyComplexity, getModelForComplexity, chat, generateConversationTitle, OllamaUnavailableError } from '../services/ollama';
import { shouldSearch, webSearch, formatSearchResults } from '../services/webSearch';
import { processFile, buildMessageContent } from '../services/fileProcessor';
import { uploadToCloudinary } from '../services/cloudinary';
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
 *       | **Image** | `image/jpeg`, `image/png`, `image/gif`, `image/webp` | **Temporarily unavailable** — returns `503`. No working vision model is currently deployed. |
 *       | **PDF** | `application/pdf` | Text is extracted from the PDF and prepended to the prompt as context. |
 *       | **Text** | `text/plain`, `text/csv`, `text/html`, `.md`, `.json`, `.yaml`, `.ts`, `.js`, `.py`, `.sh`, `.log`, `.xml` | File content is injected as context before the user's prompt. |
 *
 *       Maximum file size: **20 MB**
 *
 *       Unsupported file types return a `400` error.
 *
 *       ## File storage
 *
 *       All attachments are uploaded to Cloudinary before the AI processes them.
 *       The returned `message` object includes `attachment_url` (a permanent Cloudinary URL),
 *       `attachment_type`, and `attachment_name` so the frontend can render a preview or download link.
 *
 *       When fetching past messages via `GET /conversations/{id}`, these fields are returned on
 *       every user message that had an attachment. The `content` field always contains the user's
 *       original prompt text — not the embedded file content that was sent to the AI.
 *
 *       ## Model routing
 *
 *       | Condition | Model used |
 *       |-----------|-----------|
 *       | Image attached | `OLLAMA_VISION_MODEL` |
 *       | Complex message (no image) | `OLLAMA_COMPLEX_MODEL` |
 *       | Moderate message (no image) | `OLLAMA_MODERATE_MODEL` |
 *       | Simple message (no image) | `OLLAMA_SIMPLE_MODEL` |
 *
 *       Complexity is classified by an Ollama model before routing and is returned in the response.
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
 *                 user_message:
 *                   type: object
 *                   description: The saved user message record, including attachment metadata.
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     role:
 *                       type: string
 *                       example: user
 *                     content:
 *                       type: string
 *                       description: The user's original prompt text.
 *                     attachment_url:
 *                       type: string
 *                       nullable: true
 *                       description: Permanent Cloudinary URL of the uploaded file.
 *                       example: https://res.cloudinary.com/kickoff/image/upload/v1/kickoff-ai/attachments/photo.jpg
 *                     attachment_type:
 *                       type: string
 *                       nullable: true
 *                       enum: [image, pdf, text, null]
 *                     attachment_name:
 *                       type: string
 *                       nullable: true
 *                       example: q3-report.pdf
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                 model_used:
 *                   type: string
 *                   example: gemma4b:latest
 *                   description: The Ollama model that generated the response.
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
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [conversationId, userId],
      );

      if (convResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Process file attachment if present
      let attachment;
      let attachmentUrl: string | null = null;

      if (req.file) {
        attachment = await processFile(req.file.buffer, req.file.mimetype, req.file.originalname);

        if (attachment.type === 'unsupported') {
          return res.status(400).json({
            error: `Unsupported file type: ${req.file.mimetype}. Supported: images (jpeg, png, gif, webp), PDFs, and text files.`,
          });
        }

        if (attachment.type === 'image') {
          return res.status(503).json({
            error: 'Image attachments are temporarily unavailable. Please describe the image in text instead.',
          });
        }

        // Upload to Cloudinary so the file is accessible in message history
        attachmentUrl = await uploadToCloudinary(req.file.buffer, {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        });

        logger.debug(
          { conversationId, filename: req.file.originalname, type: attachment.type, attachmentUrl },
          'File attachment processed and uploaded',
        );
      }

      // Build the full context content sent to AI (includes extracted text / image label)
      const fullContent = buildMessageContent(content, attachment);

      await query(
        `INSERT INTO messages (conversation_id, role, content, user_prompt, attachment_url, attachment_type, attachment_name)
         VALUES ($1, 'user', $2, $3, $4, $5, $6)`,
        [
          conversationId,
          fullContent,
          content,                                      // original user prompt
          attachmentUrl,                                // Cloudinary URL (null if no file)
          attachment?.type ?? null,
          req.file?.originalname ?? null,
        ],
      );

      const historyResult = await query(
        `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId],
      );

      const historyRows = historyResult.rows as Array<{ role: 'user' | 'assistant'; content: string }>;

     const complexity = await classifyComplexity(content);
       
        const model = (attachment?.type === 'image')
          ? getModelForComplexity('complex')
          : getModelForComplexity(complexity);
      logger.debug(
        { conversationId, complexity, model, vision: attachment?.type === 'image' },
        'Message classified and routed',
      );

      const chatOptions = attachment?.type === 'image' && attachment.base64
        ? { imageBase64: attachment.base64, imageMimeType: attachment.mimeType ?? 'image/jpeg' }
        : undefined;

      // Small local models can't reliably know when they need current info, so the
      // decision to search is made deterministically (see shouldSearch) rather than
      // left to the model. Results are injected only into this call's prompt, not
      // persisted to the stored message.
      let usedWebSearch = false;
      let chatHistory = historyRows;
      if (shouldSearch(content)) {
        const results = await webSearch(content);
        if (results.length > 0) {
          usedWebSearch = true;
          const lastMessage = historyRows[historyRows.length - 1];
          chatHistory = [
            ...historyRows.slice(0, -1),
            {
              ...lastMessage,
              content: `${lastMessage.content}\n\n[Web search results for reference, use if relevant]\n${formatSearchResults(results)}`,
            },
          ];
        }
      }

      const { content: assistantContent, tokensUsed } = await chat(chatHistory, model, chatOptions);
      const modelUsed = model;

      const assistantResult = await query(
        `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
         VALUES ($1, 'assistant', $2, $3, $4)
         RETURNING id, role, content, model_used, tokens_used, created_at`,
        [conversationId, assistantContent, modelUsed, tokensUsed],
      );

      const assistantMessage = assistantResult.rows[0];

      // Keep the title an up-to-date summary while the conversation is still short;
      // once it's grown past the first 5 messages, leave the title alone.
      const totalMessages = historyRows.length + 1; // + the assistant reply just generated
      if (totalMessages <= 5) {
        const titleMessages = [
          ...historyRows,
          { role: 'assistant' as const, content: assistantContent },
        ].slice(0, 5);
        const generatedTitle = await generateConversationTitle(titleMessages);
        const title = generatedTitle ?? content.slice(0, 50) + (content.length > 50 ? '...' : '');
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
        { userId, conversationId, model: modelUsed, complexity, tokensUsed, elapsedSeconds, usedWebSearch },
        'Message processed',
      );

      return res.status(201).json({
        message: assistantMessage,
        model_used: modelUsed,
        tokens_used: tokensUsed,
        complexity,
        used_web_search: usedWebSearch,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).message?.includes('File too large')) {
        return res.status(400).json({ error: 'File too large. Maximum size is 20 MB.' });
      }
      if (err instanceof OllamaUnavailableError) {
        logger.error(
          { err: { message: err.message }, conversationId: req.params.conversationId, userId: req.user?.id },
          'POST /conversations/:conversationId/messages: Ollama unavailable',
        );
        return res.status(503).json({ error: 'AI service is temporarily unavailable. Please try again shortly.' });
      }
     logger.error(
          {
            err: {
              message: (err as Error).message,
              stack: (err as Error).stack,
            },
            conversationId: req.params.conversationId,
            userId: req.user?.id,
          },
          'POST /conversations/:conversationId/messages error',
        );
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);
