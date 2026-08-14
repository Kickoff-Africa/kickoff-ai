import { Router } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/authenticate';

export const conversationsRouter = Router();

/**
 * @openapi
 * /conversations:
 *   post:
 *     tags: [Conversations]
 *     summary: Create a new conversation
 *     description: Creates a new empty conversation and returns its ID.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Conversation created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
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
conversationsRouter.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `INSERT INTO conversations (user_id) VALUES ($1) RETURNING id, title, created_at`,
      [userId],
    );
    const conversation = result.rows[0];
    return res.status(201).json({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'POST /conversations error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List all conversations
 *     description: Returns all conversations belonging to the authenticated user, ordered by most recently active.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
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
conversationsRouter.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `SELECT c.id, c.title, c.created_at,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_message_at
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId],
    );
    return res.status(200).json(result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
    })));
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'GET /conversations error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get a conversation with messages
 *     description: |
 *       Returns a single conversation and its full message history, ordered chronologically.
 *       Only the owning user can access their conversations.
 *
 *       For user messages, `content` is the original prompt text (not the embedded file context
 *       sent to the AI). Attachment metadata is returned via `attachment_url`, `attachment_type`,
 *       and `attachment_name` so the frontend can render previews or download links.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation with messages
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Conversation'
 *                 - type: object
 *                   properties:
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Message'
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
conversationsRouter.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    const convResult = await query(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0];

    const messagesResult = await query(
      `SELECT id, role, content, user_prompt, attachment_url, attachment_type, attachment_name, model_used, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    return res.status(200).json({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      messages: messagesResult.rows.map((row) => ({
        id: row.id,
        role: row.role,
        // For user messages: return the original prompt; fall back to content for old rows
        content: row.role === 'user' ? (row.user_prompt ?? row.content) : row.content,
        attachment_url: row.attachment_url ?? null,
        attachment_type: row.attachment_type ?? null,
        attachment_name: row.attachment_name ?? null,
        model_used: row.model_used,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err, conversationId: req.params.id }, 'GET /conversations/:id error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
