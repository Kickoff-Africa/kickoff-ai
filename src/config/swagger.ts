import swaggerJsdoc from 'swagger-jsdoc';

const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

const servers = [{ url: appUrl, description: appUrl.includes('localhost') ? 'Local development' : 'Production' }];

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KickoffAI API',
      version: '1.0.0',
      description:
        'Internal AI chat backend for Kickoff Africa. Org members authenticate via magic link, consume Claude-powered chat within a metered access window, and admins govern users and extensions.',
      contact: {
        name: 'Kickoff Africa',
        email: 'work@kickoff.africa',
      },
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT issued by POST /auth/verify after magic-link authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal server error' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['user', 'admin'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            last_message_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
            model_used: { type: 'string', nullable: true },
            tokens_used: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        ExtensionRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            requested_hours: { type: 'integer', enum: [1, 2, 3] },
            granted_hours: { type: 'integer', nullable: true },
            status: { type: 'string', enum: ['pending', 'approved', 'denied'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        AccessStatus: {
          type: 'object',
          properties: {
            seconds_used: { type: 'number' },
            total_allowed: { type: 'number' },
            seconds_remaining: { type: 'number' },
            window_start: { type: 'string', format: 'date-time' },
            window_expires_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
