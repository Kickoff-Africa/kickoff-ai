import express from 'express';
import { config } from './config/env';
import { pool } from './config/database';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start(): Promise<void> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log(`Database connected at ${result.rows[0].now}`);
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`KickoffAI server running on port ${config.port}`);
  });
}

start();
