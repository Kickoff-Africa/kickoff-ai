import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/authenticate';

export const adminRouter = Router();

// All admin routes require authenticate + requireAdmin
adminRouter.use(authenticate, requireAdmin);

// GET /admin/users — all users with current-window usage statistics
adminRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        COALESCE(w.seconds_used, 0) AS seconds_used,
        COALESCE(w.seconds_used + w.extension_seconds, 3600) AS total_allowed,
        w.window_start,
        w.window_start + INTERVAL '12 hours' AS window_expires_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT seconds_used, extension_seconds, window_start
        FROM access_windows
        WHERE user_id = u.id
          AND window_start > NOW() - INTERVAL '12 hours'
        ORDER BY window_start DESC
        LIMIT 1
      ) w ON true
      ORDER BY u.created_at ASC`,
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/users/:userId/conversations — all conversations for a specific user (no ownership check)
adminRouter.get('/users/:userId/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT
        c.id,
        c.title,
        c.created_at,
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) AS last_message_at
      FROM conversations c
      WHERE c.user_id = $1
      ORDER BY last_message_at DESC NULLS LAST`,
      [userId],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('GET /admin/users/:userId/conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/conversations/:conversationId/messages — full conversation + messages (no ownership restriction)
adminRouter.get('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    const convResult = await query(
      `SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = $1`,
      [conversationId],
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const conversation = convResult.rows[0];

    const messagesResult = await query(
      `SELECT id, role, content, model_used, tokens_used, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    res.status(200).json({ conversation: { ...conversation, messages: messagesResult.rows } });
  } catch (err) {
    console.error('GET /admin/conversations/:conversationId/messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/extensions — all extension requests with optional ?status= filter
adminRouter.get('/extensions', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = (req.query.status as string) || null;

    const result = await query(
      `SELECT
        r.id,
        r.user_id,
        u.email AS user_email,
        r.requested_hours,
        r.granted_hours,
        r.status,
        r.created_at,
        r.updated_at
      FROM access_extension_requests r
      JOIN users u ON u.id = r.user_id
      WHERE ($1::text IS NULL OR r.status = $1)
      ORDER BY r.created_at DESC`,
      [status],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('GET /admin/extensions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/users/:userId/promote — promote a user to admin role
adminRouter.patch('/users/:userId/promote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const result = await query(
      `UPDATE users SET role = 'admin' WHERE id = $1 RETURNING id, email, role`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('PATCH /admin/users/:userId/promote error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
