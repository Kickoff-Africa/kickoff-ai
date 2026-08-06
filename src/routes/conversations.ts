import { Router } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/authenticate';

export const conversationsRouter = Router();

// POST / — create a new conversation
conversationsRouter.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `INSERT INTO conversations (user_id) VALUES ($1) RETURNING id, title, created_at`,
      [userId],
    );
    const conversation = result.rows[0];
    return res.status(201).json({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
    });
  } catch (err) {
    console.error('POST /conversations error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / — list all conversations for the authenticated user
conversationsRouter.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `SELECT c.id, c.title, c.created_at,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_message_at
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId],
    );
    return res.status(200).json(result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
    })));
  } catch (err) {
    console.error('GET /conversations error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id — get a single conversation with its messages
conversationsRouter.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    const convResult = await query(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0];

    const messagesResult = await query(
      `SELECT id, role, content, model_used, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    return res.status(200).json({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      messages: messagesResult.rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        model_used: row.model_used,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    console.error(`GET /conversations/:id error:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
