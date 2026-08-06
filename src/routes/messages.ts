import { Router } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/authenticate';
import { checkAccess } from '../middleware/checkAccess';
import { classifyComplexity, getModelForComplexity, chat } from '../services/claude';
import { addUsage } from '../services/access';

export const messagesRouter = Router({ mergeParams: true });

// POST /conversations/:conversationId/messages
messagesRouter.post('/:conversationId/messages', authenticate, checkAccess, async (req, res) => {
  try {
    const startTime = Date.now();
    const { content } = req.body;

    // 1. Validate input
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const userId = req.user!.id;
    const { conversationId } = req.params;

    // 2. Verify ownership
    const convResult = await query(
      `SELECT id, title FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0] as { id: string; title: string | null };

    // 3. Insert user message
    await query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, content],
    );

    // 4. Load full conversation history for context
    const historyResult = await query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );

    const historyRows = historyResult.rows as Array<{ role: 'user' | 'assistant'; content: string }>;

    // 5. Classify and route
    const complexity = await classifyComplexity(content);
    const model = getModelForComplexity(complexity);

    // 6. Call Claude
    const { content: assistantContent, tokensUsed } = await chat(historyRows, model);

    // 7. Insert assistant message
    const assistantResult = await query(
      `INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING id, role, content, model_used, tokens_used, created_at`,
      [conversationId, assistantContent, model, tokensUsed],
    );

    const assistantMessage = assistantResult.rows[0];

    // 8. Auto-title or update updated_at
    if (conversation.title === null) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await query(
        `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
        [title, conversationId],
      );
    } else {
      await query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    }

    // 9. Track usage
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    await addUsage(userId, elapsedSeconds);

    return res.status(201).json({
      message: assistantMessage,
      model_used: model,
      tokens_used: tokensUsed,
    });
  } catch (err) {
    console.error('POST /conversations/:conversationId/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
