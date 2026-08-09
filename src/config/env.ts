import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireUrl(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    throw new Error(`${name} must include the protocol (e.g. https://). Got: "${value}"`);
  }
  return value.replace(/\/$/, ''); // strip trailing slash
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiry: process.env.JWT_EXPIRY ?? '24h',
  magicLinkExpiryMinutes: parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15', 10),
  useSendApiKey: requireEnv('USESEND_API_KEY'),
  useSendBaseUrl: process.env.USESEND_BASE_URL ?? 'https://app.usesend.com/api',
  emailFrom: process.env.EMAIL_FROM ?? 'noreply@kickoff.africa',
  appUrl: requireUrl('APP_URL', 'http://localhost:3000'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? null,
  adminEmail: requireEnv('ADMIN_EMAIL'),
  anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
};
