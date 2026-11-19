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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── Public (no-login) chat access ───────────────────────────────────────────
// Chat endpoints on this branch are open: no Bearer token required. Callers
// without a valid token are attributed to a single shared guest user, since
// conversations/messages/usage rows all require a user_id. A valid token is
// still honoured, so existing logged-in clients keep their own history.
const GUEST_EMAIL = 'guest@public.local';
let guestUser: { id: string; email: string; role: string } | null = null;

async function getGuestUser() {
  if (guestUser) return guestUser;
  const result = await query(
    `INSERT INTO users (email, role) VALUES ($1, 'user')
     ON CONFLICT (email) DO UPDATE SET updated_at = users.updated_at
     RETURNING id, email, role`,
    [GUEST_EMAIL],
  );
  guestUser = result.rows[0] as { id: string; email: string; role: string };
  return guestUser;
}

export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = verifyJWT(authHeader.slice(7));
      const session = await query(
        `SELECT u.id, u.email, u.role FROM user_sessions s
         JOIN users u ON u.id = $2
         WHERE s.jwt_jti = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
        [decoded.jti, decoded.sub],
      );
      if (session.rows.length > 0) {
        const u = session.rows[0] as { id: string; email: string; role: string };
        req.user = { id: u.id, email: u.email, role: u.role, jti: decoded.jti };
        next();
        return;
      }
    } catch {
      // invalid/expired token → fall through to guest
    }
  }

  try {
    const g = await getGuestUser();
    req.user = { id: g.id, email: g.email, role: 'user', jti: 'guest' };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to initialise guest session' });
  }
}
