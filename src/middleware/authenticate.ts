import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../services/token';
import { query } from '../config/database';

// Extend Express Request to include `user`
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        jti: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);

  let decoded: ReturnType<typeof verifyJWT>;
  try {
    decoded = verifyJWT(token);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Check session is active (not revoked, not expired)
  const sessionResult = await query(
    `SELECT id FROM user_sessions
     WHERE jwt_jti = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [decoded.jti],
  );

  if (sessionResult.rows.length === 0) {
    res.status(401).json({ error: 'Session expired or revoked' });
    return;
  }

  // Fetch user details
  const userResult = await query(
    `SELECT id, email, role FROM users WHERE id = $1`,
    [decoded.sub],
  );

  if (userResult.rows.length === 0) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  const user = userResult.rows[0] as { id: string; email: string; role: string };

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    jti: decoded.jti,
  };

  next();
}
