import { Request, Response, NextFunction } from 'express';
import { getRemainingSeconds } from '../services/access';
import { logger } from '../config/logger';

export async function checkAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const result = await getRemainingSeconds(req.user.id);

    // Attach access state to the response — frontend can read these after every request
    res.setHeader('X-Access-Seconds-Remaining', result.secondsRemaining);
    res.setHeader('X-Access-Seconds-Used', result.secondsUsed);
    res.setHeader('X-Access-Total-Allowed', result.totalAllowed);
    res.setHeader('X-Access-Window-Expires-At', result.windowExpiresAt.toISOString());

    if (result.secondsRemaining <= 0) {
      res.status(429).json({
        error: 'Access time exhausted',
        seconds_used: result.secondsUsed,
        total_allowed: result.totalAllowed,
        window_expires_at: result.windowExpiresAt,
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, 'Error checking access');
    res.status(500).json({ error: 'Failed to check access' });
  }
}
