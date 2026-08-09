import { config } from '../config/env';
import { logger } from '../config/logger';

export async function sendMagicLinkEmail(to: string, token: string): Promise<void> {
  const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    logger.info({ to, magicLink }, 'Magic link generated (dev)');
  }

  const response = await fetch(`${config.useSendBaseUrl}/v1/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.useSendApiKey}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body, to }, 'Failed to send magic link email');
    throw new Error(`Email delivery failed: ${response.status} ${body}`);
  }

  const { emailId } = await response.json() as { emailId: string };
  logger.info({ emailId, to }, 'Magic link email sent');
}
