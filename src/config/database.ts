import { Pool } from 'pg';
import { config } from './env';

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function query(text: string, params?: unknown[]): Promise<import('pg').QueryResult> {
  return pool.query(text, params);
}
