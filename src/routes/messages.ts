import multer from 'multer';
import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { getModelForComplexity, chatStream, generateConversationTitle, OllamaUnavailableError } from '../services/ollama';
import { shouldSearch, webSearch, formatSearchResults } from '../services/webSearch';
import { queryKnowledgeBase, formatKnowledgeBaseMatches } from '../services/knowledgeBase';
import { registerGeneration, unregisterGeneration, cancelGeneration } from '../services/activeGenerations';
import { geolocateIp, formatLocation } from '../services/geolocation';
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
 *       | No image | `OLLAMA_MODERATE_MODEL` |
 *
 *       Every text message goes straight to the same model — there's no per-message complexity
 *       classification step (there used to be; it added an extra Ollama round trip to every
 *       message and the smaller "simple" tier routinely produced worse answers than just always
 *       using the moderate model, so it was removed).
 *
 *       ## Streaming response
 *
 *       On success, the response is `200` with `Content-Type: application/x-ndjson` — a stream of
 *       newline-delimited JSON objects, not a single JSON body. Read it with a `fetch` + `ReadableStream`
 *       reader (not `EventSource`, which only supports `GET`), splitting on `\n`:
 *
 *       ```js
 *       const res = await fetch(`/conversations/${id}/messages`, { method: 'POST', ... })
 *       const reader = res.body.getReader()
 *       const decoder = new TextDecoder()
 *       let buffer = ''
 *       while (true) {
 *         const { done, value } = await reader.read()
 *         if (done) break
 *         buffer += decoder.decode(value, { stream: true })
 *         const lines = buffer.split('\n')
 *         buffer = lines.pop()
 *         for (const line of lines) {
 *           if (!line.trim()) continue
 *           const event = JSON.parse(line)
 *           // event.type: 'chunk' | 'done' | 'cancelled' | 'error'
 *         }
 *       }
 *       ```
 *
 *       Four line shapes appear on the stream:
 *       - `{"type":"chunk","content":"..."}` — one per generated token/fragment, in order.
 *       - `{"type":"done", message, model_used, tokens_used, used_web_search,
 *         used_knowledge_base, access}` — exactly once, at the end of a successful generation.
 *         `access` carries the same fields the old `X-Access-*` response headers used to
 *         (`seconds_remaining`, `seconds_used`, `total_allowed`, `window_expires_at`) — those
 *         headers are gone, since headers can't be set after the stream has already started.
 *       - `{"type":"cancelled", message?, model_used?, tokens_used?, used_web_search?,
 *         used_knowledge_base?, access}` — sent instead of `"done"` when `POST
 *         /conversations/{conversationId}/cancel` stopped this generation. Same shape as `"done"`,
 *         except `message` (and the other generation fields) are only present if some content had
 *         already streamed before the cancel landed — a cancel with nothing generated yet leaves no
 *         trace, same as if the message had never been sent. When `message` is present, its
 *         `content` has a trailing `\n\n[Response stopped]` appended, so later turns in the
 *         conversation know the cutoff was intentional rather than a truncation bug.
 *       - `{"type":"error","error":"..."}` — generation failed after streaming had already begun,
 *         so the failure can no longer become a clean HTTP status code. This is only possible once
 *         at least one `chunk` line may have already been sent. Failures caught *before* streaming
 *         starts (bad input, missing conversation, unsupported file, Ollama unreachable) still
 *         return a normal JSON error response with the appropriate 4xx/5xx status — see below.
 *
 *       ## Cancelling a generation
 *
 *       `POST /conversations/{conversationId}/cancel` stops the in-progress generation for that
 *       conversation (see the dedicated endpoint below) — the open streaming response above ends
 *       with a `"cancelled"` line instead of `"done"`.
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
 *                   PDFs, Word documents (.docx), and text files (.txt, .md, .csv, .json, .yaml, .ts, .js, .py, etc.).
 *                   Maximum 20 MB.
 *     responses:
 *       200:
 *         description: |
 *           Streamed NDJSON response — see the "Streaming response" section above for the line
 *           shapes and a parsing example. Not a single JSON body, so the schema below describes
 *           the shape of the final `done` line's `message` field, not the HTTP response itself.
 *         content:
 *           application/x-ndjson:
 *             schema:
 *               type: object
 *               description: One of {type:"chunk"}, {type:"done"}, {type:"cancelled"}, or {type:"error"} — see above.
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [chunk, done, cancelled, error]
 *                 content:
 *                   type: string
 *                   description: Present on "chunk" lines — a fragment of the assistant's reply.
 *                 message:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Message'
 *                   description: |
 *                     Present on "done" lines, and on "cancelled" lines if some content had
 *                     already generated before the cancel (its `content` ends with
 *                     "\n\n[Response stopped]" in that case).
 *                 model_used:
 *                   type: string
 *                   example: gemma3:4b
 *                   description: Present on "done" lines, and on "cancelled" lines when `message` is present.
 *                 tokens_used:
 *                   type: integer
 *                   example: 142
 *                   description: Present on "done" lines, and on "cancelled" lines when `message` is present.
 *                 used_web_search:
 *                   type: boolean
 *                   description: Present on "done" lines, and on "cancelled" lines when `message` is present.
 *                 used_knowledge_base:
 *                   type: boolean
 *                   description: Present on "done" lines, and on "cancelled" lines when `message` is present.
 *                 access:
 *                   type: object
 *                   description: Present on "done" and "cancelled" lines — replaces the old X-Access-* headers.
 *                   properties:
 *                     seconds_remaining:
 *                       type: integer
 *                     seconds_used:
 *                       type: integer
 *                     total_allowed:
 *                       type: integer
 *                     window_expires_at:
 *                       type: string
 *                       format: date-time
 *                 error:
 *                   type: string
 *                   description: Present on "error" lines.
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
    // Set once the NDJSON stream has actually started (headers flushed) —
    // after that point, failures can no longer become a clean status-code
    // response and must instead be reported as an error line on the stream.
    let streamStarted = false;
    // Declared here (rather than where it's created, deeper in the try
    // block) so the finally block below can always reach it to unregister,
    // regardless of which return/throw path this request takes.
    let generationController: AbortController | undefined;
    try {
      const startTime = Date.now();
      const content = req.body?.content as string | undefined;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const userId = req.user!.id;
      const conversationId = req.params.conversationId as string;

      const convResult = await query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
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
            error: `Unsupported file type: ${req.file.mimetype}. Supported: images (jpeg, png, gif, webp), PDFs, Word documents (.docx), and text files.`,
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

      // Registered now so a POST to /conversations/:id/cancel can abort this
      // generation once it starts — see activeGenerations.ts. Cleared in the
      // finally block below regardless of how this request ends.
      generationController = registerGeneration(conversationId);

      const chatOptions = {
        signal: generationController.signal,
        ...(attachment?.type === 'image' && attachment.base64
          ? { imageBase64: attachment.base64, imageMimeType: attachment.mimeType ?? 'image/jpeg' }
          : {}),
      };

      // Small local models can't reliably know when they need current info, so the
      // decision to search is made deterministically (see shouldSearch) rather than
      // left to the model. Results/matches are injected only into this call's
      // prompt, not persisted to the stored message.
      let usedWebSearch = false;
      let usedKnowledgeBase = false;
      const contextBlocks: string[] = [];

      // No classification step — every 1B-model routing decision this app made
      // turned out to need the bigger model anyway (see the weather/search
      // cases), and the classify call itself cost an extra Ollama round trip
      // on every single message. Text always goes straight to the moderate
      // model; only an image attachment still steps up further.
      const model = (attachment?.type === 'image')
        ? getModelForComplexity('complex')
        : getModelForComplexity('moderate');
      logger.debug(
        { conversationId, model, vision: attachment?.type === 'image' },
        'Message routed',
      );

      // From here on the response is a stream of newline-delimited JSON
      // objects, not a single JSON body: {"type":"chunk","content":"..."}
      // per token, then one {"type":"done", ...} with the full metadata, or
      // {"type":"error", ...} if generation fails after streaming began.
      //
      // Flushed here — before the knowledge-base lookup below, not after it
      // — deliberately. That lookup makes its own Ollama call (an embed,
      // through the same queue as chat generation), so if it were placed
      // before this point, queue contention from someone else's in-flight
      // generation would delay it, and therefore delay the client seeing
      // *anything at all* — the client can't tell "queued behind another
      // request" apart from "hung" until some byte arrives. Nothing between
      // here and the validation above can still fail with a different status
      // code, so it's safe to open the connection now.
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });
      // writeHead() alone doesn't put a single byte on the wire — Node only
      // flushes headers on the first write()/end() call.
      res.flushHeaders();
      streamStarted = true;

      if (shouldSearch(content)) {
        const location = await geolocateIp(req.ip ?? '');
        const results = await webSearch(content, location ? formatLocation(location) : undefined);
        if (results.length > 0) {
          usedWebSearch = true;
          contextBlocks.push(
            `[Web search results for reference, use if relevant]\n${formatSearchResults(results)}`,
          );
        }
      }

      const kbMatches = await queryKnowledgeBase(content);
      if (kbMatches.length > 0) {
        usedKnowledgeBase = true;
        contextBlocks.push(
          `[Knowledge base excerpts for reference, use if relevant]\n${formatKnowledgeBaseMatches(kbMatches)}`,
        );
      }

      let chatHistory = historyRows;
      if (contextBlocks.length > 0) {
        const lastMessage = historyRows[historyRows.length - 1];
        chatHistory = [
          ...historyRows.slice(0, -1),
          { ...lastMessage, content: `${lastMessage.content}\n\n${contextBlocks.join('\n\n')}` },
        ];
      }

      const { content: assistantContent, tokensUsed, cancelled } = await chatStream(
        chatHistory,
        model,
        (delta) => {
          res.write(JSON.stringify({ type: 'chunk', content: delta }) + '\n');
        },
        chatOptions,
      );
      const modelUsed = model;

      // A cancel with nothing generated yet leaves no trace — same as if the
      // message had never been sent, rather than saving an empty assistant bubble.
      if (cancelled && !assistantContent.trim()) {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        await addUsage(userId, elapsedSeconds);
        const accessState = await getRemainingSeconds(userId);
        logger.info({ userId, conversationId, elapsedSeconds }, 'Message generation cancelled before any content');
        res.write(
          JSON.stringify({
            type: 'cancelled',
            access: {
              seconds_remaining: accessState.secondsRemaining,
              seconds_used: accessState.secondsUsed,
              total_allowed: accessState.totalAllowed,
              window_expires_at: accessState.windowExpiresAt.toISOString(),
            },
          }) + '\n',
        );
        return res.end();
      }

      // A cancelled reply stored verbatim reads as a complete answer that
      // just happens to stop mid-sentence — nothing marks it as intentional.
      // We saw this confuse a later turn firsthand: the model ignored a
      // follow-up instruction and just kept going with the cut-off story
      // instead. Appending this marker to the stored content (not just shown
      // to the user, but sent back as real conversation history on every
      // future turn) tells later turns the cutoff was deliberate.
      const contentToSave = cancelled ? `${assistantContent}\n\n[Response stopped]` : assistantContent;

      const assistantResult = await query(
        `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
         VALUES ($1, 'assistant', $2, $3, $4)
         RETURNING id, role, content, model_used, tokens_used, created_at`,
        [conversationId, contentToSave, modelUsed, tokensUsed],
      );

      const assistantMessage = assistantResult.rows[0];

      // Keep the title an up-to-date summary while the conversation is still short;
      // once it's grown past the first 5 messages, leave the title alone.
      const totalMessages = historyRows.length + 1; // + the assistant reply just generated
      if (totalMessages <= 5) {
        // Title generation is a second Ollama call — awaiting it here would
        // tack its full duration onto every response in a new conversation,
        // on top of the main generation that already just happened. It's not
        // needed to show the user their answer, so it runs in the background
        // instead: started now (overlapping with the addUsage/access-state
        // calls below) and left to finish updating the title after this
        // response has already ended.
        const titleMessages = [
          ...historyRows,
          { role: 'assistant' as const, content: contentToSave },
        ].slice(0, 5);
        generateConversationTitle(titleMessages)
          .then((generatedTitle) => {
            const title = generatedTitle ?? content.slice(0, 50) + (content.length > 50 ? '...' : '');
            return query(
              `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
              [title, conversationId],
            );
          })
          .catch((err) => {
            logger.error({ err, conversationId }, 'Background title generation failed');
          });
      } else {
        await query(
          `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
          [conversationId],
        );
      }

      const elapsedSeconds = (Date.now() - startTime) / 1000;
      await addUsage(userId, elapsedSeconds);

      // Headers are already flushed by this point (streaming started above),
      // so post-generation access state goes in the final stream line
      // instead of the old X-Access-* response headers.
      const accessState = await getRemainingSeconds(userId);

      logger.info(
        {
          userId,
          conversationId,
          model: modelUsed,
          tokensUsed,
          elapsedSeconds,
          usedWebSearch,
          usedKnowledgeBase,
          cancelled,
        },
        cancelled ? 'Message generation cancelled (partial content kept)' : 'Message processed',
      );

      res.write(
        JSON.stringify({
          type: cancelled ? 'cancelled' : 'done',
          message: assistantMessage,
          model_used: modelUsed,
          tokens_used: tokensUsed,
          used_web_search: usedWebSearch,
          used_knowledge_base: usedKnowledgeBase,
          access: {
            seconds_remaining: accessState.secondsRemaining,
            seconds_used: accessState.secondsUsed,
            total_allowed: accessState.totalAllowed,
            window_expires_at: accessState.windowExpiresAt.toISOString(),
          },
        }) + '\n',
      );
      return res.end();
    } catch (err) {
      // Once the stream has started, headers are already sent — a failure
      // can no longer become a clean status-code response, only an error
      // line on the still-open connection.
      if (streamStarted) {
        // Rare edge case: a cancel that lands before Ollama's response body
        // even arrives throws instead of resolving gracefully (chatStream's
        // graceful-cancel handling only covers the read loop). Still worth
        // reporting as a cancellation rather than a generic error.
        if (generationController?.signal.aborted) {
          logger.info(
            { conversationId: req.params.conversationId, userId: req.user?.id },
            'Message generation cancelled before streaming began',
          );
          res.write(JSON.stringify({ type: 'cancelled' }) + '\n');
          return res.end();
        }
        logger.error(
          {
            err: { message: (err as Error).message, stack: (err as Error).stack },
            conversationId: req.params.conversationId,
            userId: req.user?.id,
          },
          'POST /conversations/:conversationId/messages error mid-stream',
        );
        res.write(JSON.stringify({ type: 'error', error: 'Internal server error' }) + '\n');
        return res.end();
      }

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
    } finally {
      if (generationController) {
        unregisterGeneration(req.params.conversationId as string, generationController);
      }
    }
  },
);

/**
 * @openapi
 * /conversations/{conversationId}/cancel:
 *   post:
 *     tags: [Messages]
 *     summary: Cancel an in-progress message generation
 *     description: |
 *       Stops the assistant's response to this conversation's most recent message, if it's still
 *       generating. Whatever content had already streamed is saved as the assistant's message
 *       (matching "stop generating" in most chat products), with a trailing `\n\n[Response
 *       stopped]` appended so later turns in the conversation know the cutoff was intentional
 *       rather than a truncation bug — unless nothing had generated yet, in which case no message
 *       is saved at all. The open streaming response for that message (see `POST
 *       /conversations/{conversationId}/messages`) ends with a `{"type":"cancelled",...}` line
 *       instead of `"done"`.
 *
 *       No-op-safe to call when nothing is in flight (e.g. it already finished) — returns 404
 *       rather than an error.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Generation cancelled
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Conversation not found, or nothing is currently generating for it
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
messagesRouter.post('/:conversationId/cancel', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.conversationId as string;

    const convResult = await query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const cancelled = cancelGeneration(conversationId);
    if (!cancelled) {
      return res.status(404).json({ error: 'No message is currently generating for this conversation' });
    }

    logger.info({ conversationId, userId }, 'Message generation cancel requested');
    return res.status(204).send();
  } catch (err) {
    logger.error({ err, conversationId: req.params.conversationId }, 'POST /conversations/:conversationId/cancel error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
