import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { addExtensionToWindow } from '../services/access';

export const extensionsRouter = Router();

/**
 * @openapi
 * /extensions/request:
 *   post:
 *     tags: [Extensions]
 *     summary: Submit an access extension request
 *     description: Submits a request for additional AI access time (+1, +2, or +3 hours). Only one pending request is allowed at a time.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hours]
 *             properties:
 *               hours:
 *                 type: integer
 *                 enum: [1, 2, 3]
 *                 example: 2
 *     responses:
 *       201:
 *         description: Request submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExtensionRequest'
 *       400:
 *         description: Invalid hours value
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
 *       409:
 *         description: Pending request already exists
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
extensionsRouter.post('/request', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { hours } = req.body as { hours: unknown };

    if (hours !== 1 && hours !== 2 && hours !== 3) {
      res.status(400).json({ error: 'hours must be 1, 2, or 3' });
      return;
    }

    const userId = req.user!.id;

    const existing = await query(
      `SELECT id FROM access_extension_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'You already have a pending extension request' });
      return;
    }

    const result = await query(
      `INSERT INTO access_extension_requests (user_id, requested_hours)
       VALUES ($1, $2)
       RETURNING id, requested_hours, status, created_at`,
      [userId, hours],
    );

    logger.info({ userId, hours }, 'Extension request submitted');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'POST /extensions/request error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /extensions/pending:
 *   get:
 *     tags: [Extensions]
 *     summary: List pending extension requests (admin)
 *     description: Returns all pending access extension requests. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/ExtensionRequest'
 *                       - type: object
 *                         properties:
 *                           user_email:
 *                             type: string
 *                             format: email
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
extensionsRouter.get('/pending', authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT r.id, r.user_id, u.email AS user_email, r.requested_hours, r.status, r.created_at
       FROM access_extension_requests r
       JOIN users u ON r.user_id = u.id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`,
    );

    res.status(200).json({ requests: result.rows });
  } catch (err) {
    logger.error({ err }, 'GET /extensions/pending error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /extensions/{id}/approve:
 *   post:
 *     tags: [Extensions]
 *     summary: Approve an extension request (admin)
 *     description: Approves a pending extension request and immediately adds the granted time to the user's current access window. The admin may grant a different number of hours than requested.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             required: [hours]
 *             properties:
 *               hours:
 *                 type: integer
 *                 enum: [1, 2, 3]
 *                 example: 1
 *     responses:
 *       200:
 *         description: Extension approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 granted_hours:
 *                   type: integer
 *       400:
 *         description: Invalid hours value
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
 *         description: Request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Request is not pending
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
extensionsRouter.post('/:id/approve', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { hours } = req.body as { hours: unknown };

    if (hours !== 1 && hours !== 2 && hours !== 3) {
      res.status(400).json({ error: 'hours must be 1, 2, or 3' });
      return;
    }

    const reviewerId = req.user!.id;

    const requestResult = await query(
      `SELECT id, user_id, status FROM access_extension_requests WHERE id = $1`,
      [id],
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const extensionRequest = requestResult.rows[0] as { id: string; user_id: string; status: string };

    if (extensionRequest.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    await query(
      `UPDATE access_extension_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, id],
    );

    await addExtensionToWindow(extensionRequest.user_id, (hours as number) * 3600);

    logger.info({ requestId: id, reviewerId, grantedHours: hours, userId: extensionRequest.user_id }, 'Extension approved');
    res.status(200).json({ message: 'Extension approved', granted_hours: hours });
  } catch (err) {
    logger.error({ err, requestId: req.params.id }, 'POST /extensions/:id/approve error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /extensions/{id}/deny:
 *   post:
 *     tags: [Extensions]
 *     summary: Deny an extension request (admin)
 *     description: Denies a pending access extension request. Admin only.
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
 *         description: Extension denied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Extension denied
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
 *         description: Request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Request is not pending
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
extensionsRouter.post('/:id/deny', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reviewerId = req.user!.id;

    const requestResult = await query(
      `SELECT id, user_id, status FROM access_extension_requests WHERE id = $1`,
      [id],
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const extensionRequest = requestResult.rows[0] as { id: string; user_id: string; status: string };

    if (extensionRequest.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    await query(
      `UPDATE access_extension_requests
       SET status = 'denied', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, id],
    );

    logger.info({ requestId: id, reviewerId }, 'Extension denied');
    res.status(200).json({ message: 'Extension denied' });
  } catch (err) {
    logger.error({ err, requestId: req.params.id }, 'POST /extensions/:id/deny error');
    res.status(500).json({ error: 'Internal server error' });
  }
});
