import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { generateMagicToken, createJWT } from '../services/token';
import { sendMagicLinkEmail } from '../services/email';
import { authenticate } from '../middleware/authenticate';

export const authRouter = Router();

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

/**
 * @openapi
 * /auth/request-magic-link:
 *   post:
 *     tags: [Auth]
 *     summary: Request a magic login link
 *     description: Sends a one-time login link to the provided org email address. Creates the user account if it does not exist.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@kickoff.africa
 *     responses:
 *       200:
 *         description: Magic link sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Magic link sent to your email
 *       400:
 *         description: Email missing or invalid
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
authRouter.post('/request-magic-link', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email || email.trim() === '') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const userResult = await query(
      `INSERT INTO users (email)
       VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id, email, role`,
      [email.trim().toLowerCase()],
    );
    const user = userResult.rows[0] as { id: string; email: string; role: string };

    const token = generateMagicToken();

    await query(
      `INSERT INTO magic_link_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
      [user.id, token, config.magicLinkExpiryMinutes.toString()],
    );

    await sendMagicLinkEmail(user.email, token);

    logger.info({ userId: user.id, email: user.email }, 'Magic link sent');
    res.status(200).json({ message: 'Magic link sent to your email' });
  } catch (err) {
    logger.error({ err }, 'Error in /auth/request-magic-link');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /auth/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verify a magic link token
 *     description: Validates the one-time token from the magic link email and returns a JWT for subsequent requests.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The magic link token from the email
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT bearer token
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Token missing, invalid, or expired
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
authRouter.get('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query as { token?: string };

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

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

    await query(
      `UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1`,
      [magicToken.id],
    );

    const userResult = await query(
      `SELECT id, email, role FROM users WHERE id = $1`,
      [magicToken.user_id],
    );
    const user = userResult.rows[0] as { id: string; email: string; role: string };

    const { token: jwtToken, jti } = createJWT(user.id, user.email, user.role);

    const expirySeconds = parseExpiryToSeconds(config.jwtExpiry);
    await query(
      `INSERT INTO user_sessions (user_id, jwt_jti, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL)`,
      [user.id, jti, expirySeconds.toString()],
    );

    logger.info({ userId: user.id, email: user.email }, 'User authenticated');
    res.status(200).json({
      token: jwtToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error({ err }, 'Error in /auth/verify');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Returns the authenticated user's profile from the JWT.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.status(200).json({ user: req.user });
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout
 *     description: Revokes the current JWT session. The token will be rejected on future requests.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
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
authRouter.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    await query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE jwt_jti = $1`,
      [req.user!.jti],
    );
    logger.info({ userId: req.user!.id }, 'User logged out');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Error in /auth/logout');
    res.status(500).json({ error: 'Internal server error' });
  }
});
