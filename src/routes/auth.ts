import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { config } from '../config/env';
import { generateMagicToken, createJWT } from '../services/token';
import { sendMagicLinkEmail } from '../services/email';
import { authenticate } from '../middleware/authenticate';

export const authRouter = Router();

/**
 * Parse a JWT expiry string like "24h", "7d", "60m" into seconds.
 * Falls back to 86400 (24h) on parse failure.
 */
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 86400;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default:  return 86400;
  }
}

// POST /auth/request-magic-link
authRouter.post('/request-magic-link', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email || email.trim() === '') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Find or create user
    const userResult = await query(
      `INSERT INTO users (email)
       VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id, email, role`,
      [email.trim().toLowerCase()],
    );
    const user = userResult.rows[0] as { id: string; email: string; role: string };

    // Generate magic token
    const token = generateMagicToken();

    // Store token in DB
    await query(
      `INSERT INTO magic_link_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
      [user.id, token, config.magicLinkExpiryMinutes.toString()],
    );

    // Send email (logs to console in dev)
    await sendMagicLinkEmail(user.email, token);

    res.status(200).json({ message: 'Magic link sent to your email' });
  } catch (err) {
    console.error('Error in /request-magic-link:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/verify?token=xxx
authRouter.get('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query as { token?: string };

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    // Look up the magic link token
    const tokenResult = await query(
      `SELECT id, user_id
       FROM magic_link_tokens
       WHERE token = $1
         AND used_at IS NULL
         AND expires_at > NOW()`,
      [token],
    );

    if (tokenResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }

    const magicToken = tokenResult.rows[0] as { id: string; user_id: string };

    // Mark token as used
    await query(
      `UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1`,
      [magicToken.id],
    );

    // Fetch user
    const userResult = await query(
      `SELECT id, email, role FROM users WHERE id = $1`,
      [magicToken.user_id],
    );
    const user = userResult.rows[0] as { id: string; email: string; role: string };

    // Create JWT
    const { token: jwtToken, jti } = createJWT(user.id, user.email, user.role);

    // Store session
    const expirySeconds = parseExpiryToSeconds(config.jwtExpiry);
    await query(
      `INSERT INTO user_sessions (user_id, jwt_jti, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL)`,
      [user.id, jti, expirySeconds.toString()],
    );

    res.status(200).json({
      token: jwtToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Error in /verify:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/me (protected)
authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.status(200).json({ user: req.user });
});

// POST /auth/logout (protected)
authRouter.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    await query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE jwt_jti = $1`,
      [req.user!.jti],
    );
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error in /logout:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
