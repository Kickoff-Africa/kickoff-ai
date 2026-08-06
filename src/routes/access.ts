import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getRemainingSeconds } from '../services/access';
import { logger } from '../config/logger';

export const accessRouter = Router();

/**
 * @openapi
 * /access/status:
 *   get:
 *     tags: [Access]
 *     summary: Get remaining AI access time
 *     description: Returns the authenticated user's current access window usage and remaining time.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access window status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccessStatus'
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
accessRouter.get('/status', authenticate, async (req, res) => {
  try {
    const result = await getRemainingSeconds(req.user!.id);
    res.status(200).json({
      seconds_used: result.secondsUsed,
      total_allowed: result.totalAllowed,
      seconds_remaining: result.secondsRemaining,
      window_start: result.windowStart,
      window_expires_at: result.windowExpiresAt,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Error fetching access status');
    res.status(500).json({ error: 'Failed to fetch access status' });
  }
});
