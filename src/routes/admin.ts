import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate, requireAdmin } from '../middleware/authenticate';

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users with usage statistics
 *     description: Returns all users with their current access window usage stats (seconds used, total allowed, window expiry). Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All users with stats
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/User'
 *                   - type: object
 *                     properties:
 *                       seconds_used:
 *                         type: number
 *                       total_allowed:
 *                         type: number
 *                       window_start:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       window_expires_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
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
adminRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        COALESCE(w.seconds_used, 0) AS seconds_used,
        COALESCE(w.seconds_used + w.extension_seconds, 3600) AS total_allowed,
        w.window_start,
        w.window_start + INTERVAL '12 hours' AS window_expires_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT seconds_used, extension_seconds, window_start
        FROM access_windows
        WHERE user_id = u.id
          AND window_start > NOW() - INTERVAL '12 hours'
        ORDER BY window_start DESC
        LIMIT 1
      ) w ON true
      ORDER BY u.created_at ASC`,
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'GET /admin/users error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /admin/users/{userId}/conversations:
 *   get:
 *     tags: [Admin]
 *     summary: List all conversations for any user
 *     description: Returns all conversations for a given user. No ownership restriction — admin can inspect any user. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User's conversations
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
 *       403:
 *         description: Admin access required
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
adminRouter.get('/users/:userId/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT
        c.id,
        c.title,
        c.created_at,
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) AS last_message_at
      FROM conversations c
      WHERE c.user_id = $1
      ORDER BY last_message_at DESC NULLS LAST`,
      [userId],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, 'GET /admin/users/:userId/conversations error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /admin/conversations/{conversationId}/messages:
 *   get:
 *     tags: [Admin]
 *     summary: Get any conversation with full message history
 *     description: Returns a conversation and all its messages. No ownership restriction — admin can view any conversation. Admin only.
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
 *       200:
 *         description: Conversation with messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversation:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Conversation'
 *                     - type: object
 *                       properties:
 *                         user_id:
 *                           type: string
 *                           format: uuid
 *                         updated_at:
 *                           type: string
 *                           format: date-time
 *                         messages:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Message'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
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
adminRouter.get('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    const convResult = await query(
      `SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = $1`,
      [conversationId],
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const conversation = convResult.rows[0];

    const messagesResult = await query(
      `SELECT id, role, content, model_used, tokens_used, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    res.status(200).json({ conversation: { ...conversation, messages: messagesResult.rows } });
  } catch (err) {
    logger.error({ err, conversationId: req.params.conversationId }, 'GET /admin/conversations/:conversationId/messages error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /admin/extensions:
 *   get:
 *     tags: [Admin]
 *     summary: List all extension requests
 *     description: Returns all access extension requests across all users with optional status filter. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, approved, denied]
 *         description: Filter by request status. Omit to return all.
 *     responses:
 *       200:
 *         description: Extension requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/ExtensionRequest'
 *                   - type: object
 *                     properties:
 *                       user_email:
 *                         type: string
 *                         format: email
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
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
adminRouter.get('/extensions', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = (req.query.status as string) || null;

    const result = await query(
      `SELECT
        r.id,
        r.user_id,
        u.email AS user_email,
        r.requested_hours,
        r.granted_hours,
        r.status,
        r.created_at,
        r.updated_at
      FROM access_extension_requests r
      JOIN users u ON u.id = r.user_id
      WHERE ($1::text IS NULL OR r.status = $1)
      ORDER BY r.created_at DESC`,
      [status],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'GET /admin/extensions error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /admin/users/{userId}/promote:
 *   patch:
 *     tags: [Admin]
 *     summary: Promote a user to admin
 *     description: Sets a user's role to admin. Cannot be used on your own account. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User promoted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Cannot change your own role
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
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
adminRouter.patch('/users/:userId/promote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const result = await query(
      `UPDATE users SET role = 'admin' WHERE id = $1 RETURNING id, email, role`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info({ promotedUserId: userId, byAdminId: req.user!.id }, 'User promoted to admin');
    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, 'PATCH /admin/users/:userId/promote error');
    res.status(500).json({ error: 'Internal server error' });
  }
});
