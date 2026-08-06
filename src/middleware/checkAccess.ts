import { Request, Response, NextFunction } from 'express';
import { getRemainingSeconds } from '../services/access';

export async function checkAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const result = await getRemainingSeconds(req.user.id);

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
    console.error('Error checking access:', err);
    res.status(500).json({ error: 'Failed to check access' });
  }
}
