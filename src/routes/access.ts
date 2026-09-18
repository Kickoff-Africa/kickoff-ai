import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getRemainingTokens } from '../services/access';
import { logger } from '../config/logger';

export const accessRouter = Router();

/**
 * @openapi
 * /access/status:
 *   get:
 *     tags: [Access]
 *     summary: Get remaining AI token budget
 *     description: Returns the authenticated user's current access window usage and remaining token budget.
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
    const result = await getRemainingTokens(req.user!.id);
    res.status(200).json({
      tokens_used: result.tokensUsed,
      total_allowed: result.totalAllowed,
      tokens_remaining: result.tokensRemaining,
      window_start: result.windowStart,
      window_expires_at: result.windowExpiresAt,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Error fetching access status');
    res.status(500).json({ error: 'Failed to fetch access status' });
  }
});
