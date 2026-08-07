import { Resend } from 'resend';
import { config } from '../config/env';
import { logger } from '../config/logger';

const resend = new Resend(config.resendApiKey);

export async function sendMagicLinkEmail(to: string, token: string): Promise<void> {
  const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    logger.info({ to, magicLink }, 'Magic link generated (dev)');
  }

  const { error } = await resend.emails.send({
    from: config.emailFrom,
    to,
    subject: 'Your KickoffAI Login Link',
    html: `
      <p>Hello,</p>
      <p>Click the link below to log in to KickoffAI:</p>
      <p><a href="${magicLink}">${magicLink}</a></p>
      <p>This link expires in ${config.magicLinkExpiryMinutes} minutes and can only be used once.</p>
      <p>If you did not request this link, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    logger.error({ error, to }, 'Failed to send magic link email');
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
