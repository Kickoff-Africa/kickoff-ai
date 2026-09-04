import './polyfills';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import { generateDocsHtml } from './docs/docsUi';
import { docsClientJs } from './docs/docsClient';
import { pool, query } from './config/database';
import { authRouter } from './routes/auth';
import { accessRouter } from './routes/access';
import { extensionsRouter } from './routes/extensions';
import { conversationsRouter } from './routes/conversations';
import { messagesRouter } from './routes/messages';
import { adminRouter } from './routes/admin';
import { knowledgeBaseRouter } from './routes/knowledgeBase';
import { startDailyDigestJob } from './jobs/dailyDigest';

export const app = express();

const corsOptions: cors.CorsOptions = {
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: [
    'X-Access-Seconds-Remaining',
    'X-Access-Seconds-Used',
    'X-Access-Total-Allowed',
    'X-Access-Window-Expires-At',
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 204,
};

// Handle preflight for all routes
app.options('/{*path}', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve OpenAPI spec as JSON
app.get('/docs/spec.json', (_req, res) => {
  res.json(swaggerSpec);
});

// Serve custom API docs UI
app.get('/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(generateDocsHtml());
});

// Serve docs client JS (separate file avoids template literal escaping issues)
app.get('/docs/client.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(docsClientJs);
});

app.use('/auth', authRouter);
app.use('/access', accessRouter);
app.use('/extensions', extensionsRouter);
app.use('/conversations', conversationsRouter);
app.use('/conversations', messagesRouter);
app.use('/admin', adminRouter);
app.use('/admin/knowledge-base', knowledgeBaseRouter);

async function start(): Promise<void> {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info({ connectedAt: result.rows[0].now }, 'Database connected');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to database');
    process.exit(1);
  }

  try {
    const seedResult = await query(
      `INSERT INTO users (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [config.adminEmail, 'admin'],
    );
    if (seedResult.rowCount && seedResult.rowCount > 0) {
      logger.info({ email: config.adminEmail }, 'Admin user created');
    } else {
      logger.debug({ email: config.adminEmail }, 'Admin user already exists');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to seed admin user');
  }

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'KickoffAI server started');
    logger.info({ url: `http://localhost:${config.port}/docs` }, 'API docs available');
  });

  startDailyDigestJob();
}

start();
