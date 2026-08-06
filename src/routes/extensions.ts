import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { addExtensionToWindow } from '../services/access';

export const extensionsRouter = Router();

// POST /extensions/request — authenticated user submits a request
extensionsRouter.post('/request', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { hours } = req.body as { hours: unknown };

    if (hours !== 1 && hours !== 2 && hours !== 3) {
      res.status(400).json({ error: 'hours must be 1, 2, or 3' });
      return;
    }

    const userId = req.user!.id;

    // Check for existing pending request
    const existing = await query(
      `SELECT id FROM access_extension_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'You already have a pending extension request' });
      return;
    }

    // Insert new request
    const result = await query(
      `INSERT INTO access_extension_requests (user_id, requested_hours)
       VALUES ($1, $2)
       RETURNING id, requested_hours, status, created_at`,
      [userId, hours],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /extensions/request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /extensions/pending — admin only: list pending requests
extensionsRouter.get('/pending', authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT r.id, r.user_id, u.email AS user_email, r.requested_hours, r.status, r.created_at
       FROM access_extension_requests r
       JOIN users u ON r.user_id = u.id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`,
    );

    res.status(200).json({ requests: result.rows });
  } catch (err) {
    console.error('GET /extensions/pending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /extensions/:id/approve — admin only: approve request and grant time
extensionsRouter.post('/:id/approve', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { hours } = req.body as { hours: unknown };

    if (hours !== 1 && hours !== 2 && hours !== 3) {
      res.status(400).json({ error: 'hours must be 1, 2, or 3' });
      return;
    }

    const reviewerId = req.user!.id;

    // Fetch the request
    const requestResult = await query(
      `SELECT id, user_id, status FROM access_extension_requests WHERE id = $1`,
      [id],
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const extensionRequest = requestResult.rows[0] as { id: string; user_id: string; status: string };

    if (extensionRequest.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    // Update status
    await query(
      `UPDATE access_extension_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, id],
    );

    // Grant extension time
    await addExtensionToWindow(extensionRequest.user_id, (hours as number) * 3600);

    res.status(200).json({ message: 'Extension approved', granted_hours: hours });
  } catch (err) {
    console.error('POST /extensions/:id/approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /extensions/:id/deny — admin only: deny request
extensionsRouter.post('/:id/deny', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reviewerId = req.user!.id;

    // Fetch the request
    const requestResult = await query(
      `SELECT id, user_id, status FROM access_extension_requests WHERE id = $1`,
      [id],
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const extensionRequest = requestResult.rows[0] as { id: string; user_id: string; status: string };

    if (extensionRequest.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    // Update status
    await query(
      `UPDATE access_extension_requests
       SET status = 'denied', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [reviewerId, id],
    );

    res.status(200).json({ message: 'Extension denied' });
  } catch (err) {
    console.error('POST /extensions/:id/deny error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
