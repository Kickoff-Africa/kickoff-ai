import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import { pool, query } from './config/database';
import { authRouter } from './routes/auth';
import { accessRouter } from './routes/access';
import { extensionsRouter } from './routes/extensions';
import { conversationsRouter } from './routes/conversations';
import { messagesRouter } from './routes/messages';
import { adminRouter } from './routes/admin';

export const app = express();

app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map(o => o.trim()),
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: config.corsOrigin !== '*',
}));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/auth', authRouter);
app.use('/access', accessRouter);
app.use('/extensions', extensionsRouter);
app.use('/conversations', conversationsRouter);
app.use('/conversations', messagesRouter);
app.use('/admin', adminRouter);

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
}

start();
