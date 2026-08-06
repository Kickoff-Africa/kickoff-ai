import { query } from '../config/database';

export interface AccessWindow {
  id: string;
  userId: string;
  windowStart: Date;
  secondsUsed: number;
  extensionSeconds: number;
  createdAt: Date;
}

function mapRow(row: {
  id: string;
  user_id: string;
  window_start: Date;
  seconds_used: number;
  extension_seconds: number;
  created_at: Date;
}): AccessWindow {
  return {
    id: row.id,
    userId: row.user_id,
    windowStart: row.window_start,
    secondsUsed: row.seconds_used,
    extensionSeconds: row.extension_seconds,
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
    `INSERT INTO access_windows (user_id, window_start, seconds_used, extension_seconds)
     VALUES ($1, NOW(), 0, 0)
     RETURNING *`,
    [userId],
  );

  return mapRow(insertResult.rows[0]);
}

export async function getRemainingSeconds(userId: string): Promise<{
  secondsUsed: number;
  totalAllowed: number;
  secondsRemaining: number;
  windowStart: Date;
  windowExpiresAt: Date;
}> {
  const window = await getOrCreateWindow(userId);
  const totalAllowed = 3600 + window.extensionSeconds;
  const secondsRemaining = Math.max(0, totalAllowed - window.secondsUsed);
  const windowExpiresAt = new Date(window.windowStart.getTime() + 12 * 60 * 60 * 1000);

  return {
    secondsUsed: window.secondsUsed,
    totalAllowed,
    secondsRemaining,
    windowStart: window.windowStart,
    windowExpiresAt,
  };
}

export async function addUsage(userId: string, seconds: number): Promise<void> {
  const window = await getOrCreateWindow(userId);
  await query(
    `UPDATE access_windows SET seconds_used = seconds_used + $1 WHERE id = $2`,
    [seconds, window.id],
  );
}

export async function addExtensionToWindow(userId: string, extraSeconds: number): Promise<void> {
  const window = await getOrCreateWindow(userId);
  await query(
    `UPDATE access_windows SET extension_seconds = extension_seconds + $1 WHERE id = $2`,
    [extraSeconds, window.id],
  );
}
