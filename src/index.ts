import express from 'express';
import { config } from './config/env';
import { pool, query } from './config/database';
import { authRouter } from './routes/auth';
import { accessRouter } from './routes/access';
import { extensionsRouter } from './routes/extensions';
import { conversationsRouter } from './routes/conversations';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/access', accessRouter);
app.use('/extensions', extensionsRouter);
app.use('/conversations', conversationsRouter);

async function start(): Promise<void> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log(`Database connected at ${result.rows[0].now}`);
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }

  // Seed admin user on startup
  try {
    const seedResult = await query(
      `INSERT INTO users (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [config.adminEmail, 'admin'],
    );
    if (seedResult.rowCount && seedResult.rowCount > 0) {
      console.log(`Admin user ${config.adminEmail} created`);
    } else {
      console.log(`Admin user ${config.adminEmail} already exists`);
    }
  } catch (err) {
    console.error('Failed to seed admin user:', err);
  }

  app.listen(config.port, () => {
    console.log(`KickoffAI server running on port ${config.port}`);
  });
}

start();
