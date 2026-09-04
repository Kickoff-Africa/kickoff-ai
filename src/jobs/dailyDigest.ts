// src/jobs/dailyDigest.ts
// Keeps a "current events" slice of the knowledge base fresh: once a day
// (plus once on startup), crawls each configured topic and replaces that
// topic's knowledge base entry in place, so chat retrieval always sees
// today's snapshot rather than an ever-growing pile of old news.
import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { config } from '../config/env';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { crawlForDigest, formatSearchResults } from '../services/webSearch';
import { upsertDocumentChunks, deleteDocumentChunks } from '../services/knowledgeBase';

function slugify(topic: string): string {
  return (
    'digest-' +
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

async function refreshTopic(topic: string): Promise<void> {
  const slug = slugify(topic);

  const results = await crawlForDigest(topic);
  if (results.length === 0) {
    logger.warn({ topic }, 'Daily digest: crawl returned no results, keeping previous entry');
    return;
  }

  const existing = await query(
    `SELECT id, chunk_count FROM knowledge_base_documents WHERE slug = $1`,
    [slug],
  );
  const documentId: string = existing.rows[0]?.id ?? randomUUID();

  if (existing.rows.length > 0) {
    await deleteDocumentChunks(documentId, existing.rows[0].chunk_count);
  }

  const title = `Daily digest: ${topic}`;
  const text = `${title}\nAs of ${new Date().toISOString()}\n\n${formatSearchResults(results)}`;
  const chunkCount = await upsertDocumentChunks(documentId, title, 'daily_digest', text);

  await query(
    `INSERT INTO knowledge_base_documents (id, title, filename, source, slug, chunk_count, uploaded_by)
     VALUES ($1, $2, NULL, 'daily_digest', $3, $4, NULL)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       chunk_count = EXCLUDED.chunk_count,
       updated_at = NOW()`,
    [documentId, title, slug, chunkCount],
  );

  logger.info({ topic, chunkCount }, 'Daily digest: topic refreshed');
}

export async function runDailyDigest(): Promise<void> {
  logger.info({ topics: config.dailyDigestTopics }, 'Daily digest job started');

  for (const topic of config.dailyDigestTopics) {
    try {
      await refreshTopic(topic);
    } catch (err) {
      logger.error({ topic, err: (err as Error).message }, 'Daily digest: topic refresh failed');
    }
  }

  logger.info('Daily digest job finished');
}

export function startDailyDigestJob(): void {
  cron.schedule(config.dailyDigestCronSchedule, () => {
    runDailyDigest().catch((err) => {
      logger.error({ err: (err as Error).message }, 'Daily digest job crashed');
    });
  });

  // Also run once on boot so a fresh deploy has current data immediately
  // rather than waiting for the next scheduled time.
  runDailyDigest().catch((err) => {
    logger.error({ err: (err as Error).message }, 'Daily digest initial run failed');
  });

  logger.info({ schedule: config.dailyDigestCronSchedule }, 'Daily digest job scheduled');
}
