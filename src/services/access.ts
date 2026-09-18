import { query } from '../config/database';

// Free tokens granted per 12-hour rolling window, before any approved
// extensions. Tokens (prompt + completion, same figure already stored per
// message in messages.tokens_used) rather than wall-clock seconds, since a
// fast cloud model can burn through a large token budget in very little
// time — "seconds of generation time" stopped being a meaningful cap once
// chat moved off the old CPU-bound self-hosted box.
const DEFAULT_TOKEN_BUDGET = 50_000;

export interface AccessWindow {
  id: string;
  userId: string;
  windowStart: Date;
  tokensUsed: number;
  extensionTokens: number;
  createdAt: Date;
}

function mapRow(row: {
  id: string;
  user_id: string;
  window_start: Date;
  tokens_used: number;
  extension_tokens: number;
  created_at: Date;
}): AccessWindow {
  return {
    id: row.id,
    userId: row.user_id,
    windowStart: row.window_start,
    tokensUsed: row.tokens_used,
    extensionTokens: row.extension_tokens,
    createdAt: row.created_at,
  };
}

export async function getOrCreateWindow(userId: string): Promise<AccessWindow> {
  const selectResult = await query(
    `SELECT * FROM access_windows
     WHERE user_id = $1 AND window_start > NOW() - INTERVAL '12 hours'
     ORDER BY window_start DESC
     LIMIT 1`,
    [userId],
  );

  if (selectResult.rows.length > 0) {
    return mapRow(selectResult.rows[0]);
  }

  const insertResult = await query(
    `INSERT INTO access_windows (user_id, window_start, tokens_used, extension_tokens)
     VALUES ($1, NOW(), 0, 0)
     RETURNING *`,
    [userId],
  );

  return mapRow(insertResult.rows[0]);
}

export async function getRemainingTokens(userId: string): Promise<{
  tokensUsed: number;
  totalAllowed: number;
  tokensRemaining: number;
  windowStart: Date;
  windowExpiresAt: Date;
}> {
  const window = await getOrCreateWindow(userId);
  const totalAllowed = DEFAULT_TOKEN_BUDGET + window.extensionTokens;
  const tokensRemaining = Math.max(0, totalAllowed - window.tokensUsed);
  const windowExpiresAt = new Date(window.windowStart.getTime() + 12 * 60 * 60 * 1000);

  return {
    tokensUsed: window.tokensUsed,
    totalAllowed,
    tokensRemaining,
    windowStart: window.windowStart,
    windowExpiresAt,
  };
}

export async function addUsage(userId: string, tokens: number): Promise<void> {
  const window = await getOrCreateWindow(userId);
  await query(
    `UPDATE access_windows SET tokens_used = tokens_used + $1 WHERE id = $2`,
    [Math.max(0, Math.round(tokens)), window.id],
  );
}

export async function addExtensionToWindow(userId: string, extraTokens: number): Promise<void> {
  const window = await getOrCreateWindow(userId);
  await query(
    `UPDATE access_windows SET extension_tokens = extension_tokens + $1 WHERE id = $2`,
    [extraTokens, window.id],
  );
}
