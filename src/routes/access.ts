import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getRemainingSeconds } from '../services/access';

export const accessRouter = Router();

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
    console.error('Error fetching access status:', err);
    res.status(500).json({ error: 'Failed to fetch access status' });
  }
});
